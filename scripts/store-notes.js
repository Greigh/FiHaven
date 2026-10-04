#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   store-notes.js — measure the paste-ready copy blocks in
   docs/release-notes against the store consoles' hard caps.

     node scripts/store-notes.js            # report every block's length
     node scripts/store-notes.js --check    # exit 1 if any block is over (CI)

   The caps are the consoles', not ours: Google Play's "What's new" is a
   hard 500 per language and TestFlight's "What to Test" and the App
   Store's "What's New" are a hard 4000, and each one is refused at
   submission — which is the moment to be doing anything else. Each
   notes file keeps its paste text in a fenced block under a
   `## Google Play` / `## TestFlight` / `## App Store` heading, so the
   block can be measured before the paste rather than during it.

   Two verdicts per block: over its cap, and — because the files state
   their own counts in prose (`> 302 / 500 characters`) — a stated
   count that no longer matches its block. Only an `N / cap` whose
   denominator is that store's cap counts as a claim, so "is 500
   characters" and "build 58 / versionCode 58" do not.

   A store heading with no fenced block is a pointer, not a failure —
   sections that say "same as the Play text above" or carry nothing to
   paste yet (a beta never promoted) are reported but do not fail.
═══════════════════════════════════════════════════════════ */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NOTES_DIR = path.join(ROOT, 'docs', 'release-notes');

/* The caps, keyed by the word a `## ` heading starts with. Headings like
   "Purchases in TestFlight and App Review" are not copy sections, so the
   store name must lead the heading. */
const STORES = [
  { match: /^google play\b/i, name: 'Google Play', cap: 500 },
  { match: /^testflight\b/i, name: 'TestFlight', cap: 4000 },
  { match: /^app store\b/i, name: 'App Store', cap: 4000 },
];

/* `N / cap` — numerator may carry a comma (`3,634 / 4000`), the
   denominator either spelling (4000 or 4,000). */
const statedCountRe = /(\d[\d,]*)\s*\/\s*(\d[\d,]*)/g;
const toInt = (s) => parseInt(s.replace(/,/g, ''), 10);

function* notesFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* notesFiles(p);
    else if (entry.name.endsWith('.md')) yield p;
  }
}

/* Split a file into its `## ` sections, body running to the next heading
   or EOF. Non-store sections (maintainer notes, deploy warnings) come
   along too — their fenced blocks are commands, not copy, and the store
   match below ignores them. */
function sections(text) {
  const re = /^##[ \t]+(.+)$/gm;
  const heads = [];
  let m;
  while ((m = re.exec(text))) heads.push({ heading: m[1].trim(), start: m.index, end: re.lastIndex });
  return heads.map((h, i) => ({
    heading: h.heading,
    body: text.slice(h.end, heads[i + 1] ? heads[i + 1].start : text.length),
  }));
}

/* The first fenced block in a store section is the copy that gets pasted.
   The count drops the closing newline — the paste is the text, and the
   stated counts the files were measured against confirm that convention. */
const FENCE_RE = /^```[^\n]*\n([\s\S]*?)^```/m;
function firstFence(body) {
  const m = FENCE_RE.exec(body);
  return m ? m[1].replace(/\n$/, '') : null;
}

function checkFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const failures = [];
  const notes = [];

  const measured = new Map(); // store name -> block length

  for (const sec of sections(text)) {
    const store = STORES.find((s) => s.match.test(sec.heading));
    if (!store) continue;

    const copy = firstFence(sec.body);
    if (copy === null) {
      notes.push(`${rel}: "${sec.heading}" has no fenced block`);
      continue;
    }
    const len = copy.length; // UTF-16 units — what a pasted field counts
    measured.set(store.name, len);
    if (len > store.cap) {
      failures.push(`${rel}: ${store.name} block is ${len} characters — over the ${store.cap} cap by ${len - store.cap}`);
    }

    /* A count stated inside the section (`> 302 / 500 characters`) must
       be the block's real length; drift means the prose was edited after
       the block was. The fence is stripped first so the copy's own text
       cannot be mistaken for a claim about itself. */
    const prose = sec.body.replace(FENCE_RE, '');
    let sm;
    statedCountRe.lastIndex = 0;
    while ((sm = statedCountRe.exec(prose))) {
      if (toInt(sm[2]) === store.cap && toInt(sm[1]) !== len) {
        failures.push(`${rel}: ${store.name} states ${sm[1]} / ${sm[2]} but the block measures ${len}`);
      }
    }
  }

  /* The same claims get stated in the file's own prose ahead of the
     sections — `Play **362 / 500**, TestFlight **3,634 / 4000**` — so the
     preamble before the first `## ` heading gets the name-anchored pass:
     a store name, some non-digit prose, then `N / cap` where the cap is
     that store's. Anything without the slash is a limit statement, not a
     count, and is not a claim this check reads. */
  const preamble = text.slice(0, /^##[ \t]/m.exec(text)?.index ?? text.length);
  for (const store of STORES) {
    const re = new RegExp(
      `\\b${store.name.replace(' ', '\\s+')}\\b[^\\d\\n]{0,40}?(\\d[\\d,]*)\\s*\\/\\s*(\\d[\\d,]*)`, 'gi');
    let sm;
    while ((sm = re.exec(preamble))) {
      const real = measured.get(store.name);
      if (real !== undefined && toInt(sm[2]) === store.cap && toInt(sm[1]) !== real) {
        failures.push(`${rel}: preamble states ${store.name} ${sm[1]} / ${sm[2]} but the block measures ${real}`);
      }
    }
  }
  return { failures, notes };
}

const files = [...notesFiles(NOTES_DIR)].sort();
const all = files.map((f) => checkFile(f));
const failures = all.flatMap((r) => r.failures);
const notes = all.flatMap((r) => r.notes);

if (failures.length) {
  console.error('Store notes out of limits:');
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

if (process.argv.includes('--check')) {
  console.log(`Store release notes within caps (${files.length} files checked${notes.length ? `, ${notes.length} sections carry no paste block` : ''}).`);
} else {
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const parts = [];
    for (const sec of sections(fs.readFileSync(file, 'utf8'))) {
      const store = STORES.find((s) => s.match.test(sec.heading));
      if (!store) continue;
      const copy = firstFence(sec.body);
      parts.push(`${store.name} ${copy === null ? 'no block' : `${copy.length}/${store.cap}`}`);
    }
    if (parts.length) console.log(`${rel}  ${parts.join(' · ')}`);
  }
}
process.exit(0);
