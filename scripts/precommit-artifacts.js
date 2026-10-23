#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   precommit-artifacts.js — run the generated-artifact checks
   against what is about to be committed.

     node scripts/precommit-artifacts.js          # the hook's own entry point
     npm run hooks:install                        # install it into .git/hooks

   The checks — csp:check, sitemap:check, markdown:check, logos:check,
   sh:check, notes:check —
   each *exempt* a file whose source has uncommitted changes, because
   a page you are still editing has a rendition that is in progress
   rather than stale. That exemption is right for `npm run ci` and
   wrong here: the index is not a work-in-progress, it is the state
   the commit will publish, and a `<lastmod>` or a Markdown
   rendition that does not match it is drift the moment it lands.

   So the hook does not try to talk the checks out of their
   exemption. It gives them a tree where nothing can be dirty:

     1. a scratch git worktree at HEAD, in a temp directory;
     2. the *index* written over it (`git checkout-index`), so the
        tree holds exactly the blobs being committed — staged edits,
        staged deletions, staged new files, and nothing from the
        working directory;
     3. one scratch commit, which makes the tree clean and gives
        every staged page a real last-commit date: the date this
        commit is about to carry. That is the whole trick, and it is
        why no checker's exemption can fire;
     4. `node_modules` symlinked in, because the Markdown
        generator needs jsdom and the temp tree has no install;
     5. the three checks, run from the *staged* copies of the
        scripts, so a change to a checker is checked by itself;
     6. the worktree removed, whatever happened.

   The user's index and working directory are never touched: every
   write happens under the temp path, and the hook reads the index
   rather than modifying it.

   What this cannot decide: a `<lastmod>` is the date of the commit,
   and a commit made at 23:50 UTC on a machine whose clock is on
   UTC+2 is dated the next day. The scratch commit is pinned to UTC
   so it matches what the sitemap generator writes (`today()` is
   `toISOString().slice(0, 10)`), and the residual window is named
   in the output rather than left to be discovered in CI.
═════════════════════════════════════════════════════════════════ */

'use strict';

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ROOT } = require('./worktree');

/**
 * An environment for a child `git`, with the hook's own git variables removed.
 *
 * Git runs hooks with `GIT_DIR` (and friends) pointing at *its* repository, and
 * every git command this hook issues afterwards inherits them. Inside the temp
 * worktree that turns `git add -A` into a command about `$TMP/.git` — a *file*,
 * not a directory — and the whole check dies with "Unable to create
 * '…/.git/index.lock': Not a directory" instead of a verdict. Found by
 * committing for real; a test that calls this module directly never sees it,
 * because there is no `GIT_DIR` in vitest's environment.
 *
 * So: drop every `GIT_*` the hook did not mean to pass, then add back only what
 * this function was asked for.
 */
function cleanGitEnv(extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_') || key in extra) env[key] = value;
  }
  return { ...env, ...extra };
}

/* The checks, in the order `npm run ci` uses them. Order is
   load-bearing there and here: the build writes the artifacts, so a
   check that ran after it would compare each file with itself. */
const CHECKS = [
  { name: 'csp:check', script: 'scripts/csp-hashes.js' },
  { name: 'sitemap:check', script: 'scripts/generate-sitemap.js' },
  { name: 'markdown:check', script: 'scripts/generate-markdown.js' },
  { name: 'logos:check', script: 'scripts/sync-issuer-logos.js' },
  { name: 'sh:check', script: 'scripts/sh-parse.js' },
  { name: 'notes:check', script: 'scripts/store-notes.js' },
];

/* Staged paths that can change what a check reads. Anything else —
   an iOS screen, a Gradle file, docs — cannot, and the hook says
   nothing rather than spending a worktree on it. Kept as a list of
   tests rather than one clever regex so a new artifact has one place
   to be added and one test to fail. */
const RELEVANT = [
  // A page is the input to two checks: its Markdown rendition, and the
  // inline scripts the CSP hashes.
  { test: (p) => /^client\/[^/]+\.html$/.test(p) || /^client\/public\/[^/]+\.html$/.test(p) },
  // A rendition and the sitemap are the artifacts themselves.
  { test: (p) => /^client\/public\/[^/]+\.md$/.test(p) || p === 'client/public/sitemap.xml' },
  // The CSP allowlist, and the list every generated URL comes from.
  { test: (p) => p === 'server/securityHeaders.js' || p === 'scripts/indexnow-urls.js' },
  // The issuer table and the two native ports it generates. The ports were
  // missing here, so a commit could land a hand-edited IssuerLogos.swift that no
  // local command complained about — the check existed but nothing ran it.
  {
    test: (p) => p === 'client/js/issuerLogos.js'
      || p.endsWith('/Logic/IssuerLogos.swift')
      || p.endsWith('/logic/IssuerLogos.kt'),
  },
  // A checker, or the shared git helper: changing one changes the
  // verdict, so it is checked by itself.
  {
    test: (p) => /^scripts\/(csp-hashes|generate-markdown|generate-sitemap|sync-issuer-logos|sh-parse|store-notes|worktree)\.js$/.test(p),
  },
  // Any staged shell script: `bash -n` runs over the whole tree, so a syntax
  // error anywhere is caught the moment it is staged rather than on the next
  // sweep that happens to source it.
  { test: (p) => p.endsWith('.sh') },
  // A release-notes file: its fenced paste blocks are measured against the
  // store consoles' hard character caps.
  { test: (p) => /^docs\/release-notes\/.*\.md$/.test(p) },
];

/** The staged paths any check could read, or null if git is silent. */
function stagedPaths({ root = ROOT, git } = {}) {
  const ask = git || ((args) => {
    try {
      return gitIn(root, args);
    } catch {
      return null;
    }
  });
  const out = ask(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
  if (out === null) return null;
  return out.split('\n').map((line) => line.trim()).filter(Boolean);
}

/** Whether any staged path is one a check reads. Pure, and tested. */
function stagedPathsNeedingChecks(paths) {
  if (!paths) return [];
  return paths.filter((p) => RELEVANT.some((r) => r.test(p)));
}

function gitIn(dir, args, env) {
  return execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: cleanGitEnv(env),
  });
}

/**
 * A clean tree holding the index, and the date it would be committed with.
 *
 * The scratch commit's identity and date are given explicitly so the
 * verdict never depends on the user's git config, and the date is UTC
 * because that is what `today()` in the generators produces — pinning
 * it is what lets "the staged date is right" be a decidable question
 * here rather than a guess.
 */
function stagedTree({ root = ROOT, tmp, log = () => {} }) {
  gitIn(root, ['worktree', 'add', '--detach', '--no-checkout', '--quiet', tmp, 'HEAD']);
  // The index, written over the worktree: staged content, not the
  // working directory's.
  gitIn(root, ['checkout-index', '--all', '--force', `--prefix=${tmp}${path.sep}`]);
  // Now make the worktree's own history hold it, so `git status` is
  // clean inside and `git log -1 -- <page>` answers with today.
  const stamp = new Date().toISOString();
  gitIn(tmp, ['add', '-A']);
  gitIn(tmp, [
    '-c', 'user.name=FiHaven pre-commit',
    '-c', 'user.email=pre-commit@fihaven.invalid',
    '-c', 'commit.gpgsign=false',
    'commit', '--quiet', '--no-verify', '-m', 'staged state, checked by precommit-artifacts.js',
  ], { GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp });
  log(`  staged state committed at ${stamp.slice(0, 10)} (UTC)`);

  // jsdom, and whatever else the generators import. A symlink rather
  // than a copy: the temp tree is thrown away in a second, and npm
  // would otherwise spend a minute installing into it. A `node_modules`
  // already in the staged tree (a symlink someone committed, or an
  // install) is left alone rather than reported — it is not a problem.
  const target = path.join(tmp, 'node_modules');
  const modules = path.join(root, 'node_modules');
  if (fs.existsSync(modules) && !fs.existsSync(target)) {
    try {
      fs.symlinkSync(modules, target);
    } catch (err) {
      if (err.code !== 'EEXIST') log(`  (could not link node_modules: ${err.code || err.message})`);
    }
  }
  return tmp;
}

/** Run one check from the staged copy of its own script. */
function runCheck(tmp, check) {
  const script = path.join(tmp, check.script);
  if (!fs.existsSync(script)) {
    return { ...check, status: 0, output: `  (no ${check.script} in the staged tree — skipped)` };
  }
  const res = spawnSync(process.execPath, [script, '--check'], {
    cwd: tmp,
    encoding: 'utf8',
    // The checkers read git themselves, so they need the same clean
    // environment: a hook's `GIT_DIR` would point them at the repository the
    // commit is being made in, not at the staged state they are judging.
    env: cleanGitEnv({ CI: '1' }),
  });
  return { ...check, status: res.status ?? 1, output: `${res.stdout || ''}${res.stderr || ''}`.trimEnd() };
}

function removeWorktree(tmp, { root = ROOT } = {}) {
  try {
    gitIn(root, ['worktree', 'remove', '--force', tmp]);
  } catch {
    // A worktree left behind is untidy, not broken; prune clears it.
    try { gitIn(root, ['worktree', 'prune']); } catch { /* nothing more to try */ }
  }
}

/**
 * Run the checks against the staged state. Returns the failing ones;
 * the caller decides the exit code, so this is testable without
 * ending a process.
 */
function checkStagedState({ root = ROOT, log = () => {} } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-precommit-'));
  try {
    stagedTree({ root, tmp, log });
    const results = CHECKS.map((check) => runCheck(tmp, check));
    return { results, failed: results.filter((r) => r.status !== 0) };
  } finally {
    removeWorktree(tmp, { root });
  }
}

function main() {
  const log = (line) => process.stdout.write(`${line}\n`);

  const staged = stagedPaths();
  if (staged === null) {
    // Not a repository, or git had nothing to say. A commit hook only
    // ever runs inside one, so this is a safety net, not a mode.
    log('pre-commit: git would not answer about the index — nothing checked.');
    return 0;
  }
  if (!staged.length) {
    log('pre-commit: nothing staged, nothing to check.');
    return 0;
  }

  const relevant = stagedPathsNeedingChecks(staged);
  if (!relevant.length) {
    // The common case on this repository, where most commits are iOS,
    // Android or server work that no generated artifact depends on.
    return 0;
  }

  log(`pre-commit: checking ${relevant.length} staged path(s) the artifacts depend on:`);
  relevant.slice(0, 8).forEach((p) => log(`  ${p}`));
  if (relevant.length > 8) log(`  …and ${relevant.length - 8} more`);

  const { results, failed } = checkStagedState({ root: ROOT, log });

  if (failed.length) {
    log('');
    for (const check of failed) {
      log(`✗ ${check.name}`);
      (check.output || '(no output)').split('\n').forEach((line) => log(`  ${line}`));
      log('');
    }
    log('The staged state does not match the artifacts it will publish.');
    log('Regenerate them, stage the result, and commit again:');
    log('  npm run generate');
    log('(it regenerates all four and prints what changed — including the CSP');
    log(' hashes, which it writes into server/securityHeaders.js itself)');
    log('');
    log('A <lastmod> is the date of the commit, so a commit that lands on a');
    log('later local day than the staged date will be asked for it again in CI.');
    return 1;
  }

  log(`pre-commit: artifacts match the staged state (${results.map((r) => r.name).join(', ')}).`);
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  main, stagedPaths, stagedPathsNeedingChecks, checkStagedState, cleanGitEnv, CHECKS, RELEVANT,
};
