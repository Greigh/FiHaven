import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { inProgressLines } = require('./worktree');
const { review: markdownReview } = require('./generate-markdown');
const { review: cspReview } = require('./csp-hashes');
const { review: logoReview, readEntries } = require('./sync-issuer-logos');
const { review: sitemapReview, buildXml } = require('./generate-sitemap');
const { CHECKS } = require('./precommit-artifacts');

const SCRIPTS = path.resolve(__dirname);

/** Every script in scripts/ that dispatches on `--check` itself. */
const checkScripts = () =>
  fs.readdirSync(SCRIPTS)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
    .filter((f) => fs.readFileSync(path.join(SCRIPTS, f), 'utf8').includes("process.argv.includes('--check')"))
    .sort();

/** A git that answers from a fixed list instead of from a repository. */
const fakeGit = (dirty = []) => (args) => (dirty.includes(args[args.length - 1]) ? ' M working\n' : '');

/*
 * One rule, asked once.
 *
 * Each `--check` here exists because a generated file can fall out of step with
 * the input it is generated from, and the fix is to regenerate and commit. The
 * trap is the order: if the check is strict, the edit you are making *right now*
 * fails the build until you regenerate, so you regenerate, commit, regenerate
 * again to fix the date the commit just changed, and commit that. Three of these
 * checks had grown their own way out of that trap, in three different shapes,
 * and the issuer-logo check had never grown one at all — so it failed on every
 * edit of its table, and the pre-commit hook never ran it.
 *
 * So the rule now lives in scripts/worktree.js and the tests below hold every
 * check to it: one question (is this input committed?), two verdicts (fatal or
 * excused), one sentence for the excused case. These are deliberately about the
 * agreement between the checks, not about any one check's own parsing — that is
 * what the per-script test files are for.
 */

/* The three clause-1 checks. Their generated file is a pure function of their
   input, so the only question is whether that input is committed. `fatal` and
   `excused` are this check's own names for the two verdicts — `missing` /
   `tolerated` reads better for a hash than `stale` does, and the rule does not
   require one vocabulary, only one decision. */
const CONTENT_CHECKS = [
  {
    script: 'generate-markdown.js',
    input: 'client/pricing.html',
    fatal: 'stale',
    excused: 'inProgress',
    /** A rendition that disagrees with the page it was generated from. */
    differ: () => [{
      file: '/repo/client/public/pricing.md',
      source: 'client/pricing.html',
      page: '/pricing',
      body: 'what we would write now',
      current: 'what is on disk',
    }],
    run: (payload, git) => markdownReview(payload, { git }),
  },
  {
    script: 'csp-hashes.js',
    input: 'client/pricing.html',
    fatal: 'missing',
    excused: 'tolerated',
    /** An inline script whose hash is not in the allowlist. */
    differ: () => [{ hash: 'abc', file: 'client/pricing.html' }],
    run: (payload, git) => cspReview(payload, [], { git }),
  },
  {
    script: 'sync-issuer-logos.js',
    input: 'client/js/issuerLogos.js',
    fatal: 'stale',
    excused: 'inProgress',
    /** The table with one mark more than the committed one has. */
    differ: () => [...readEntries(), {
      key: 'zzztestbank',
      color: '112233',
      width: 24,
      fullColor: false,
      layers: [{ color: '112233', d: 'M0 0h24v24H0z' }],
    }],
    run: (payload, git) => logoReview(payload, { git }),
  },
];

describe('every --check script is classified', () => {
  it('finds the generated-artifact checks', () => {
    // Guards the premise of this file: if a check disappears, the table below
    // stops describing the repo and these tests quietly stop meaning anything.
    expect(checkScripts()).toEqual([
      'csp-hashes.js',
      'generate-markdown.js',
      'generate-sitemap.js',
      'sync-issuer-logos.js',
    ]);
  });

  it('counts every content check in the table', () => {
    expect(CONTENT_CHECKS.map((c) => c.script).sort())
      .toEqual(checkScripts().filter((s) => s !== 'generate-sitemap.js'));
  });

  it('holds bump-build.js out of scope, and says why', () => {
    // It is a cross-file *assertion* — "this release is stamped in twelve
    // places" — not a file compared against an input. There is no input to be
    // uncommitted, so there is nothing to excuse, and it is deliberately
    // strict. If it ever grew an input-shaped check of its own, the "no third
    // exemption" rule is what it would have to argue for.
    const source = fs.readFileSync(path.join(SCRIPTS, 'bump-build.js'), 'utf8');
    expect(source).not.toContain("require('./worktree')");
    expect(require('../package.json').scripts['bump:build:check']).toBe('node scripts/bump-build.js --check');
  });

  it('gives no check a third bucket to hide drift in', () => {
    // Two verdicts per check, and the union of their names is exactly these
    // four. A new bucket would mean a new kind of exemption, which the rule
    // does not have.
    const names = CONTENT_CHECKS.flatMap((c) => [c.fatal, c.excused]);
    expect(new Set(names)).toEqual(new Set(['stale', 'inProgress', 'missing', 'tolerated']));
  });
});

describe('clause 1: a generated file against an uncommitted input', () => {
  for (const check of CONTENT_CHECKS) {
    describe(check.script, () => {
      it('excuses the difference while the input is uncommitted', () => {
        const { [check.fatal]: fatal, [check.excused]: excused } = check.run(check.differ(), fakeGit([check.input]));
        expect(fatal).toEqual([]);
        expect(excused.length).toBeGreaterThan(0);
      });

      it('fails the difference once the input is committed', () => {
        const { [check.fatal]: fatal, [check.excused]: excused } = check.run(check.differ(), fakeGit());
        expect(fatal.length).toBeGreaterThan(0);
        expect(excused).toEqual([]);
      });

      it('treats an unanswered git as committed, not as clean', () => {
        // `null` means git had nothing to say — no repository, no binary, a
        // command that failed. Reading that as "nothing changed" would excuse
        // drift exactly when the truth is unknown, which is the one time you
        // most want to be told.
        const { [check.fatal]: fatal } = check.run(check.differ(), () => null);
        expect(fatal.length).toBeGreaterThan(0);
      });
    });
  }
});

describe('clause 2: a value that comes from a commit that does not exist yet', () => {
  // A <lastmod> is the date of the last commit that touched its page, so it
  // cannot be known before that commit. That is a different question from
  // clause 1 — the input *is* committed, it is the *value* that is in the
  // future — and it is why the sitemap has always been the strictest of the
  // four. Only the date is excused; the rest of the same entry is content.
  const ORIGIN = 'https://example.test';
  const PAGES = [
    { path: '/', file: 'clean.html', changefreq: 'weekly', priority: '1.0' },
    { path: '/pricing', file: 'edited.html', changefreq: 'monthly', priority: '0.8' },
  ];
  const COMMITTED = '2024-03-04';

  const git = (dirty = []) => (args) => {
    const file = args[args.length - 1].replace(/^client\//, '');
    if (args[0] === 'status') return dirty.includes(file) ? ` M client/${file}\n` : '';
    if (args[0] === 'log') return `${COMMITTED}\n`;
    return null;
  };
  const opts = (dirty) => ({ pages: PAGES, origin: ORIGIN, git: git(dirty) });
  /** Written before the edit, so the edited page still carries the old date. */
  const beforeTheEdit = () => buildXml({ ...opts([]), dateFor: () => COMMITTED });

  it('excuses the date of an uncommitted page', () => {
    const result = sitemapReview(beforeTheEdit(), opts(['edited.html']));
    expect(result.current).toBe(true);
    expect(result.dirty).toEqual(['/pricing']);
  });

  it('still fails a date on a committed page', () => {
    const xml = beforeTheEdit()
      .replace(`<loc>${ORIGIN}/</loc>\n    <lastmod>${COMMITTED}</lastmod>`,
               `<loc>${ORIGIN}/</loc>\n    <lastmod>2001-01-01</lastmod>`);
    const result = sitemapReview(xml, opts([]));
    expect(result.current).toBe(false);
    expect(result.stale.join(' ')).toContain('2001-01-01');
  });

  it('still fails anything else in a dirty page\'s entry', () => {
    // The exemption is the value, not the entry. If it covered the whole entry,
    // a hand-edited changefreq on a page you happen to be editing would pass.
    const xml = beforeTheEdit().replace('<changefreq>monthly</changefreq>', '<changefreq>daily</changefreq>');
    expect(sitemapReview(xml, opts(['edited.html'])).current).toBe(false);
  });
});

describe('one sentence for the excused case', () => {
  it('reads the same however many there are', () => {
    expect(inProgressLines({ what: 'page', kept: 'the date in the file', items: ['/pricing'], remedy: 'R' }))
      .toEqual(['1 page with uncommitted changes — the date in the file:', '  /pricing', '  R']);
    expect(inProgressLines({ what: 'page', kept: 'the date in the file', items: ['/a', '/b'], remedy: 'R' }))
      .toEqual(['2 pages with uncommitted changes — the date in the file:', '  /a', '  /b', '  R']);
  });

  it('leaves the nouns to the check and the frame to the rule', () => {
    // "the date in the file" and "an out-of-date rendition" are not the same
    // claim, and conflating them would overstate one of them — the sitemap is
    // not out of date, it is correct as far as anyone can currently tell.
    const lines = inProgressLines({ what: 'page', kept: 'the date in the file', items: ['/a'], remedy: 'R' });
    expect(lines[0]).toContain('the date in the file');
    expect(inProgressLines({ what: 'page', kept: 'an out-of-date rendition, for now', items: ['/a'], remedy: 'R' })[0])
      .toContain('an out-of-date rendition, for now');
  });

  for (const script of ['csp-hashes.js', 'generate-markdown.js', 'generate-sitemap.js', 'sync-issuer-logos.js']) {
    it(`${script} says it through the shared reporter`, () => {
      const source = fs.readFileSync(path.join(SCRIPTS, script), 'utf8');
      expect(source).toContain('inProgressLines(');
      // The failure this guards against is three wordings for one situation,
      // which is what let them drift. The frame is written down exactly once.
      const handRolled = source.split('\n')
        .filter((line) => /console\.(log|error)/.test(line) && line.includes('with uncommitted changes'));
      expect(handRolled).toEqual([]);
    });
  }
});

describe('the pre-commit hook runs them all', () => {
  it('runs every generated-artifact check', () => {
    // The hook is where "checked before you commit" stops being a habit. A
    // check with no entry here is a check nothing runs: the issuer logos were
    // exactly that, and CI was the only thing that ever noticed.
    expect(CHECKS.map((c) => path.basename(c.script)).sort()).toEqual(checkScripts());
  });

  it('watches the input of each one', () => {
    const source = fs.readFileSync(path.join(SCRIPTS, 'precommit-artifacts.js'), 'utf8');
    for (const input of ['client/js/issuerLogos.js', 'server/securityHeaders.js', 'scripts/indexnow-urls.js']) {
      expect(source).toContain(input);
    }
  });
});
