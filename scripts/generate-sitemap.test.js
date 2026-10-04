import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { buildXml, review, lastModified, isDirty, lastCommitDate, today, shallowHistoryRefusal } = require('./generate-sitemap');
const { PUBLIC_PAGES, publicOrigin } = require('./indexnow-urls');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/*
 * <lastmod> has one job: tell a crawler when a page actually changed. The
 * generator reads it from git, and until now it only fell back to today for
 * files git had never seen — an *edited but uncommitted* page kept its old
 * commit date, even though the copy being served no longer matched that
 * commit. The docstring promised the fallback; the code didn't do it.
 *
 * These tests drive a real throwaway repository rather than mocking git's
 * output shape, because the whole question is what git reports in each state:
 * clean, modified, staged, untracked, and unavailable. `isDirty` now lives in
 * `scripts/worktree.js`, shared with the Markdown and CSP checks, and takes a
 * path relative to the repository root — hence the `client/` prefixes here.
 */
describe('scripts/generate-sitemap.js', () => {
  const COMMITTED_ON = '2024-03-04';
  let repo;

  /** Run git inside the scratch repo, with a deterministic identity. */
  function git(args, env = {}) {
    return execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: `${COMMITTED_ON}T12:00:00+00:00`,
        GIT_COMMITTER_DATE: `${COMMITTED_ON}T12:00:00+00:00`,
        ...env,
      },
    });
  }

  /** Bound runner: what the generator would call if it lived in the scratch repo. */
  const gitInScratchRepo = (args) => git(args);

  function write(name, body) {
    fs.writeFileSync(path.join(repo, 'client', name), body);
  }

  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-sitemap-'));
    fs.mkdirSync(path.join(repo, 'client'), { recursive: true });
    write('committed.html', '<h1>unchanged</h1>');
    write('dirty.html', '<h1>before</h1>');

    git(['init', '-q']);
    git(['add', 'client/committed.html', 'client/dirty.html']);
    git([
      '-c', 'user.name=FiHaven Test',
      '-c', 'user.email=test@example.com',
      '-c', 'commit.gpgsign=false',
      'commit', '-qm', 'add pages',
    ]);
  });

  afterAll(() => {
    if (repo) fs.rmSync(repo, { recursive: true, force: true });
  });

  it('reads the commit date for a page with no uncommitted changes', () => {
    expect(lastCommitDate('committed.html', { git: gitInScratchRepo })).toBe(COMMITTED_ON);
    expect(isDirty('client/committed.html', { git: gitInScratchRepo })).toBe(false);
    expect(lastModified('committed.html', { git: gitInScratchRepo })).toBe(COMMITTED_ON);
  });

  it('reports today for a page whose working copy has uncommitted edits', () => {
    write('dirty.html', '<h1>after</h1>');
    expect(isDirty('client/dirty.html', { git: gitInScratchRepo })).toBe(true);
    // git still knows the old commit — that is precisely the lie we avoid.
    expect(lastCommitDate('dirty.html', { git: gitInScratchRepo })).toBe(COMMITTED_ON);
    expect(lastModified('dirty.html', { git: gitInScratchRepo })).toBe(today());

    // Staging the edit doesn't make it committed.
    git(['add', 'client/dirty.html']);
    expect(isDirty('client/dirty.html', { git: gitInScratchRepo })).toBe(true);
    expect(lastModified('dirty.html', { git: gitInScratchRepo })).toBe(today());
  });

  it('reports today for a page git has never seen', () => {
    write('untracked.html', '<h1>new</h1>');
    expect(lastCommitDate('untracked.html', { git: gitInScratchRepo })).toBeNull();
    expect(lastModified('untracked.html', { git: gitInScratchRepo })).toBe(today());
  });

  it('reports today when git is unavailable or answers something unusable', () => {
    // No git binary / not a repository: runGit returns null.
    const silent = () => null;
    expect(isDirty('client/committed.html', { git: silent })).toBe(false);
    expect(lastCommitDate('committed.html', { git: silent })).toBeNull();
    expect(lastModified('committed.html', { git: silent })).toBe(today());

    // Git spoke, but not with a date (empty history, unexpected format).
    const empty = () => '';
    expect(lastCommitDate('committed.html', { git: empty })).toBeNull();
    expect(lastModified('committed.html', { git: empty })).toBe(today());
    expect(lastModified('committed.html', { git: () => 'no commits yet\n' })).toBe(today());
  });

  it('honours an injected clock', () => {
    const now = new Date('2031-12-31T23:30:00Z');
    expect(lastModified('untracked.html', { git: gitInScratchRepo, now })).toBe('2031-12-31');
    expect(today(now)).toBe('2031-12-31');
  });

  it('writes one <url> per page, with the host mapping for /', () => {
    const pages = [
      { path: '/', file: 'committed.html', changefreq: 'weekly', priority: '1.0' },
      { path: '/pricing', file: 'dirty.html', changefreq: 'monthly', priority: '0.8' },
    ];
    const xml = buildXml({ pages, origin: 'https://example.test', git: gitInScratchRepo });

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.match(/<url>/g)).toHaveLength(2);

    // '/' must not become 'https://example.test/' + '/' or lose the trailing slash.
    expect(xml).toContain('<loc>https://example.test/</loc>');
    expect(xml).toContain('<loc>https://example.test/pricing</loc>');

    expect(xml).toContain(`<lastmod>${COMMITTED_ON}</lastmod>`);
    expect(xml).toContain(`<lastmod>${today()}</lastmod>`);
    expect(xml).toContain('<changefreq>weekly</changefreq>');
    expect(xml).toContain('<priority>0.8</priority>');
  });

  it('covers exactly the public URL list with no page dropped', () => {
    const xml = buildXml();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const expected = PUBLIC_PAGES.map((p) => (p.path === '/' ? `${publicOrigin()}/` : `${publicOrigin()}${p.path}`));
    expect(locs).toEqual(expected);
    expect(locs).toHaveLength(14);
  });

  /*
   * A shallow clone is the case where the date is *wrong* rather than absent,
   * and it is worth a real clone rather than a canned git string: one fetched
   * commit is a grafted root, so a path-limited `git log` matches it and reports
   * *its* date for every file. That is how `actions/checkout`'s default
   * `fetch-depth: 1` turned all fourteen `<lastmod>` values in this repository
   * into the head commit's date, and why `--check` now refuses to answer there.
   */
  it('sees the grafted date in a shallow clone, and refuses to answer from one', () => {
    const base = git(['rev-parse', 'HEAD']).trim();
    const pageEdited = '2024-06-07';
    const otherEdited = '2024-09-10';
    const commit = (date) => [
      '-c', 'user.name=FiHaven Test',
      '-c', 'user.email=test@example.com',
      '-c', 'commit.gpgsign=false',
      'commit', '-qm', 'edit',
    ];
    const dated = (date) => ({ GIT_AUTHOR_DATE: `${date}T12:00:00+00:00`, GIT_COMMITTER_DATE: `${date}T12:00:00+00:00` });

    // Two more commits, so the page's own last change is *not* the newest one.
    write('committed.html', '<h1>changed once</h1>');
    git(['add', 'client/committed.html']);
    git(commit(pageEdited), dated(pageEdited));
    write('dirty.html', '<h1>after, again</h1>');
    git(['add', 'client/dirty.html']);
    git(commit(otherEdited), dated(otherEdited));

    // file:// because git ignores --depth on a plain local path.
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-shallow-'));
    const clone = path.join(scratch, 'clone');
    execFileSync('git', ['clone', '--quiet', '--depth', '1', `file://${repo}`, clone], { stdio: 'ignore' });
    const gitInShallowClone = (args) => execFileSync('git', args, {
      cwd: clone, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
      // Full history: the page's real last change.
      expect(lastCommitDate('committed.html', { git: gitInScratchRepo })).toBe(pageEdited);
      // The shallow clone has one grafted commit, and a path-limited log
      // matches it for every file — so it answers with the *newest* commit's
      // date instead. That is the wrong answer, silently, and it is what
      // `actions/checkout`'s default depth did to this repository's sitemap.
      expect(lastCommitDate('committed.html', { git: gitInShallowClone })).toBe(otherEdited);
      // Which is why the check says it cannot answer, rather than answering.
      const refusal = shallowHistoryRefusal({ git: gitInShallowClone });
      expect(refusal).toMatch(/shallow/i);
      expect(refusal).toMatch(/fetch-depth: 0/);
      expect(shallowHistoryRefusal({ git: gitInScratchRepo })).toBeNull();
      // No git at all is the documented fallback, not a shallow clone.
      expect(shallowHistoryRefusal({ git: () => null })).toBeNull();
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
      // Leave the scratch repository as the other tests expect to find it.
      git(['reset', '--hard', '-q', base]);
      write('dirty.html', '<h1>after</h1>');
    }
  });
});

/*
 * `--check` is what `npm run ci` runs, and it has to hold two things at once:
 * a worktree with uncommitted page edits must not fail the build, because a
 * dirty date is the clock and regenerating only buys a commit-then-regenerate
 * dance; and anything git *can* vouch for — the URL set, changefreq, priority,
 * and the date of every clean page — must still fail loudly when it drifts.
 */
describe('scripts/generate-sitemap.js --check', () => {
  const ORIGIN = 'https://example.test';
  const PAGES = [
    { path: '/', file: 'clean.html', changefreq: 'weekly', priority: '1.0' },
    { path: '/pricing', file: 'edited.html', changefreq: 'monthly', priority: '0.8' },
  ];
  const COMMITTED = '2024-03-04';

  /** A git that answers from a fixed script instead of from a repository. */
  const fakeGit = (dirty = []) => (args) => {
    const file = args[args.length - 1].replace(/^client\//, '');
    if (args[0] === 'status') return dirty.includes(file) ? ` M client/${file}\n` : '';
    if (args[0] === 'log') return `${COMMITTED}\n`;
    return null;
  };

  const opts = (dirty) => ({ pages: PAGES, origin: ORIGIN, git: fakeGit(dirty) });
  /** A file whose edited page kept its commit date, i.e. written before the edit. */
  const withStaleDirtyDate = (dirty) => buildXml({
    ...opts(dirty),
    dateFor: () => COMMITTED,
  });

  it('accepts a file that matches exactly', () => {
    const xml = buildXml(opts([]));
    expect(review(xml, opts([]))).toEqual({ current: true, dirty: [], stale: [] });
  });

  it('accepts an uncommitted page keeping the date already in the file', () => {
    const result = review(withStaleDirtyDate(['edited.html']), opts(['edited.html']));
    expect(result.current).toBe(true);
    expect(result.dirty).toEqual(['/pricing']);
  });

  it('still fails when a clean page is dated wrong', () => {
    const xml = withStaleDirtyDate(['edited.html'])
      .replace(`<loc>${ORIGIN}/</loc>\n    <lastmod>${COMMITTED}</lastmod>`,
               `<loc>${ORIGIN}/</loc>\n    <lastmod>2001-01-01</lastmod>`);
    const result = review(xml, opts(['edited.html']));
    expect(result.current).toBe(false);
    expect(result.stale.join(' ')).toContain('2001-01-01');
  });

  it('fails when the file is missing a page, even with everything else dirty', () => {
    const xml = withStaleDirtyDate(['edited.html']).replace(/  <url>\n    <loc>https:\/\/example\.test\/pricing[\s\S]*?  <\/url>\n/, '');
    const result = review(xml, opts(['edited.html']));
    expect(result.current).toBe(false);
    expect(result.stale.join(' ')).toContain('missing from the file');
  });

  it('fails when the file carries a URL that is not a public page', () => {
    const xml = withStaleDirtyDate(['edited.html']).replace('</urlset>',
      `  <url>\n    <loc>${ORIGIN}/secret</loc>\n    <lastmod>${COMMITTED}</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.1</priority>\n  </url>\n</urlset>`);
    const result = review(xml, opts(['edited.html']));
    expect(result.current).toBe(false);
    expect(result.stale.join(' ')).toContain('not a public page');
  });

  it('fails when a dirty page is also carrying the wrong metadata', () => {
    // Exempting a page's *date* must not exempt the rest of its entry: a
    // changefreq edited by hand is still drift.
    const xml = withStaleDirtyDate(['edited.html']).replace('<changefreq>monthly</changefreq>', '<changefreq>daily</changefreq>');
    const result = review(xml, opts(['edited.html']));
    expect(result.current).toBe(false);
    expect(result.stale.join(' ')).toContain('/pricing');
  });
});
