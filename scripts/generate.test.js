import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { generate, report, hasChanges, ARTIFACTS } = require('./generate');
const { writeAllowlist, verifyAllowlist, collect } = require('./csp-hashes');

/*
 * `npm run generate` replaced four commands and a manual paste, so the claim
 * worth testing is the one in its own header: it regenerates everything, and it
 * tells you what changed.
 *
 * Those are two claims, and the second is the one that was broken before. Three
 * generators counted files they had written and the sitemap claimed fourteen
 * URLs whether or not a byte had moved, so its output could not be trusted and
 * therefore was never read — which is how the sitemap sat wrong for weeks.
 */

/** Split a file into everything outside the generated array, and the array. */
const outsideArray = (s) => s.replace(/const INLINE_SCRIPT_HASHES = \[[\s\S]*?\]\.join\(' '\);/, 'ARRAY');

describe('the artifact list', () => {
  it('covers the four generated artifacts, in the order CI checks them', () => {
    expect(ARTIFACTS.map((a) => a.name)).toEqual([
      'sitemap.xml',
      'Markdown renditions',
      'issuer logo tables',
      'CSP inline-script hashes',
    ]);
  });

  it('leaves the slow, platform-bound generators out', () => {
    // The launcher icons need qlmanage/sips and the Open Graph cards need
    // headless Chrome. Folding either in would make this the wrong command to
    // hand a contributor on Linux, and neither is CI-checked.
    expect(ARTIFACTS.map((a) => a.name).join(' | ')).not.toMatch(/launcher|share card|\bOG\b/i);
  });

  it('counts what an artifact has, not what was written', () => {
    // '14 pages' reads very differently from '14 files changed', and only one
    // of those two is news.
    for (const artifact of ARTIFACTS) expect(artifact.count()).toMatch(/^\d+ /);
  });
});

describe('running it', () => {
  /* One real run, not several: this exercises jsdom and the git log, so it
     takes over a second, and running it twice to prove idempotence costs twice
     that for a weaker claim. The property that actually matters is the bytes —
     that a run leaves this tree exactly as it found it. */
  const TRACKED = [
    'client/public/sitemap.xml',
    'client/public/pricing.md',
    'server/securityHeaders.js',
    'ios/FiHavenCore/Sources/FiHavenCore/Logic/IssuerLogos.swift',
    'android/core/src/main/kotlin/app/fihaven/core/logic/IssuerLogos.kt',
  ];
  const snapshot = () => TRACKED.map((f) => {
    const full = path.resolve(__dirname, '..', f);
    return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  });

  it('leaves the tree byte-identical and reports nothing changed', () => {
    // The whole value of the command is that it is safe to run without thinking.
    // If it could rewrite a byte here, it would not be.
    const before = snapshot();
    const results = generate();
    expect(snapshot()).toEqual(before);
    expect(hasChanges(results)).toBe(false);
    expect(results.filter((r) => r.written.length)).toEqual([]);
  }, 30000);

  it('separates files written from notes, so a note cannot claim a change', () => {
    // The sitemap always has a note to offer: a page with uncommitted edits has
    // no commit date to stamp. If notes counted as changes, every run in this
    // repository would report work it had not done — and this one does have
    // such a page, which is why the shape matters here rather than in theory.
    for (const r of generate()) {
      expect(Array.isArray(r.written)).toBe(true);
      expect(Array.isArray(r.notes)).toBe(true);
    }
  }, 30000);
});

describe('the report', () => {
  let out;
  const capture = () => { out = []; return { log: (s) => out.push(s) }; };
  const text = () => out.join('\n');

  it('says so plainly when there is nothing to do', () => {
    report([{ name: 'a', count: '1 x', written: [], notes: [] }], capture());
    expect(text()).toMatch(/nothing to regenerate/i);
  });

  it('lists the files that changed and counts the artifacts', () => {
    report([
      { name: 'sitemap.xml', count: '14 URLs', written: ['client/public/sitemap.xml'], notes: [] },
      { name: 'logos', count: '48 marks', written: ['ios/x.swift', 'android/x.kt'], notes: [] },
      { name: 'CSP', count: '12 inline scripts', written: [], notes: ['added sha256-abc'] },
    ], capture());
    expect(text()).toContain('client/public/sitemap.xml');
    expect(text()).toContain('ios/x.swift');
    expect(text()).toContain('android/x.kt');
    // An artifact with only a note is still worth showing, marked as a note so
    // it cannot be misread as a write.
    expect(text()).toContain('(note) added sha256-abc');
    expect(text()).toContain('2 of 3 artifacts changed');
  });

  it('does not print an artifact with nothing to say', () => {
    report([
      { name: 'quiet', count: '14 URLs', written: [], notes: [] },
      { name: 'loud', count: '1 x', written: ['a'], notes: [] },
    ], capture());
    expect(text()).not.toContain('quiet');
  });
});

describe('the CSP allowlist writer', () => {
  let dir;
  let file;
  let keptHash;

  beforeEach(() => {
    // A hash the pages really carry, so the set sync converges on this file
    // rather than emptying it: the writer compares against collect(), and an
    // invented hash would simply be removed as dead.
    keptHash = collect()[0].hash;

    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fh-csp-write-'));
    fs.mkdirSync(path.join(dir, 'server'));
    file = path.join(dir, 'server', 'securityHeaders.js');
    fs.writeFileSync(file, [
      "'use strict';",
      '',
      'const INLINE_SCRIPT_HASHES = [',
      '  // A comment that carries real knowledge, and must survive.',
      '  "\'sha256-' + keptHash + '\'",   // kept-page',
      '].join(\' \');',
      '',
      'module.exports = { INLINE_SCRIPT_HASHES };',
      '',
    ].join('\n'));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('adds the hashes the file is missing and keeps every comment', () => {
    const before = fs.readFileSync(file, 'utf8');
    const result = writeAllowlist({ root: dir });

    expect(result.changed).toBe(true);
    expect(result.added.length).toBeGreaterThan(0);
    expect(result.removed).toEqual([]);

    const after = fs.readFileSync(file, 'utf8');
    // The point of the whole design: the array is not rebuilt, so the
    // hand-written line and the comment above it survive byte-for-byte. A
    // generator that reformatted them would delete the knowledge in them.
    expect(after).toContain('A comment that carries real knowledge, and must survive.');
    expect(after).toContain('\'sha256-' + keptHash + '\'",   // kept-page');
    // And nothing outside the array moved at all.
    expect(outsideArray(after)).toBe(outsideArray(before));
  });

  it('says it changed nothing when there is nothing to change', () => {
    writeAllowlist({ root: dir });
    const second = writeAllowlist({ root: dir });
    expect(second.changed).toBe(false);
    expect(second.added).toEqual([]);
    expect(second.removed).toEqual([]);
  });

  it('leaves the file untouched when the write fails verification', () => {
    // The safety net for the case that now exists: this script is allowed to
    // rewrite a hand-maintained server file. If the rewrite cannot be proved
    // right, the original bytes go back rather than a broken file staying.
    const before = fs.readFileSync(file, 'utf8');
    expect(() => writeAllowlist({
      root: dir,
      verify: () => { throw new Error('simulated mismatch'); },
    })).toThrow(/simulated mismatch/);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('refuses a file whose array it cannot find', () => {
    fs.writeFileSync(file, "'use strict';\nmodule.exports = {};\n");
    expect(() => writeAllowlist({ root: dir })).toThrow(/has its shape changed/);
  });

  it('verifies by requiring the file, not by trusting the text', () => {
    // The exported string is what the CSP actually ships, so that is what gets
    // compared: the source text could read correctly and still export the wrong
    // set. This fixture exports one hash, and there are eleven in the pages.
    expect(() => verifyAllowlist(file, new Map(collect().map((s) => [s.hash, [s.file]]))))
      .toThrow(/Refusing to leave a half-written allowlist/);
  });
});
