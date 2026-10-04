import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  stagedPathsNeedingChecks, checkStagedState, cleanGitEnv, CHECKS,
} = require('./precommit-artifacts');
const installHooks = require('./install-hooks');
const { PUBLIC_PAGES } = require('./indexnow-urls');
void installHooks;

const REAL_ROOT = path.resolve(__dirname, '..');
const FIRST_COMMIT = '2024-02-03';

/*
 * The hook exists because of one asymmetry: a staged edit is *dirty* by
 * definition, so every `--check` mode exempts it — the rendition is "in
 * progress". But the index is not a work-in-progress, it is what the
 * commit publishes. These tests pin both halves of that: the pure filter
 * that decides whether there is anything to check at all, and the hook's
 * verdict on a real scratch repository, asserted against the same tree's
 * own lenient answer so the difference is visible rather than asserted.
 */
describe('staged paths the artifact checks read', () => {
  it('notices a page, a rendition, the sitemap, the allowlist, the URL list and a checker', () => {
    expect(stagedPathsNeedingChecks([
      'client/pricing.html',            // page → rendition + CSP hashes
      'client/public/oauth-return.html', // a page in the second directory
      'client/public/pricing.md',        // a rendition
      'client/public/sitemap.xml',       // the sitemap
      'server/securityHeaders.js',       // the CSP allowlist
      'scripts/indexnow-urls.js',        // where the URL list comes from
      'scripts/generate-sitemap.js',     // a checker, checked by itself
      'scripts/worktree.js',
      'scripts/run-macos.sh',            // a shell script → the bash -n check
      'docs/release-notes/v1.6.7/ios58-android58.md', // store-copy caps
    ])).toHaveLength(10);
  });

  it('ignores work no generated artifact depends on', () => {
    // Most commits in this repository are these: native clients, the
    // server's own logic, and documentation. The hook must be silent
    // and instant for them.
    expect(stagedPathsNeedingChecks([
      'ios/FiHavenApp/Sources/Main/BudgetView.swift',
      'android/app/build.gradle.kts',
      'server/index.js',
      'docs/maintainer/follow-ups.md',
      'README.md',
      'package-lock.json',
    ])).toEqual([]);
  });

  it('has no verdict at all when git cannot answer', () => {
    expect(stagedPathsNeedingChecks(null)).toEqual([]);
    expect(stagedPathsNeedingChecks([])).toEqual([]);
  });
});

describe('the pre-commit hook, on a scratch repository', () => {
  let repo;

  /** Run one of the repository's own scripts inside the fixture. */
  const generate = (script) => {
    const res = spawnSync(process.execPath, [path.join(repo, script)], { cwd: repo, encoding: 'utf8' });
    if (res.status !== 0) {
      throw new Error(`${script} failed in the fixture: ${res.stderr || res.stdout}`);
    }
  };

  const git = (args, env = {}) => execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: `${FIRST_COMMIT}T12:00:00+00:00`,
      GIT_COMMITTER_DATE: `${FIRST_COMMIT}T12:00:00+00:00`,
      ...env,
    },
  });

  const write = (rel, body) => {
    const full = path.join(repo, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  };

  const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');

  /** Run one checker the ordinary way, in this tree, with the staged state. */
  const checkInRepo = (script) => spawnSync(process.execPath, [path.join(repo, script), '--check'], {
    cwd: repo, encoding: 'utf8',
  });

  const page = (name, heading) => `<!doctype html><html><head><title>${name}</title></head>`
    + `<body><main><h1>${heading}</h1><p>Fixture page for the pre-commit hook.</p></main></body></html>`;

  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-precommit-test-'));
    // The checkers, verbatim, and the allowlist they compare against: the
    // hook runs the *staged* copies, so a change to a checker is checked by
    // itself, and the test has to be able to say so.
    fs.cpSync(path.join(REAL_ROOT, 'scripts'), path.join(repo, 'scripts'), { recursive: true });
    // The generators import jsdom, which lives in this repository's install.
    // Before anything runs, not after: a fixture that cannot resolve it looks
    // like a generator failure.
    fs.symlinkSync(path.join(REAL_ROOT, 'node_modules'), path.join(repo, 'node_modules'));
    write('server/securityHeaders.js', fs.readFileSync(path.join(REAL_ROOT, 'server', 'securityHeaders.js'), 'utf8'));
    write('package.json', '{\n  "name": "fihaven-hook-fixture",\n  "private": true\n}\n');
    // The generators write into client/public/ and do not create it; the real
    // repository has it because a page lives there.
    fs.mkdirSync(path.join(repo, 'client', 'public'), { recursive: true });
    // The issuer table, verbatim, and somewhere for its port to land. The hook
    // runs this check too, and a fixture without the table makes it fail for
    // the uninteresting reason that it cannot read its input.
    write('client/js/issuerLogos.js', fs.readFileSync(path.join(REAL_ROOT, 'client', 'js', 'issuerLogos.js'), 'utf8'));
    for (const dir of ['ios/FiHavenCore/Sources/FiHavenCore/Logic', 'android/core/src/main/kotlin/app/fihaven/core/logic']) {
      fs.mkdirSync(path.join(repo, dir), { recursive: true });
    }
    // No inline <script> in these pages, so the CSP allowlist has nothing to
    // be stale about and the failures below are only about what is being tested.
    for (const p of PUBLIC_PAGES) write(path.join('client', p.file), page(p.file, 'Hello'));

    git(['init', '-q']);
    git(['add', '-A']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=f@example.test',
      '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture pages']);
    // Generate the artifacts from that commit, so the baseline is green.
    generate('scripts/generate-markdown.js');
    generate('scripts/generate-sitemap.js');
    generate('scripts/sync-issuer-logos.js');
    git(['add', '-A']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=f@example.test',
      '-c', 'commit.gpgsign=false', 'commit', '-qm', 'generated artifacts']);
  });

  afterAll(() => {
    if (repo) fs.rmSync(repo, { recursive: true, force: true });
  });

  /** Commit the working tree, which is what the fixture's page dates come from.
      `--allow-empty` because a test may restore a fixture to a state that is
      already committed, and "nothing to commit" is not the failure it means. */
  const commit = (message) => {
    git(['add', '-A']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=f@example.test',
      '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', message]);
  };

  /**
   * Commit on a given day. The fixture pins everything to FIRST_COMMIT, so a
   * test that needs a page to move to a *new* date asks for one explicitly —
   * otherwise the page would keep the date it already had and there would be
   * nothing for the hook to notice.
   */
  const commitOn = (date, message) => {
    git(['add', '-A']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=f@example.test', '-c', 'commit.gpgsign=false',
      'commit', '--allow-empty', '-qm', message], {
      GIT_AUTHOR_DATE: `${date}T12:00:00+00:00`,
      GIT_COMMITTER_DATE: `${date}T12:00:00+00:00`,
    });
  };

  /**
   * The documented order: commit the page, *then* regenerate, *then* stage the
   * artifacts. Generating while a page is still dirty is the trap — a page with
   * uncommitted edits has no commit date to stamp, so the sitemap keeps the old
   * one, and the hook (whose scratch commit is the commit about to happen)
   * correctly refuses the result.
   *
   * Only the artifacts are staged at the end. That is both what a real commit
   * looks like and what gives the hook something to check: the page is already
   * committed, so the scratch commit will not touch it and its date is settled.
   */
  const revisePage = (heading) => {
    write('client/pricing.html', page('pricing.html', heading));
    commit(`revise pricing: ${heading}`);
    generate('scripts/generate-markdown.js');
    generate('scripts/generate-sitemap.js');
    git(['add', 'client/public/pricing.md', 'client/public/sitemap.xml']);
  };

  it('passes on a staged state whose artifacts match it', () => {
    revisePage('Pricing, revised');

    const { results, failed } = checkStagedState({ root: repo });
    expect(failed.map((f) => f.name)).toEqual([]);
    expect(results.map((r) => r.status)).toEqual([0, 0, 0, 0]);
  }, 30000);

  it('refuses a staged page whose rendition is stale — where the check in this tree would not', () => {
    write('client/pricing.html', page('pricing.html', 'Pricing, edited again'));
    // Only the page is staged. Its rendition is now behind, in the worktree
    // and in the index alike.
    git(['add', 'client/pricing.html']);

    // The ordinary check, in this tree: the page is staged, therefore dirty,
    // therefore exempt. It passes, and says why.
    const lenient = checkInRepo('scripts/generate-markdown.js');
    expect(lenient.status).toBe(0);
    expect(lenient.stdout).toMatch(/uncommitted changes/i);

    // The hook, on the same state: nothing is dirty any more, because the
    // staged state is what would be committed. Both artifacts are stale for
    // this page, not just the rendition — once the page lands, its commit is
    // the date CI will ask the sitemap for. (The sitemap generator used to hide
    // this by stamping today's date for a page that was still dirty, which
    // matched the hook's scratch commit by coincidence and by nothing else.)
    const { failed } = checkStagedState({ root: repo });
    expect(failed.map((f) => f.name)).toEqual(['sitemap:check', 'markdown:check']);
    const markdown = failed.find((f) => f.name === 'markdown:check');
    expect(markdown.output).toMatch(/client\/public\/pricing\.md/);

    // Put the fixture back for the next test, with content distinct from the
    // first test's so the regenerated rendition really is a staged change.
    git(['checkout', '-q', '--', 'client/pricing.html']);
    revisePage('Pricing, restored');
    expect(checkStagedState({ root: repo }).failed).toEqual([]);
  }, 30000);

  it('holds a staged page to the date the commit is about to carry', () => {
    // The rendition is regenerated, but the sitemap is restored from the
    // fixture's last commit, so it still dates the page at that commit rather
    // than at this one. A <lastmod> is the date of the commit, and this commit
    // is today: locally that is invisible — the page is dirty, so its date is
    // exempt — and in CI it is a red build. Here it is caught before the
    // commit exists.
    //
    // From HEAD, not from the index: the previous test staged a regenerated
    // sitemap, and `git checkout -- <path>` restores from the index.
    git(['checkout', '-q', 'HEAD', '--', 'client/public/sitemap.xml']);
    write('client/pricing.html', page('pricing.html', 'Pricing, dated'));
    generate('scripts/generate-markdown.js');
    git(['add', 'client/pricing.html', 'client/public/pricing.md']);
    expect(read('client/public/sitemap.xml')).toContain(`<lastmod>${FIRST_COMMIT}</lastmod>`);

    const { failed } = checkStagedState({ root: repo });
    expect(failed.map((f) => f.name)).toEqual(['sitemap:check']);
    expect(failed[0].output).toMatch(/\/pricing/);

    // And the remedy works — but only once the page is committed. A page with
    // uncommitted edits has no date to stamp, so regenerating it now would
    // leave the old one in place and the hook would keep refusing. This is the
    // order scripts/README.md documents, and this test is what enforces it.
    commitOn('2024-06-07', 'commit the dated page');
    generate('scripts/generate-sitemap.js');
    git(['add', 'client/public/sitemap.xml']);
    expect(checkStagedState({ root: repo }).failed).toEqual([]);
  }, 30000);

  it('names every check it would run, and runs each from the staged script', () => {
    expect(CHECKS.map((c) => c.script)).toEqual([
      'scripts/csp-hashes.js',
      'scripts/generate-sitemap.js',
      'scripts/generate-markdown.js',
      'scripts/sync-issuer-logos.js',
      'scripts/sh-parse.js',
      'scripts/store-notes.js',
    ]);
  }, 30000);

  it('refuses a staged issuer table whose native port is stale', () => {
    // The case the hook could not see before: the logo check existed, CI ran
    // it, and nothing local did. Editing the table and committing the ports
    // separately — the natural order, since the ports are generated and feel
    // like build output — published a table that two native clients disagreed
    // with, and only a CI run noticed.
    write('client/js/issuerLogos.js',
      read('client/js/issuerLogos.js').replace('ISSUER_LOGO_PATHS = {',
        "ISSUER_LOGO_PATHS = {\n  zzzfixture: { c: '#112233', d: 'M0 0h24v24H0z' },"));
    git(['add', 'client/js/issuerLogos.js']);

    // The ordinary check passes: the table is staged, therefore dirty, therefore
    // exempt — which is correct, and is exactly why it cannot be the only guard.
    const lenient = checkInRepo('scripts/sync-issuer-logos.js');
    expect(lenient.status).toBe(0);
    expect(lenient.stdout).toMatch(/uncommitted changes/i);

    const { failed } = checkStagedState({ root: repo });
    expect(failed.map((f) => f.name)).toEqual(['logos:check']);
    expect(failed[0].output).toMatch(/IssuerLogos\.swift/);
    expect(failed[0].output).toMatch(/IssuerLogos\.kt/);

    // And the remedy the message names is the one that works.
    generate('scripts/sync-issuer-logos.js');
    git(['add', '-A']);
    expect(checkStagedState({ root: repo }).failed).toEqual([]);
  }, 30000);

  it('works with the environment git gives a hook', () => {
    // Git runs hooks with GIT_DIR pointing at the repository the commit is
    // being made in, and every git command the hook issues inherits it. Inside
    // the temp worktree that turns `git add -A` into a command about
    // `$TMP/.git` — a file — and the check dies with "Not a directory" rather
    // than a verdict. This is the only test that can catch it, because nothing
    // else sets GIT_DIR.
    expect(cleanGitEnv({ GIT_COMMITTER_DATE: 'x' }).GIT_COMMITTER_DATE).toBe('x');
    const previous = process.env.GIT_DIR;
    process.env.GIT_DIR = '.git';
    try {
      const { failed } = checkStagedState({ root: repo });
      expect(failed.map((f) => f.name)).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = previous;
    }
  }, 30000);
});

describe('installing the hook', () => {
  const quiet = () => {};
  const makeRepo = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-hooks-'));
    fs.mkdirSync(path.join(dir, '.git', 'hooks'), { recursive: true });
    return dir;
  };
  const foreign = '#!/bin/sh\necho someone elses hook\n';

  it('writes an executable hook that calls the script in the repository', () => {
    const dir = makeRepo();
    try {
      expect(installHooks.install({ root: dir, log: quiet, error: quiet })).toBe(0);
      const target = installHooks.hookPath({ root: dir });
      expect(fs.existsSync(target)).toBe(true);
      // Executable: a hook git cannot run is a hook that silently never runs.
      expect(fs.statSync(target).mode & 0o111).toBeGreaterThan(0);
      const body = fs.readFileSync(target, 'utf8');
      expect(body).toContain('scripts/precommit-artifacts.js');
      // The repository root is asked for at run time, so the hook works from
      // whatever subdirectory git invokes it in.
      expect(body).toContain('git rev-parse --show-toplevel');

      // Installing again changes nothing: the script it calls is the
      // repository's, so there is nothing to refresh.
      expect(installHooks.install({ root: dir, log: quiet, error: quiet })).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never overwrites a hook it did not write', () => {
    const dir = makeRepo();
    const target = installHooks.hookPath({ root: dir });
    try {
      fs.writeFileSync(target, foreign);
      expect(installHooks.install({ root: dir, log: quiet, error: quiet })).toBe(0);
      // Theirs is kept rather than destroyed, and ours is in charge from here
      // on — with their work still there to merge back in by hand.
      expect(fs.readFileSync(target, 'utf8')).toContain(installHooks.MARKER);
      expect(fs.readFileSync(`${target}.local`, 'utf8')).toBe(foreign);

      // And a second foreign hook, with a copy already present, stops the
      // install rather than overwriting a copy of somebody's hook.
      fs.writeFileSync(target, foreign);
      const errors = [];
      expect(installHooks.install({ root: dir, log: quiet, error: (l) => errors.push(l) })).toBe(1);
      expect(fs.readFileSync(target, 'utf8')).toBe(foreign);
      expect(errors.join('\n')).toMatch(/by hand/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uninstalls only its own hook', () => {
    const dir = makeRepo();
    const target = installHooks.hookPath({ root: dir });
    try {
      expect(installHooks.uninstall({ root: dir, log: quiet, error: quiet })).toBe(0);
      installHooks.install({ root: dir, log: quiet, error: quiet });
      expect(installHooks.uninstall({ root: dir, log: quiet, error: quiet })).toBe(0);
      expect(fs.existsSync(target)).toBe(false);

      fs.writeFileSync(target, foreign);
      expect(installHooks.uninstall({ root: dir, log: quiet, error: quiet })).toBe(1);
      expect(fs.readFileSync(target, 'utf8')).toBe(foreign);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to install where core.hooksPath points somewhere else', () => {
    // Writing .git/hooks would be a no-op that looks like it worked.
    const dir = makeRepo();
    try {
      execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
      execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: dir, stdio: 'ignore' });
      const errors = [];
      const code = installHooks.install({ root: dir, log: quiet, error: (l) => errors.push(l) });
      expect(code).toBe(1);
      expect(errors.join('\n')).toMatch(/core\.hooksPath/);
      // It prints the hook rather than installing it somewhere inert.
      expect(errors.join('\n')).toContain('scripts/precommit-artifacts.js');
      expect(fs.existsSync(installHooks.hookPath({ root: dir }))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
