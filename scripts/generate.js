#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   generate.js — regenerate every generated artifact, once.

   Four artifacts are generated from sources in this repository:

     sitemap.xml          from the public page list and the git history
     client/public/*.md   from the public pages
     IssuerLogos.swift    from client/js/issuerLogos.js
     IssuerLogos.kt         "
     INLINE_SCRIPT_HASHES from the inline <script> elements in client/

   That used to be five commands and one manual paste. Every one of them had
   the same two problems, which is why they are one command now:

     You had to know which one your edit touched. The CSP hashes live in a
     server file nothing else generates, so editing an inline script gave you
     no signal at all that a paste was owed.

     Each one printed its own idea of done. Three counted files, one printed a
     list to paste, and the sitemap claimed to have written fourteen URLs when
     it had rewritten a byte-identical file.

   So this runs all four and then says one thing: what changed. The point is
   the last part. A generator that always says "wrote N files" has taught
   everyone to ignore it, and a check people ignore stops catching the drift it
   exists for — which is how the sitemap sat wrong for weeks.

   It is safe to run at any time and cheap when there is nothing to do. Every
   writer is a pure function of its input, so running this twice changes
   nothing the second time, and that is a property the tests assert rather
   than a promise this file makes.

   Deliberately NOT here: the launcher icons (generate:icons, needs
   qlmanage/sips) and the Open Graph cards (generate:og, needs headless
   Chrome). Both are generated and both write into the repository, but neither
   is CI-checked, so folding them in would make this command slow, macOS-only,
   and the wrong tool for a contributor on Linux.

     node scripts/generate.js          # regenerate everything, report changes
     node scripts/generate.js --quiet  # print nothing unless something changed

   To check without writing, use the individual --check modes
   (`npm run csp:check` and friends) — those are what CI and the pre-commit
   hook run, and they hold a stricter line than this does.
═══════════════════════════════════════════════════════════ */

'use strict';

const path = require('node:path');

const { ROOT } = require('./worktree');

const rel = (f) => path.relative(ROOT, f);

/**
 * The artifacts, in the order `npm run ci` checks them.
 *
 * `run()` returns `{ written, notes }`: the repo-relative paths it actually
 * wrote (empty when it was already current) and anything a reader needs to know
 * that is not a write. Keeping those apart is the whole point — a note must not
 * make the report claim something changed.
 *
 * `count` is what the artifact has, not what was written: "14 pages" reads very
 * differently from "14 files changed", and only one of them is news.
 */
const ARTIFACTS = [
  {
    name: 'sitemap.xml',
    run: () => {
      const { changed, kept } = require('./generate-sitemap').write();
      return {
        written: changed ? ['client/public/sitemap.xml'] : [],
        // A page with uncommitted edits has no commit date to stamp, so its
        // <lastmod> is whatever the file already said — correct locally, and
        // provisional until the page is committed and this runs again.
        notes: kept.map((p) => `${p} kept its existing <lastmod> — the page has uncommitted edits`),
      };
    },
    count: () => `${require('./indexnow-urls').PUBLIC_PAGES.length} URLs`,
  },
  {
    name: 'Markdown renditions',
    run: () => ({ written: require('./generate-markdown').write().map(rel), notes: [] }),
    count: () => `${require('./indexnow-urls').PUBLIC_PAGES.length} pages`,
  },
  {
    name: 'issuer logo tables',
    run: () => ({ written: require('./sync-issuer-logos').write().written.map(rel), notes: [] }),
    count: () => `${require('./sync-issuer-logos').readEntries().length} marks`,
  },
  {
    name: 'CSP inline-script hashes',
    run: () => {
      const { changed, added, removed } = require('./csp-hashes').writeAllowlist();
      const carriers = require('./csp-hashes').byHash(require('./csp-hashes').collect());
      return {
        written: changed ? ['server/securityHeaders.js'] : [],
        notes: [
          ...removed.map((h) => `dropped sha256-${h.slice(0, 12)}… — no page carries it any more`),
          ...added.map((h) => `added sha256-${h.slice(0, 12)}… from ${[...carriers.get(h)].map((f) => path.basename(f)).sort().join(', ')}`),
        ],
      };
    },
    count: () => `${require('./csp-hashes').byHash(require('./csp-hashes').collect()).size} inline scripts`,
  },
];

/**
 * Run every artifact, in order, and return what happened.
 *
 * Deliberately not parallel and not atomic: these are four files, they run in
 * tens of milliseconds, and a half-finished run that is told exactly which half
 * finished is easier to reason about than a transaction that refused to start.
 * An artifact that throws stops the run there — the ones before it are already
 * written and correct, so the next run picks up from the failure.
 *
 * Returns rather than prints, so a test can read it and `--quiet` can decide
 * what to say.
 */
function generate({ artifacts = ARTIFACTS } = {}) {
  const results = [];
  for (const artifact of artifacts) {
    const { written, notes } = artifact.run();
    results.push({ name: artifact.name, count: artifact.count(), written, notes });
  }
  return results;
}

/** True when any artifact wrote a file. Notes alone do not count. */
function hasChanges(results) {
  return results.some((r) => r.written.length);
}

function report(results, { log = console.log } = {}) {
  if (!hasChanges(results)) {
    log(`Nothing to regenerate — all ${results.length} artifacts are current.`);
    return false;
  }
  for (const { name, count, written, notes } of results) {
    const detail = [...written, ...notes.map((n) => `(note) ${n}`)];
    if (!detail.length) continue;
    log(`${name} (${count})`);
    for (const line of detail) log(`  ${line}`);
  }
  const changed = results.filter((r) => r.written.length).length;
  log('');
  log(`${changed} of ${results.length} artifacts changed. Review the diff, then commit.`);
  return true;
}

function main() {
  const quiet = process.argv.includes('--quiet');
  const results = generate();
  if (quiet && !hasChanges(results)) return 0;
  report(results, { log: quiet ? console.error : console.log });
  return 0;
}

if (require.main === module) main();

module.exports = { main, generate, report, hasChanges, ARTIFACTS };
