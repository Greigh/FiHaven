import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { collect, byHash, review } = require('./csp-hashes');

/** A git that answers from a fixed list instead of from a repository. */
const fakeGit = (dirty = []) => (args) => (dirty.includes(args[args.length - 1]) ? ' M working\n' : '');

const script = (hash, file) => ({ hash, file });

/*
 * The hash list is a security control: an inline script whose hash is missing
 * is blocked by the CSP, so the page breaks the moment it ships. `--check` has
 * to be strict about anything committed — and quiet about a page you are still
 * editing, because a hash you are about to regenerate is not drift.
 */
describe('scripts/csp-hashes.js --check', () => {
  it('flags a hash that a committed page needs', () => {
    const { missing, tolerated } = review([script('aaa', 'client/pricing.html')], [], { git: fakeGit() });
    expect(missing).toEqual([{ hash: 'aaa', files: ['client/pricing.html'] }]);
    expect(tolerated).toEqual([]);
  });

  it('tolerates a hash only uncommitted pages carry', () => {
    const scripts = [script('aaa', 'client/pricing.html')];
    const { missing, tolerated } = review(scripts, [], { git: fakeGit(['client/pricing.html']) });
    expect(missing).toEqual([]);
    expect(tolerated).toEqual([{ hash: 'aaa', files: ['client/pricing.html'] }]);
  });

  it('stays strict when any one page carrying the hash is committed', () => {
    // The same inline script in two pages, one of them mid-edit. The committed
    // page still needs the hash, so this is drift, not work in progress.
    const scripts = [
      script('aaa', 'client/pricing.html'),
      script('aaa', 'client/public/oauth-return.html'),
    ];
    const { missing, tolerated } = review(scripts, [], { git: fakeGit(['client/pricing.html']) });
    expect(missing).toEqual([
      { hash: 'aaa', files: ['client/pricing.html', 'client/public/oauth-return.html'] },
    ]);
    expect(tolerated).toEqual([]);
  });

  it('ignores a hash the allowlist already names', () => {
    const scripts = [script('aaa', 'client/pricing.html')];
    expect(review(scripts, ['aaa'], { git: fakeGit() })).toEqual({ missing: [], tolerated: [] });
  });

  it('reads a silent git as "nothing is dirty", not as "everything is"', () => {
    const scripts = [script('aaa', 'client/pricing.html')];
    expect(review(scripts, [], { git: () => null }).missing).toHaveLength(1);
  });
});

describe('scripts/csp-hashes.js collect', () => {
  it("finds this repository's inline scripts, named relative to the root", () => {
    const scripts = collect();
    expect(scripts.length).toBeGreaterThan(0);
    for (const { hash, file } of scripts) {
      expect(hash).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      // Repo-relative is what git — and isDirty — is asked about.
      expect(file).toMatch(/^client\//);
    }
  });

  it('collects the same inline script across pages under one hash', () => {
    const grouped = byHash([
      script('aaa', 'client/a.html'),
      script('aaa', 'client/b.html'),
      script('bbb', 'client/c.html'),
    ]);
    expect([...grouped.keys()]).toEqual(['aaa', 'bbb']);
    expect([...grouped.get('aaa')]).toEqual(['client/a.html', 'client/b.html']);
  });
});
