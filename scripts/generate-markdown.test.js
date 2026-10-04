import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { review } = require('./generate-markdown');

/*
 * `--check` is what `npm run ci` runs, and it has to hold two things at once: a
 * rendition left behind by a page you are still editing must not fail the
 * build, and a rendition left behind by an edit that is already committed must
 * fail loudly. The first would otherwise demand a
 * regenerate-then-commit-then-regenerate dance on every copy edit; the second
 * is the drift the check exists to catch.
 *
 * A fake git answers with a fixed list rather than a repository: the question
 * here is what the check does with each answer, and the answer itself —
 * modified, staged, untracked — is git's business, covered once in
 * generate-sitemap.test.js against a real scratch repo.
 */
describe('scripts/generate-markdown.js --check', () => {
  /** Reads "is <path> in the dirty list" from a canned answer. */
  const fakeGit = (dirty = []) => (args) => (dirty.includes(args[args.length - 1]) ? ' M working\n' : '');

  const rendition = (over = {}) => ({
    file: '/repo/client/public/pricing.md',
    source: 'client/pricing.html',
    page: '/pricing',
    body: 'new body',
    current: 'old body',
    ...over,
  });

  it('accepts a rendition that matches what we would write', () => {
    const output = rendition({ current: 'new body' });
    expect(review([output], { git: fakeGit() })).toEqual({ stale: [], inProgress: [] });
  });

  it('fails for a rendition of a committed page that has moved on', () => {
    const output = rendition();
    const { stale, inProgress } = review([output], { git: fakeGit() });
    expect(stale).toEqual([output]);
    expect(inProgress).toEqual([]);
  });

  it('tolerates a rendition whose page has uncommitted changes', () => {
    const output = rendition();
    const { stale, inProgress } = review([output], { git: fakeGit(['client/pricing.html']) });
    expect(stale).toEqual([]);
    expect(inProgress).toEqual([output]);
  });

  it('still fails for a page nobody is editing while another is', () => {
    const editing = rendition();
    const forgotten = rendition({ file: '/repo/client/public/faq.md', source: 'client/faq.html' });
    const { stale, inProgress } = review(
      [editing, forgotten],
      { git: fakeGit(['client/pricing.html']) }
    );
    expect(stale).toEqual([forgotten]);
    expect(inProgress).toEqual([editing]);
  });

  it('tolerates a missing rendition for a page git has never seen', () => {
    // A page being written for the first time: untracked, so dirty.
    const brandNew = rendition({ source: 'client/new-page.html', current: null });
    const { stale, inProgress } = review([brandNew], { git: fakeGit(['client/new-page.html']) });
    expect(stale).toEqual([]);
    expect(inProgress).toEqual([brandNew]);
  });

  it('fails for a missing rendition of a committed page', () => {
    const missing = rendition({ current: null });
    expect(review([missing], { git: fakeGit() }).stale).toEqual([missing]);
  });

  it('reads a silent git as "nothing is dirty", not as "everything is"', () => {
    // No git binary, or not a repository: the check has to stay strict rather
    // than quietly pass every rendition it cannot vouch for.
    const output = rendition();
    expect(review([output], { git: () => null }).stale).toEqual([output]);
  });
});
