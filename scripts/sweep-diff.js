#!/usr/bin/env node
'use strict';

/*
 * Compare two visual review sweeps and say which screens changed.
 *
 *   node scripts/sweep-diff.js OLD NEW [--out DIR] [--tolerance N] [--threshold N]
 *   node scripts/sweep-diff.js OLD NEW --json
 *
 * A sweep answers "does this build look right". It does not answer "does it
 * look the same as the build we shipped", which is the question you actually
 * have when a change is meant to be invisible: a paywall that moved two lines,
 * a table that gained a column, a layout that broke in a state nobody opens.
 * Those are invisible in a table of capture sizes and obvious in two pictures
 * side by side, which is all this is: the two pictures, next to each other,
 * with the changed pixels marked.
 *
 * Three things it deliberately does not do:
 *
 *   - **It does not guess which change is acceptable.** It reports what moved
 *     and where, and stops. Deciding whether a moved row matters is the review,
 *     and a tool that guessed would be a tool whose silence meant something.
 *   - **It does not compare across devices.** A 1206x2622 iPhone capture and a
 *     2064x2752 iPad capture differ in every pixel, and calling that "changed"
 *     is a number with no meaning. Different sizes are reported as
 *     incomparable, with both sizes, rather than as a percentage.
 *   - **It does not write into a sweep directory.** Its output goes beside the
 *     runs it read, because a diff image left inside a run is a capture the
 *     *next* diff will compare against a real one.
 */

const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

/** The default per-channel difference below which a pixel counts as unchanged. */
const DEFAULT_TOLERANCE = 12;
/**
 * The default changed-fraction above which a capture is called changed, and it
 * is set from two measurements rather than a taste:
 *
 *   - Two sweeps of the *same build*, minutes apart, differ by ~2000 pixels —
 *     0.06% of an iPhone screen — every time. It is the clock in the status
 *     bar. Anything below that is not a change, and a threshold under it calls
 *     every screen changed on every run.
 *   - The smallest real change found in a sweep so far is the 24pt strip at the
 *     bottom of a detail column: 98120 pixels, 2.34%. Two orders of magnitude
 *     above the clock.
 *
 * So the default sits between them. It is deliberately not a mask: the clock is
 * *reported* (as a `noise` row naming the top left of the screen) rather than
 * excluded, because a region mask that is right on a phone and wrong on a Mac
 * — where the top left is a sidebar, and a change there is the whole point — is
 * a guess that hides the next real finding.
 */
const DEFAULT_THRESHOLD = 0.0025; // 0.25% of the screen

/** Region names for the 3x5 grid a change is located in. */
const REGION_COLS = ['left', 'centre', 'right'];
const REGION_ROWS = ['top', 'upper', 'middle', 'lower', 'bottom'];

/** One sweep: its captures, keyed by `<screen>__<state>`, in the run's order. */
function parseRun(dir) {
  const captures = new Map();
  const order = [];
  for (const name of fs.readdirSync(dir).sort()) {
    // `01-bills__happy.png`. The index is positional — it moves when `--only`
    // narrows the list — so the key is the two names, which do not.
    const m = /^(\d+)-(.+)__(.+)\.png$/.exec(name);
    if (!m) continue;
    const key = `${m[2]}__${m[3]}`;
    if (captures.has(key)) continue;
    captures.set(key, {
      key, index: Number(m[1]), screen: m[2], state: m[3],
      file: path.join(dir, name), name,
    });
    order.push(key);
  }
  return { dir, captures, order };
}

/**
 * The runs in a directory: the directory itself if it holds captures, or each
 * subdirectory that does. A `--device all` sweep keeps one subdirectory per
 * device, and naming them at the command line is a thing to get wrong.
 *
 * `device` says which of the two shapes this is, because the two pair
 * differently: a subdirectory's name identifies the hardware it was shot on, and
 * the root's name says nothing at all.
 */
function discoverRuns(dir) {
  const direct = parseRun(dir);
  if (direct.order.length) return [{ label: path.basename(dir), device: false, ...direct }];
  const runs = [];
  for (const entry of fs.readdirSync(dir).sort()) {
    const sub = path.join(dir, entry);
    if (!fs.statSync(sub).isDirectory()) continue;
    const run = parseRun(sub);
    if (run.order.length) runs.push({ label: entry, device: true, ...run });
  }
  return runs;
}

/** Cell name for a pixel, on a 3x5 grid. */
function regionName(x, y, width, height) {
  const col = Math.min(2, Math.floor((x / width) * 3));
  const row = Math.min(4, Math.floor((y / height) * 5));
  return `${REGION_ROWS[row]} ${REGION_COLS[col]}`;
}

/**
 * Compare two decoded images.
 *
 * A pixel counts as changed when any channel differs by more than `tolerance`,
 * which is what makes a one-bit antialiasing difference not a change and a
 * moved row of text one. Returns the count, the bounding box and a 3x5 region
 * histogram — the box says how far the change reached, the region says what
 * kind of thing moved, and a change confined to `top` on a phone is a clock
 * and a change spread across `middle` is a layout.
 */
function diffPixels(a, b, { tolerance = DEFAULT_TOLERANCE, diff = false } = {}) {
  if (a.width !== b.width || a.height !== b.height) {
    return {
      incomparable: `${a.width}x${a.height} vs ${b.width}x${b.height}`,
      width: null, height: null, changed: 0, total: 0, ratio: 0, bbox: null, regions: [],
    };
  }
  const { width, height } = a;
  const total = width * height;
  const regions = new Array(REGION_ROWS.length * REGION_COLS.length).fill(0);
  const counts = { top: 0, upper: 0, middle: 0, lower: 0, bottom: 0 };
  let changed = 0;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  const out = diff ? new PNG({ width, height }) : null;
  if (out) {
    for (let i = 0; i < total; i++) {
      const s = i * 4;
      out.data[s] = 30; out.data[s + 1] = 30; out.data[s + 2] = 34; out.data[s + 3] = 255;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const dr = Math.abs(a.data[i] - b.data[i]);
      const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
      const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
      const da = Math.abs(a.data[i + 3] - b.data[i + 3]);
      if (dr <= tolerance && dg <= tolerance && db <= tolerance && da <= tolerance) continue;
      changed++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const name = regionName(x, y, width, height);
      regions[REGION_ROWS.indexOf(name.split(' ')[0]) * 3 + REGION_COLS.indexOf(name.split(' ')[1])]++;
      counts[name.split(' ')[0]]++;
      if (out) {
        out.data[i] = 255; out.data[i + 1] = 59; out.data[i + 2] = 48; out.data[i + 3] = 255;
      }
    }
  }
  // The region with the most changed pixels, and how much of the change is in
  // it — a change spread over four regions has no single name, and saying
  // "lower centre (31%)" is more useful than picking the largest and implying
  // the rest is elsewhere.
  const ranked = regions
    .map((count, i) => ({
      name: `${REGION_ROWS[Math.floor(i / 3)]} ${REGION_COLS[i % 3]}`,
      count,
      share: changed ? count / changed : 0,
    }))
    .filter((r) => r.count > 0)
    .sort((x, y2) => y2.count - x.count);
  return {
    incomparable: null,
    width, height, changed, total, ratio: total ? changed / total : 0,
    bbox: x1 < 0 ? null : { x0, y0, x1, y1 },
    regions: ranked,
    // How the change is spread down the screen, which reads better in a table
    // than five region names: a phone's tab bar and a Mac's title bar are both
    // "the last 4% of the height".
    rows: summariseRows(counts, changed),
    diff: out,
  };
}

/** The vertical extent of a change, as a share of the screen's height. */
function summariseRows(counts, changed) {
  if (!changed) return null;
  const bands = REGION_ROWS.filter((r) => counts[r] > 0);
  const first = REGION_ROWS.indexOf(bands[0]) / REGION_ROWS.length;
  const last = (REGION_ROWS.indexOf(bands[bands.length - 1]) + 1) / REGION_ROWS.length;
  return { from: first, to: last, bands };
}

/** Decode a PNG file, loudly. */
function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

/** Compare one capture pair. */
function compareCapture(oldCap, newCap, opts) {
  // The empty result, so a capture that only one run has reports as many of the
  // same numbers as one that was compared — `undefined` and `NaN%` in a table
  // read as a broken tool rather than as an absent capture.
  const absent = (cap, verdict) => ({
    key: cap.key, screen: cap.screen, state: cap.state,
    oldFile: verdict === 'gone' ? cap.file : null,
    newFile: verdict === 'new' ? cap.file : null,
    oldName: verdict === 'gone' ? cap.name : null,
    newName: verdict === 'new' ? cap.name : null,
    verdict, incomparable: null,
    width: null, height: null, changed: 0, total: 0, ratio: 0,
    bbox: null, regions: [], rows: null, diff: null,
  });
  if (!oldCap) return absent(newCap, 'new');
  if (!newCap) return absent(oldCap, 'gone');
  const a = readPng(oldCap.file);
  const b = readPng(newCap.file);
  const d = diffPixels(a, b, { tolerance: opts.tolerance, diff: !!opts.sheet });
  const capture = {
    key: newCap.key, screen: newCap.screen, state: newCap.state,
    oldFile: oldCap.file, newFile: newCap.file,
    oldName: oldCap.name, newName: newCap.name,
    ...d,
  };
  if (d.incomparable) {
    capture.verdict = 'incomparable';
  } else if (d.changed === 0) {
    capture.verdict = 'same';
  } else {
    capture.verdict = d.ratio >= opts.threshold ? 'changed' : 'noise';
  }
  return capture;
}

/** One run pair: every capture, and a per-screen roll-up. */
function compareRunPair(oldRun, newRun, opts = {}) {
  const o = { tolerance: DEFAULT_TOLERANCE, threshold: DEFAULT_THRESHOLD, ...opts };
  const keys = [...new Set([...oldRun.order, ...newRun.order])]
    // Run order first (the sweep's own `NN-` order), then anything the other
    // side added, so the report reads in the order a person would sweep.
    .sort((x, y) => (x.index || 99) - (y.index || 99) || x.localeCompare(y));

  const captures = keys.map((key) =>
    compareCapture(oldRun.captures.get(key), newRun.captures.get(key), o));

  const screens = new Map();
  for (const c of captures) {
    if (!screens.has(c.screen)) {
      screens.set(c.screen, { screen: c.screen, captures: [], changed: 0, worst: 0, region: null, rows: null });
    }
    const s = screens.get(c.screen);
    s.captures.push(c);
    if (c.verdict === 'changed' || c.verdict === 'noise') s.changed++;
    if ((c.verdict === 'changed' || c.verdict === 'noise') && c.ratio > s.worst) {
      s.worst = c.ratio;
      s.region = c.regions[0] ? c.regions[0].name : null;
      s.rows = c.rows;
    }
  }
  const roll = [...screens.values()];
  const count = (v) => captures.filter((c) => c.verdict === v).length;
  return {
    // Something to call the pair even when the runs were handed over as bare
    // `parseRun` results with no label — a heading that reads "undefined" is
    // worse than one that reads the directory's name.
    label: newRun.label || oldRun.label || path.basename(newRun.dir || oldRun.dir || 'sweep'),
    oldDir: oldRun.dir, newDir: newRun.dir,
    captures, screens: roll,
    summary: {
      screens: roll.length,
      // "Differs" and "changed" are kept apart in the wording because they are
      // different claims: a screen can differ by the status-bar clock and change
      // by nothing at all, and a report that calls that "moved, 0 changed" reads
      // like a contradiction rather than like the answer.
      screensDiffer: roll.filter((s) => s.changed > 0).length,
      captures: captures.length,
      changed: count('changed'),
      noise: count('noise'),
      same: count('same'),
      incomparable: count('incomparable'),
      added: count('new'),
      gone: count('gone'),
    },
  };
}

/**
 * Two sweep directories, compared.
 *
 * Each side may hold one run or one subdirectory per device. Pairing is by
 * device name, and *not* by directory name: `sweep-before` and `sweep-after`
 * are the obvious way to name two runs and have nothing in common, and pairing
 * on their names reported "only in the new run" for both and compared nothing.
 * So a single run on each side is always paired with the other, whatever the
 * directories are called, and pairing by name only happens when there is more
 * than one to pair.
 */
function compareRuns(oldDir, newDir, opts = {}) {
  const oldRuns = discoverRuns(oldDir);
  const newRuns = discoverRuns(newDir);
  if (!oldRuns.length) throw new Error(`no captures in ${oldDir}`);
  if (!newRuns.length) throw new Error(`no captures in ${newDir}`);
  if (oldRuns.length === 1 && newRuns.length === 1) {
    return { pairs: [compareRunPair(oldRuns[0], newRuns[0], opts)], unmatched: [] };
  }
  // One *unnamed* run against several devices: compare it against each, which
  // is what "the same screens, this time on both devices" means. A single run
  // that came out of a device subdirectory is not in this case — its name is
  // the device, and it pairs with its own counterpart and leaves the rest
  // unmatched, which is the more useful answer when only one device was re-shot.
  if (oldRuns.length === 1 && !oldRuns[0].device) {
    return { pairs: newRuns.map((n) => compareRunPair(oldRuns[0], n, opts)), unmatched: [] };
  }
  if (newRuns.length === 1 && !newRuns[0].device) {
    return { pairs: oldRuns.map((o) => compareRunPair(o, newRuns[0], opts)), unmatched: [] };
  }
  const pairs = [];
  const unmatched = [];
  for (const n of newRuns) {
    const o = oldRuns.find((r) => r.label === n.label);
    if (o) pairs.push(compareRunPair(o, n, opts));
    else unmatched.push({ label: n.label, side: 'new' });
  }
  for (const o of oldRuns) {
    if (!newRuns.find((r) => r.label === o.label)) unmatched.push({ label: o.label, side: 'old' });
  }
  return { pairs, unmatched };
}

const pct = (r) => `${(r * 100).toFixed(2)}%`;

/** `lower centre (48%)`, or `whole screen` when the change has no single home. */
function describeRegion(c) {
  if (c.verdict === 'incomparable') return `sizes differ (${c.incomparable})`;
  if (c.verdict === 'new') return 'only in the new run';
  if (c.verdict === 'gone') return 'only in the old run';
  if (!c.changed) return '—';
  const r = c.regions[0];
  if (!r) return '—';
  const spread = c.regions.length > 2;
  const where = `${r.name}${spread ? ' +' : ''}`;
  return c.rows ? `${where}, rows ${pct(c.rows.from)}-${pct(c.rows.to)}` : where;
}

/** The text report: one row per screen, then one per capture that moved. */
function formatReport(result, opts = {}) {
  const threshold = opts.threshold === undefined ? DEFAULT_THRESHOLD : opts.threshold;
  const lines = [];
  for (const pair of result.pairs) {
    const s = pair.summary;
    lines.push('');
    lines.push(`  ${pair.label} — ${s.captures} captures, ${s.screens} screens`);
    lines.push('');
    lines.push('  #   Screen              Differs Worst    Where');
    lines.push('  --- ------------------- ------- -------- ------------------------');
    pair.screens.forEach((row, i) => {
      const under = row.changed > 0 && row.worst < threshold;
      lines.push('  ' + [
        String(i + 1).padEnd(3),
        row.screen.padEnd(19),
        `${row.changed}/${row.captures.length}`.padEnd(7),
        (pct(row.worst) + (under ? '*' : '')).padEnd(8),
        row.region ? (row.rows ? `${row.region}, rows ${pct(row.rows.from)}-${pct(row.rows.to)}` : row.region) : '—',
      ].join(' '));
    });
    if (pair.screens.some((r) => r.changed > 0 && r.worst < threshold)) {
      lines.push('');
      lines.push(`  * under the ${pct(threshold)} threshold — reported, not counted as changed`);
    }
    const moved = pair.captures.filter((c) => c.verdict !== 'same');
    if (moved.length) {
      lines.push('');
      lines.push('  Screen              State       Δ px      Δ %       Region                        Box');
      lines.push('  ------------------- ---------- --------- --------- --------------------------- ----------------------');
      for (const c of moved) {
        lines.push('  ' + [
          c.screen.padEnd(19),
          (c.state || '—').padEnd(10),
          (c.changed === 0 ? '—' : String(c.changed)).padEnd(9),
          (c.changed === 0 ? '—' : pct(c.ratio)).padEnd(9),
          describeRegion(c).padEnd(27),
          describeBox(c),
        ].join(' '));
      }
    }
    lines.push('');
    lines.push(`  ${s.screensDiffer} of ${s.screens} screens differ · ${s.changed} capture(s) changed` +
      `${s.noise ? `, ${s.noise} under threshold` : ''}` +
      `${s.same ? `, ${s.same} identical` : ''}` +
      `${s.incomparable ? `, ${s.incomparable} incomparable` : ''}`);
    if (s.added || s.gone) {
      lines.push(`  ${s.added} new · ${s.gone} gone — a screen or state that appeared or vanished is a list change, not a rendering one`);
    }
  }
  for (const u of result.unmatched) {
    lines.push('');
    lines.push(`  ${u.label} — only in the ${u.side} run, nothing to compare against`);
  }
  return lines.join('\n');
}

function oldSummary(s) {
  return `${s.captures} captures, ${s.screens} screens`;
}

/**
 * The changed pixels' extent, as a percentage of the screen. The 3x5 region
 * name says *what kind* of thing moved; this says how far — a clock is 6% of
 * the width and 1% of the height, a table gaining a column is 40% of the width
 * and most of the height, and the difference between those two is the review.
 */
function describeBox(c) {
  if (!c.bbox || !c.width) return '—';
  const b = c.bbox;
  const w = ((b.x1 - b.x0 + 1) / c.width) * 100;
  const h = ((b.y1 - b.y0 + 1) / c.height) * 100;
  return `${w.toFixed(0)}%w x ${h.toFixed(0)}%h at ${b.y0},${b.x0}`;
}

/**
 * The side-by-side sheet.
 *
 * A triptych per capture that moved: the old picture, the new one, and the new
 * one with every changed pixel painted. The images are *copied in* rather than
 * referenced, so the directory is something you can attach to a review or open
 * from a disk image, and so it works the same from a file:// URL and from a
 * server rooted anywhere.
 */
function writeSheet(result, outDir, opts = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const assets = path.join(outDir, 'shots');
  fs.mkdirSync(assets, { recursive: true });
  const cards = [];
  for (const pair of result.pairs) {
    for (const c of pair.captures) {
      if (c.verdict === 'same' || c.verdict === 'new' || c.verdict === 'gone') continue;
      const base = `${c.screen}__${c.state}`.replace(/[^a-z0-9_-]/gi, '-');
      const oldCopy = path.join(assets, `old-${base}.png`);
      const newCopy = path.join(assets, `new-${base}.png`);
      fs.copyFileSync(c.oldFile, oldCopy);
      fs.copyFileSync(c.newFile, newCopy);
      let diffName = null;
      if (c.diff) {
        diffName = `diff-${base}.png`;
        fs.writeFileSync(path.join(assets, diffName), PNG.sync.write(c.diff));
      }
      cards.push({ ...c, oldRel: path.relative(outDir, oldCopy), newRel: path.relative(outDir, newCopy), diffRel: diffName ? path.relative(outDir, path.join(assets, diffName)) : null });
    }
  }
  const index = path.join(outDir, 'index.html');
  fs.writeFileSync(index, sheetHtml(result, cards, opts));
  return { index, count: cards.length };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function sheetHtml(result, cards, opts) {
  const head = `<!doctype html>
<meta charset="utf-8">
<title>sweep diff</title>
<style>
  body { font: 13px/1.45 -apple-system, system-ui, sans-serif; margin: 20px; background: #0f0f11; color: #e8e8ea; }
  h1 { font-size: 17px; margin: 0 0 4px; }
  p.meta { color: #8e8e96; margin: 0 0 18px; }
  .pair { margin: 0 0 26px; }
  h2 { font-size: 14px; margin: 22px 0 6px; font-weight: 600; }
  .card { margin: 0 0 18px; padding: 12px; background: #17171a; border: 1px solid #2a2a30; border-radius: 8px; }
  .card h3 { font-size: 13px; margin: 0 0 2px; font-weight: 600; }
  .card .verdict { color: #8e8e96; margin: 0 0 10px; }
  .triptych { display: flex; gap: 10px; align-items: flex-start; }
  figure { margin: 0; flex: 1 1 0; min-width: 0; }
  figcaption { color: #8e8e96; padding: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  img { width: 100%; border: 1px solid #2a2a30; display: block; }
  .changed { color: #ff3b30; font-weight: 600; }
  .noise { color: #ffd60a; }
  .incomparable { color: #ff9f0a; }
  .empty { color: #8e8e96; font-style: italic; }
</style>`;
  const body = result.pairs.map((pair) => {
    const s = pair.summary;
    const mine = cards.filter((c) => pair.captures.some((p) => p.key === c.key));
    const rows = mine.map((c) => `      <div class="card">
        <h3>${esc(c.screen)} <span class="${c.verdict}">${esc(c.state)}</span></h3>
        <p class="verdict">${c.changed ? `${c.changed.toLocaleString()} px · ${pct(c.ratio)} · ${esc(describeRegion(c))} · ${esc(describeBox(c))}` : esc(describeRegion(c))}</p>
        <div class="triptych">
          <figure><figcaption>old</figcaption><img src="${esc(c.oldRel)}" alt=""></figure>
          <figure><figcaption>new</figcaption><img src="${esc(c.newRel)}" alt=""></figure>
          <figure><figcaption>changed pixels</figcaption>${c.diffRel ? `<img src="${esc(c.diffRel)}" alt="">` : '<p class="empty">not drawn</p>'}</figure>
        </div>
      </div>`).join('\n');
    const above = s.changed;
    const under = s.noise;
    const headline = above
      ? `${s.screensDiffer} of ${s.screens} screens differ, ${above} capture${above === 1 ? '' : 's'} above the threshold`
      : `nothing above the ${pct(opts.threshold)} threshold` +
        (under ? ` · ${under} capture${under === 1 ? '' : 's'} differ by less` : '');
    return `  <div class="pair">
    <h2>${esc(pair.label)} — ${headline}</h2>
${rows || '    <p class="empty">No capture differs.</p>'}
  </div>`;
  }).join('\n');
  return `${head}
<h1>Sweep diff</h1>
<p class="meta">old: ${esc(result.pairs.map((p) => p.oldDir).join(', '))}<br>new: ${esc(result.pairs.map((p) => p.newDir).join(', '))}<br>tolerance ${opts.tolerance} per channel · threshold ${pct(opts.threshold)}${opts.tolerance === DEFAULT_TOLERANCE && opts.threshold === DEFAULT_THRESHOLD ? ' (defaults)' : ''}</p>
${body}
`;
}

/** The whole thing, as a function: what a test and the CLI both call. */
function run(argv) {
  const opts = { tolerance: DEFAULT_TOLERANCE, threshold: DEFAULT_THRESHOLD, out: null, json: false, sheet: true };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--no-sheet') opts.sheet = false;
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--tolerance') opts.tolerance = Number(argv[++i]);
    else if (a === '--threshold') opts.threshold = Number(argv[++i]);
    else if (a === '-h' || a === '--help') return { help: true };
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else positional.push(a);
  }
  if (positional.length !== 2) throw new Error('needs OLD and NEW directories');
  if (!Number.isFinite(opts.tolerance) || opts.tolerance < 0) throw new Error('--tolerance wants a number');
  if (!Number.isFinite(opts.threshold) || opts.threshold < 0) throw new Error('--threshold wants a number');
  const [oldDir, newDir] = positional.map((d) => path.resolve(d));
  const result = compareRuns(oldDir, newDir, opts);

  // Beside the new run, never inside either: a diff image left in a sweep
  // directory is a capture the next diff compares against a real one.
  let sheet = null;
  if (opts.sheet) {
    const outDir = opts.out ? path.resolve(opts.out) : `${newDir}-diff`;
    if (outDir === newDir || outDir.startsWith(`${newDir}${path.sep}`) ||
        outDir === oldDir || outDir.startsWith(`${oldDir}${path.sep}`)) {
      throw new Error('--out must not be inside either sweep directory');
    }
    sheet = writeSheet(result, outDir, opts);
  }
  const changed = result.pairs.some((p) => p.summary.changed > 0);
  return { result, sheet, changed, opts };
}

function main() {
  let out;
  try {
    out = run(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`sweep-diff: ${e.message}\n`);
    process.exit(2);
  }
  if (out.help) {
    process.stdout.write(
      'usage: node scripts/sweep-diff.js OLD NEW [--out DIR] [--tolerance N] [--threshold N] [--json] [--no-sheet]\n');
    return;
  }
  if (out.opts.json) {
    // The numbers, without the diff bitmaps, which are megabytes of base64.
    const lean = (c) => {
      const { diff, ...rest } = c;
      return rest;
    };
    process.stdout.write(JSON.stringify({
      tolerance: out.opts.tolerance, threshold: out.opts.threshold,
      pairs: out.result.pairs.map((p) => ({ ...p, captures: p.captures.map(lean) })),
      unmatched: out.result.unmatched,
    }, null, 2) + '\n');
  } else {
    process.stdout.write(formatReport(out.result, out.opts) + '\n');
    if (out.sheet) {
      process.stdout.write(`\n  side-by-side: ${out.sheet.index} (${out.sheet.count} capture${out.sheet.count === 1 ? '' : 's'})\n`);
    }
  }
  // 0 = nothing moved materially, 1 = something did, 2 = could not tell. A
  // capture under the threshold does not fail the run — the status-bar clock
  // moves on every sweep, and a check that fails on the clock is a check
  // nobody runs. It is still in the report.
  process.exit(out.changed ? 1 : 0);
}

module.exports = {
  DEFAULT_TOLERANCE, DEFAULT_THRESHOLD,
  parseRun, discoverRuns, diffPixels, compareRunPair, compareRuns,
  formatReport, writeSheet, regionName, run,
};

if (require.main === module) main();
