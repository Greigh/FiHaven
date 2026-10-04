#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   worktree.js — ask git whether a path has uncommitted changes,
   and say it the one way every artifact check says it.

   Every generated-artifact check needs the same answer to the
   same question, and the sitemap found the question first. This
   file is where the rule lives so that a new check inherits it
   instead of re-deriving it.

   THE RULE
   ────────
   A generated file is compared against its *committed* inputs.
   An input that is not committed yet is not compared, and is
   named as in progress. Nothing else is exempt. There are two
   shapes of exemption, because there are two kinds of value in
   a generated file:

   1. CONTENT. The file is a pure function of its input — a
      Markdown rendition of a page, the SHA-256 of an inline
      script, the native port of the issuer table. If the input
      has uncommitted changes, a difference is work in progress:
      reported, never fatal, because failing would demand a
      regenerate-paste-commit-regenerate dance on every edit.

   2. COMMIT. The value comes from a commit that does not exist
      yet — a page's <lastmod> is the date of the last commit
      that touched it. It cannot be known before the commit, so
      it is reported and never fatal. *Only* that value is
      excused: everything else in the same file is content, and
      content is still compared, which is why a sitemap that has
      a hand-edited changefreq fails even when every page is
      dirty.

   Both clauses ask the same question — is this input committed?
   — so they ask it in one place, here. A check that needs a
   third kind of exemption does not get one. That is the signal
   that it is not a generated-artifact check at all: see
   bump-build.js, which asserts a release is stamped everywhere
   rather than comparing a file to an input, and which is
   deliberately strict.

   Where this bites hardest is the pre-commit hook, which runs
   these checks against a tree it has made clean (see
   precommit-artifacts.js). The same rule therefore has to hold
   in both directions: on a worktree, an uncommitted input is
   excused; on the state a commit is about to publish, nothing
   is.

   Paths are relative to the repository root, which is also how
   git prints them.
═══════════════════════════════════════════════════════════ */

'use strict';

const { execFileSync } = require('node:child_process');

const ROOT = require('node:path').resolve(__dirname, '..');

/* Hand back git's stdout. `null` means git itself had nothing to say —
   not a repository, no git binary, or the command failed — and every
   caller must read that as "no information", never as "nothing
   changed".

   Injectable so the tests can drive it with a scratch repository or a
   canned answer instead of asserting against this repository's
   (moving) state. */
function runGit(args, { root = ROOT } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/* Porcelain output covers every way the shipped file and the committed
   copy can disagree: modified, staged, renamed, deleted, untracked. Any
   of them means the file is being changed right now.

   A pathspec rather than reading the whole worktree: git already knows
   how to answer for one path, renames and deletions included, and the
   callers only ask about files they are about to fail on. */
function isDirty(relPath, { git = runGit } = {}) {
  const out = git(['status', '--porcelain', '--', relPath]);
  return out !== null && out.trim() !== '';
}

/* Whether this is a shallow clone, and therefore a repository that cannot
   answer "when did this file last change".

   `null` for "git had nothing to say" — not a repository, no git binary, or a
   git too old to know the question — which callers read as *not* shallow,
   because a checkout that is not a clone at all is the documented
   "no git" case and the fallback there is already today's date. */

function isShallow({ git = runGit } = {}) {
  const out = git(['rev-parse', '--is-shallow-repository']);
  if (out === null) return null;
  return out.trim() === 'true';
}

/**
 * The one way a check says "this passed because you are still editing".
 *
 * Three checks had their own wording for it, which is three places for the
 * rule to drift. The nouns are the check's to supply — a page, an inline
 * script, a table — and the sentence around them is not.
 *
 * `kept` says what is being excused, because the two clauses are not the
 * same: a rendition is *out of date*, a `<lastmod>` simply *keeps the date
 * it already has*. Both are honest, and conflating them would overstate one
 * of them.
 *
 * Returns lines rather than printing, so a check can send them wherever its
 * own output goes — and so a test can read them.
 */
function inProgressLines({ what, kept, items, remedy }) {
  const n = items.length;
  const plural = n === 1 ? '' : 's';
  return [
    `${n} ${what}${plural} with uncommitted changes — ${kept}:`,
    ...items.map((item) => `  ${item}`),
    `  ${remedy}`,
  ];
}

module.exports = { ROOT, runGit, isDirty, isShallow, inProgressLines };
