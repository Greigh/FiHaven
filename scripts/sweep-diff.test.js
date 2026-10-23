import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const {
  DEFAULT_TOLERANCE, DEFAULT_THRESHOLD,
  parseRun, discoverRuns, diffPixels, compareRunPair, compareRuns,
  formatReport, run,
} = require('./sweep-diff');

/*
 * What is worth testing here is the *verdicts*, not the arithmetic. Counting
 * changed pixels is easy to get right; deciding what a count means is the part
 * that decides whether anyone trusts the answer, and the two thresholds in the
 * module's header were measured on real sweeps rather than chosen:
 *
 *   - two sweeps of the same build differ by ~0.06%, which is the clock
 *   - the smallest real change found in a sweep is 2.34%
 *
 * So the tests below are about the line between those, and about the two ways a
 * comparison can be meaningless rather than wrong: a different-sized capture
 * (every pixel differs, and the percentage means nothing) and a capture that is
 * only in one of the runs.
 */

/** A solid-colour PNG, or one with a rectangle painted on it. */
function png(width, height, { fill = [30, 30, 34, 255], rect = null } = {}) {
  const p = new PNG({ width, height });
  for (let i = 0; i < p.data.length; i += 4) {
    p.data[i] = fill[0]; p.data[i + 1] = fill[1]; p.data[i + 2] = fill[2]; p.data[i + 3] = fill[3];
  }
  if (rect) {
    const [x0, y0, w, h, colour] = rect;
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const i = (y * width + x) * 4;
        p.data[i] = colour[0]; p.data[i + 1] = colour[1]; p.data[i + 2] = colour[2]; p.data[i + 3] = 255;
      }
    }
  }
  return PNG.sync.write(p);
}

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-diff-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

/** A sweep directory: `{ 'NN-screen__state.png': buffer }`, under a device dir. */
function writeRun(dir, captures, device = null) {
  const base = device ? path.join(dir, device) : dir;
  fs.mkdirSync(base, { recursive: true });
  for (const [name, buf] of Object.entries(captures)) {
    fs.writeFileSync(path.join(base, name), buf);
  }
  return base;
}

describe('deciding what a difference means', () => {
  it('calls two identical captures identical', () => {
    const a = PNG.sync.read(png(40, 40));
    const d = diffPixels(a, PNG.sync.read(png(40, 40)), {});
    expect(d.changed).toBe(0);
    expect(d.ratio).toBe(0);
    expect(d.bbox).toBeNull();
    expect(d.regions).toEqual([]);
  });

  it('ignores a per-channel difference under the tolerance', () => {
    // Antialiasing and PNG rounding are not changes. At the default tolerance
    // of 12, a whole rectangle 3 levels off is invisible and one 40 levels off
    // is a change; without a tolerance every sweep reports every screen.
    const base = { fill: [100, 100, 100, 255] };
    const near = PNG.sync.read(png(40, 40, { ...base, rect: [0, 0, 40, 40, [103, 100, 100, 255]] }));
    const far = PNG.sync.read(png(40, 40, { ...base, rect: [0, 0, 40, 40, [140, 100, 100, 255]] }));
    const plain = PNG.sync.read(png(40, 40, base));
    expect(diffPixels(plain, near, {}).changed).toBe(0);
    expect(diffPixels(plain, far, {}).changed).toBe(40 * 40);
  });

  it('reports a difference below the threshold as noise rather than a change', () => {
    // The clock: a small block, on a big screen, every run.
    const W = 400, H = 800;
    const clock = [4, 2]; // 8 px of 320000 = 0.0025%, a hair under the default
    const a = PNG.sync.read(png(W, H));
    const b = PNG.sync.read(png(W, H, { rect: [clock[0], clock[1], 4, 2, [255, 255, 255, 255]] }));
    const d = diffPixels(a, b, {});
    expect(d.changed).toBe(8);
    expect(d.ratio).toBeLessThan(DEFAULT_THRESHOLD);
    expect(d.bbox).toEqual({ x0: 4, y0: 2, x1: 7, y1: 3 });
    // A change in the top-left corner of a phone is the status bar, and the
    // region name is what tells a reader that without them going to look.
    expect(d.regions[0].name).toBe('top left');
    expect(d.rows.bands).toEqual(['top']);
  });

  it('calls a real change a change, and says how far it reached', () => {
    const W = 400, H = 800;
    const a = PNG.sync.read(png(W, H));
    const b = PNG.sync.read(png(W, H, { rect: [100, 200, 200, 100, [200, 40, 40, 255]] }));
    const d = diffPixels(a, b, {});
    expect(d.changed).toBe(20000);
    expect(d.ratio).toBeGreaterThan(DEFAULT_THRESHOLD);
    expect(d.bbox).toEqual({ x0: 100, y0: 200, x1: 299, y1: 299 });
    expect(d.regions[0].name).toMatch(/centre/);
    // More than two regions carry change, so the name says so rather than
    // implying the rest of the change was somewhere else.
    expect(d.regions.length).toBeGreaterThan(2);
  });

  it('refuses to compare two different sizes instead of calling it all changed', () => {
    // An iPhone capture and an iPad capture differ in every pixel. The
    // percentage would be 100% and would mean nothing.
    const d = diffPixels(PNG.sync.read(png(40, 40)), PNG.sync.read(png(40, 80)), {});
    expect(d.incomparable).toBe('40x40 vs 40x80');
    expect(d.changed).toBe(0);
    expect(d.ratio).toBe(0);
  });

  it('honours a caller that wants every difference counted', () => {
    const a = PNG.sync.read(png(40, 40));
    const b = PNG.sync.read(png(40, 40, { rect: [0, 0, 1, 1, [255, 255, 255, 255]] }));
    expect(diffPixels(a, b, { threshold: 0 }).changed).toBe(1);
  });
});

describe('matching captures between two runs', () => {
  it('keys on the screen and state, not on the index in the filename', () => {
    // `--only bills --states happy` numbers a capture 01; the same capture in a
    // full run is 02. Matching on the index would call every capture new.
    const old = writeRun(path.join(tmp, 'old'), { '01-bills__happy.png': png(20, 20) });
    const neu = writeRun(path.join(tmp, 'new'), { '02-bills__happy.png': png(20, 20) });
    const r = compareRunPair(parseRun(old), parseRun(neu), {});
    expect(r.captures).toHaveLength(1);
    expect(r.captures[0].verdict).toBe('same');
  });

  it('reports a capture that only one run has, rather than dropping it', () => {
    const old = writeRun(path.join(tmp, 'old'), {
      '01-bills__happy.png': png(20, 20),
      '02-cards__happy.png': png(20, 20),
    });
    const neu = writeRun(path.join(tmp, 'new'), {
      '01-bills__happy.png': png(20, 20),
      '02-rewards__happy.png': png(20, 20),
    });
    const r = compareRunPair(parseRun(old), parseRun(neu), {});
    const by = Object.fromEntries(r.captures.map((c) => [c.key, c.verdict]));
    expect(by).toEqual({ 'bills__happy': 'same', 'cards__happy': 'gone', 'rewards__happy': 'new' });
    // An absent capture still has the shape of a result. `undefined` in a Δ
    // column and `NaN%` next to it read as a broken tool rather than as a
    // capture that was never taken.
    for (const c of r.captures) {
      expect(c.changed).toBe(0);
      expect(Number.isFinite(c.ratio)).toBe(true);
    }
    const text = formatReport({ pairs: [r], unmatched: [] }, {});
    expect(text).toContain('only in the old run');
    expect(text).toContain('only in the new run');
    expect(text).not.toMatch(/undefined|NaN/);
    expect(text).toContain('1 new · 1 gone');
  });

  it('pairs one subdirectory per device, and says when a device has no partner', () => {
    writeRun(path.join(tmp, 'old'), { '01-bills__happy.png': png(20, 20) }, 'iphone-18-pro');
    writeRun(path.join(tmp, 'old'), { '01-bills__happy.png': png(20, 20) }, 'ipad-pro');
    writeRun(path.join(tmp, 'new'), {
      '01-bills__happy.png': png(20, 20, { rect: [0, 0, 20, 20, [200, 0, 0, 255]] }),
    }, 'iphone-18-pro');
    const r = compareRuns(path.join(tmp, 'old'), path.join(tmp, 'new'), {});
    expect(r.pairs.map((p) => p.label)).toEqual(['iphone-18-pro']);
    expect(r.unmatched).toEqual([{ label: 'ipad-pro', side: 'old' }]);
    expect(r.pairs[0].summary.changed).toBe(1);
  });

  it('ignores the .log files a sweep leaves beside its captures', () => {
    writeRun(path.join(tmp, 'old'), { '01-bills__happy.png': png(20, 20) });
    fs.writeFileSync(path.join(tmp, 'old', '01-bills__happy.log'), '[Shell] screen=bills via=tab\n');
    writeRun(path.join(tmp, 'new'), { '01-bills__happy.png': png(20, 20) });
    fs.writeFileSync(path.join(tmp, 'new', '00-empty-account.log'), 'seeded\n');
    const r = compareRuns(path.join(tmp, 'old'), path.join(tmp, 'new'), {});
    expect(r.pairs[0].summary.captures).toBe(1);
  });

  it('pairs two runs whatever their directories are called', () => {
    // `sweep-before` and `sweep-after` are the obvious names for two runs and
    // have nothing in common; pairing on them reported "only in the new run"
    // for both sides and compared nothing at all.
    writeRun(path.join(tmp, 'sweep-before'), { '01-bills__happy.png': png(20, 20) });
    writeRun(path.join(tmp, 'sweep-after'), {
      '01-bills__happy.png': png(20, 20, { rect: [0, 0, 20, 20, [200, 0, 0, 255]] }),
    });
    const r = compareRuns(path.join(tmp, 'sweep-before'), path.join(tmp, 'sweep-after'), {});
    expect(r.unmatched).toEqual([]);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0].summary.changed).toBe(1);
  });

  it('compares one flat run against every device of a two-device run', () => {
    writeRun(path.join(tmp, 'old'), { '01-bills__happy.png': png(20, 20) });
    writeRun(path.join(tmp, 'new'), { '01-bills__happy.png': png(20, 20) }, 'iphone-18-pro');
    writeRun(path.join(tmp, 'new'), { '01-bills__happy.png': png(20, 20) }, 'ipad-pro');
    const r = compareRuns(path.join(tmp, 'old'), path.join(tmp, 'new'), {});
    // In the order the directories are read, which is sorted — deterministic,
    // and not the order they were written in.
    expect(r.pairs.map((p) => p.label)).toEqual(['ipad-pro', 'iphone-18-pro']);
  });

  it('leaves a device that was only re-shot on one side unpaired', () => {
    // Two devices before, one after: the one that was re-shot pairs, and the
    // other is reported rather than compared against the wrong device.
    writeRun(path.join(tmp, 'old'), { '01-bills__happy.png': png(20, 20) }, 'iphone-18-pro');
    writeRun(path.join(tmp, 'old'), { '01-bills__happy.png': png(20, 20) }, 'ipad-pro');
    writeRun(path.join(tmp, 'new'), {
      '01-bills__happy.png': png(20, 20, { rect: [0, 0, 20, 20, [200, 0, 0, 255]] }),
    }, 'iphone-18-pro');
    const r = compareRuns(path.join(tmp, 'old'), path.join(tmp, 'new'), {});
    expect(r.pairs.map((p) => p.label)).toEqual(['iphone-18-pro']);
    expect(r.unmatched).toEqual([{ label: 'ipad-pro', side: 'old' }]);
  });

  it('finds the runs a `--device all` sweep left behind', () => {
    // A sweep writes one subdirectory per device; the diff should not need to
    // be told which one, and should not treat a sweep root as a run of nothing.
    writeRun(tmp, { '01-bills__happy.png': png(20, 20) }, 'iphone-18-pro');
    expect(discoverRuns(tmp).map((r) => r.label)).toEqual(['iphone-18-pro']);
    const flat = writeRun(path.join(tmp, 'flat'), { '01-bills__happy.png': png(20, 20) });
    expect(discoverRuns(flat).map((r) => r.label)).toEqual(['flat']);
  });

  it('says which screens moved, worst first in its own table and by count in the roll-up', () => {
    const old = writeRun(path.join(tmp, 'old'), {
      '01-bills__happy.png': png(100, 100),
      '02-budget__happy.png': png(100, 100),
    });
    const neu = writeRun(path.join(tmp, 'new'), {
      // 4 px on bills: noise. 900 px on budget: a change.
      '01-bills__happy.png': png(100, 100, { rect: [0, 0, 2, 2, [255, 255, 255, 255]] }),
      '02-budget__happy.png': png(100, 100, { rect: [10, 10, 30, 30, [255, 255, 255, 255]] }),
    });
    const r = compareRunPair(parseRun(old), parseRun(neu), {});
    expect(r.summary.screensDiffer).toBe(2);
    expect(r.summary.changed).toBe(1);
    expect(r.summary.noise).toBe(1);
    const budget = r.screens.find((s) => s.screen === 'budget');
    expect(budget.worst).toBeCloseTo(0.09, 5);
  });
});

describe('the report', () => {
  const onePair = () => {
    const old = writeRun(path.join(tmp, 'old'), {
      '01-bills__happy.png': png(200, 400),
      '02-cards__happy.png': png(200, 400),
    }, 'iphone-18-pro');
    const neu = writeRun(path.join(tmp, 'new'), {
      '01-bills__happy.png': png(200, 400, { rect: [40, 300, 60, 40, [220, 30, 30, 255]] }),
      '02-cards__happy.png': png(200, 400),
    }, 'iphone-18-pro');
    return compareRuns(path.join(tmp, 'old'), path.join(tmp, 'new'), { sheet: false });
  };

  it('names the screen, the size of the change, where it was and how far it reached', () => {
    const text = formatReport(onePair(), { threshold: DEFAULT_THRESHOLD });
    expect(text).toContain('bills');
    expect(text).toContain('1 of 2 screens differ');
    expect(text).toMatch(/bills\s+happy\s+2400\s+3\.00%/);
    // The box is what separates a moved table from a moved clock.
    expect(text).toMatch(/30%w x 10%h at 300,40/);
    expect(text).toContain('iphone-18-pro');
  });

  it('keeps "differs" and "changed" apart, and says which threshold moved the line', () => {
    const old = writeRun(path.join(tmp, 'old'), { '01-bills__happy.png': png(400, 800) });
    const neu = writeRun(path.join(tmp, 'new'), {
      // 0.0025% — a clock.
      '01-bills__happy.png': png(400, 800, { rect: [4, 2, 4, 2, [255, 255, 255, 255]] }),
    });
    const r = compareRuns(old, neu, { sheet: false });
    const text = formatReport(r, { threshold: DEFAULT_THRESHOLD });
    expect(text).toContain('1 of 1 screens differ');
    expect(text).toContain('0 capture(s) changed, 1 under threshold');
    expect(text).toContain('* under the 0.25% threshold');
    // "differ, 0 changed" is the answer, and it has to read as one sentence
    // rather than as a contradiction.
    expect(text).toMatch(/0 of 3 screens differ|1 of 1 screens differ/);
  });
});

describe('running it', () => {
  const twoRuns = () => {
    writeRun(path.join(tmp, 'old'), { '01-bills__happy.png': png(60, 120) });
    writeRun(path.join(tmp, 'new'), {
      '01-bills__happy.png': png(60, 120, { rect: [10, 60, 30, 30, [200, 0, 0, 255]] }),
    });
  };

  it('fails the run when something moved above the threshold', () => {
    twoRuns();
    const out = run([path.join(tmp, 'old'), path.join(tmp, 'new'), '--no-sheet']);
    expect(out.changed).toBe(true);
  });

  it('passes the run when only the clock moved', () => {
    writeRun(path.join(tmp, 'old'), { '01-bills__happy.png': png(400, 800) });
    writeRun(path.join(tmp, 'new'), {
      '01-bills__happy.png': png(400, 800, { rect: [4, 2, 4, 2, [255, 255, 255, 255]] }),
    });
    expect(run([path.join(tmp, 'old'), path.join(tmp, 'new'), '--no-sheet']).changed).toBe(false);
  });

  it('writes the side-by-side sheet beside the runs, never inside one', () => {
    // A diff image left in a sweep directory is a capture the next diff
    // compares against a real one — so this is refused rather than warned about.
    twoRuns();
    expect(() => run([path.join(tmp, 'old'), path.join(tmp, 'new'), '--out', path.join(tmp, 'new', 'x')]))
      .toThrow(/must not be inside/);
    const out = run([path.join(tmp, 'old'), path.join(tmp, 'new')]);
    expect(out.sheet.index).toBe(`${path.join(tmp, 'new')}-diff${path.sep}index.html`);
    expect(fs.existsSync(out.sheet.index)).toBe(true);
    // The sweep it read is untouched: one capture in, one capture still there.
    expect(fs.readdirSync(path.join(tmp, 'new')).sort()).toEqual(['01-bills__happy.png']);
  });

  it('copies both pictures and a marked-up diff into the sheet', () => {
    twoRuns();
    const out = run([path.join(tmp, 'old'), path.join(tmp, 'new')]);
    const dir = path.dirname(out.sheet.index);
    const shots = fs.readdirSync(path.join(dir, 'shots')).sort();
    expect(shots).toEqual(['diff-bills__happy.png', 'new-bills__happy.png', 'old-bills__happy.png']);
    // Every reference in the sheet resolves, which is the whole promise of a
    // portable artifact: it opens from a disk, from a server, from a zip.
    const html = fs.readFileSync(out.sheet.index, 'utf8');
    for (const src of [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1])) {
      expect(fs.existsSync(path.join(dir, src)), `${src} should exist`).toBe(true);
    }
    // The marked-up image is the new picture with only the changed pixels lit,
    // so it is the same size and mostly the dimmed background.
    const marked = PNG.sync.read(fs.readFileSync(path.join(dir, 'shots', 'diff-bills__happy.png')));
    expect(`${marked.width}x${marked.height}`).toBe('60x120');
    let lit = 0;
    for (let i = 0; i < marked.data.length; i += 4) {
      if (marked.data[i] === 255 && marked.data[i + 1] === 59) lit++;
    }
    expect(lit).toBe(30 * 30);
  });

  it('has nothing to draw for a run that did not move', () => {
    writeRun(path.join(tmp, 'old'), { '01-bills__happy.png': png(60, 120) });
    writeRun(path.join(tmp, 'new'), { '01-bills__happy.png': png(60, 120) });
    const out = run([path.join(tmp, 'old'), path.join(tmp, 'new')]);
    expect(out.sheet.count).toBe(0);
    expect(fs.readFileSync(out.sheet.index, 'utf8')).toContain('No capture differs');
  });

  it('refuses two directories and an unknown flag rather than guessing', () => {
    expect(() => run([])).toThrow(/OLD and NEW/);
    expect(() => run([path.join(tmp, 'old'), path.join(tmp, 'new'), '--wat'])).toThrow(/unknown flag/);
    expect(() => run([path.join(tmp, 'old'), path.join(tmp, 'new'), '--tolerance', 'x'])).toThrow(/--tolerance/);
    expect(() => compareRuns(tmp, tmp)).toThrow(/no captures/);
  });
});
