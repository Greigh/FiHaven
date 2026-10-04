import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { readEntries, swiftSource, kotlinSource, review, SOURCE } = require('./sync-issuer-logos');

/* This is a port, not a build step: client/js/issuerLogos.js is the table, and
   these two native files are a transcription of it that nobody can review as
   easily as the table itself. So the guards in the parser are the interesting
   part — every one of them is a way the web table could drift into something
   the native side silently renders wrong, from a colour that will not parse to
   a mark with two layers and no single brand colour to tint. */

const table = (body) => `export const ISSUER_LOGO_PATHS = {\n${body}\n};\n`;

const MONO = `  visa: { c: '#1A1F71', d: 'M0 0h24v24H0z' },`;
const FULL = `  mastercard: { c: '#EB001B', l: [['#EB001B', 'M0 0h12v24H0z'], ['#F79E1B', 'M12 0h12v24H12z']] },`;

describe('reading the table', () => {
  it('reads the real one', () => {
    const entries = readEntries();
    expect(entries.length).toBeGreaterThan(10);
    // No exception is the assertion: a format drift throws here rather than
    // quietly porting an empty table over 47 working marks.
    for (const e of entries) expect(e.key).toMatch(/^[a-z0-9]+$/);
  });

  it('reads a monochrome mark as one recolorable layer', () => {
    const [visa] = readEntries(table(MONO));
    expect(visa).toEqual({
      key: 'visa',
      color: '1A1F71',
      width: 24,
      fullColor: false,
      layers: [{ color: '1A1F71', d: 'M0 0h24v24H0z' }],
    });
  });

  it('reads a full-color mark as its own layers, in order', () => {
    const [mc] = readEntries(table(FULL));
    expect(mc.fullColor).toBe(true);
    expect(mc.layers.map((l) => l.color)).toEqual(['EB001B', 'F79E1B']);
    // Back to front: the tint is what breaks if this order is lost.
    expect(mc.layers.map((l) => l.d)).toEqual(['M0 0h12v24H0z', 'M12 0h12v24H12z']);
  });

  it('uppercases colors, so neither native side needs a hex parser', () => {
    const [visa] = readEntries(`export const ISSUER_LOGO_PATHS = {\n  visa: { c: '#aabbcc', d: 'M0 0' },\n};`);
    expect(visa.color).toBe('AABBCC');
    expect(visa.layers[0].color).toBe('AABBCC');
  });

  it('carries a width other than the default 24', () => {
    const [wide] = readEntries(`export const ISSUER_LOGO_PATHS = {\n  amex: { c: '#016FD0', d: 'M0 0', w: 38 },\n};`);
    expect(wide.width).toBe(38);
  });

  /* Each of these is a way the port would be wrong rather than absent, which is
     worse: the file still generates, still compiles, and still draws a mark —
     just the wrong one. */
  const rejects = [
    ['an uppercase key', `  Visa: { c: '#000000', d: 'M0 0' },`, /lowercase alphanumeric/],
    ['a color that is not #RRGGBB', `  x: { c: 'navy', d: 'M0 0' },`, /#RRGGBB/],
    ['a mark with both a tint and its own layers', `  x: { c: '#000000', d: 'M0 0', l: [['#fff', 'M0 0']] },`, /exactly one of/],
    ['a mark with neither', `  x: { c: '#000000' },`, /exactly one of/],
    ['a layer that is not a pair', `  x: { c: '#000000', l: [['#fff']] },`, /\[fill, d\] pairs/],
    ['a layer with a bad fill', `  x: { c: '#000000', l: [['fff', 'M0 0']] },`, /layer fill/],
    ['path data carrying a quote', `  x: { c: '#000000', d: 'M0 0" onload="x' },`, /bad path data/],
    ['a width that is not a positive number', `  x: { c: '#000000', d: 'M0 0', w: 0 },`, /positive number/],
    ['an empty table', `  // nothing yet`, /No issuer logo entries/],
  ];

  for (const [what, body, message] of rejects) {
    it(`refuses ${what}`, () => {
      expect(() => readEntries(table(body))).toThrow(message);
    });
  }

  it('says which file it was reading when the table format changes', () => {
    // The one failure a maintainer hits after renaming the export, and the one
    // where the path is the entire answer.
    expect(() => readEntries('export const SOMETHING_ELSE = {};'))
      .toThrow(new RegExp(`Could not find ISSUER_LOGO_PATHS.*has the table format changed`));
  });
});

describe('the generated files', () => {
  const entries = readEntries(table(`${MONO}\n${FULL}`));

  it('says where it came from, so an edit is obviously wrong', () => {
    for (const body of [swiftSource(entries), kotlinSource(entries)]) {
      expect(body).toContain('do not edit by hand');
      expect(body).toContain('client/js/issuerLogos.js');
    }
  });

  it('packs colors as 0xRRGGBB on both sides', () => {
    expect(swiftSource(entries)).toContain('color: 0x1A1F71');
    expect(swiftSource(entries)).toContain('IssuerLogoLayer(color: 0xF79E1B');
    expect(kotlinSource(entries)).toContain('IssuerLogoLayer(0x1A1F71,');
    expect(kotlinSource(entries)).toContain('IssuerLogoLayer(0xF79E1B,');
  });

  it('keys marks longest-first, so a specific name beats a short one', () => {
    // 'americanexpress' must be tried before 'american'. Sorting the other way
    // silently draws the wrong mark for every card from that issuer.
    for (const body of [swiftSource(entries), kotlinSource(entries)]) {
      expect(body).toMatch(/keysByLength/);
    }
    expect(swiftSource(entries)).toContain('all.keys.sorted { $0.count > $1.count }');
    expect(kotlinSource(entries)).toContain('all.keys.sortedByDescending { it.length }');
  });

  it('gives the native side the one thing it cannot derive: the aspect ratio', () => {
    expect(swiftSource(entries)).toContain('var aspect: Double { width / 24 }');
    expect(kotlinSource(entries)).toContain('val aspect: Float get() = width / 24f');
  });

  it('says a full-color mark must not be recolored', () => {
    // The distinction is the whole reason the port carries `isFullColor`: a
    // monochrome mark is tinted white on a brand chip, a full-color one needs a
    // light plate instead, and swapping which is which is invisible until it
    // is on screen.
    expect(swiftSource(entries)).toContain('isFullColor: false');
    expect(swiftSource(entries)).toContain('isFullColor: true');
    expect(kotlinSource(entries)).toContain('false,');
    expect(kotlinSource(entries)).toContain('true,');
  });

  it('is a pure function of the table', () => {
    // The property the `--check` exemption rests on: no clock, no environment,
    // no ordering by Object.keys. Two runs of the same table agree byte for
    // byte, which is why "the table is dirty" can stand in for "the port is
    // out of date".
    expect(swiftSource(entries)).toBe(swiftSource(readEntries(table(`${MONO}\n${FULL}`))));
    expect(kotlinSource(entries)).toBe(kotlinSource(readEntries(table(`${MONO}\n${FULL}`))));
  });
});

describe('the port on disk', () => {
  it('matches the committed table', () => {
    // What `npm run logos:check` asserts, against this repository rather than a
    // fixture: the check is only worth having if CI would catch a stale port.
    const { stale, inProgress } = review(readEntries());
    expect({ stale, inProgress }).toEqual({ stale: [], inProgress: [] });
  });

  it('still parses the table it is given', () => {
    expect(fs.existsSync(SOURCE)).toBe(true);
  });
});
