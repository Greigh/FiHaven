#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   sh-parse.js — run `bash -n` over every shell script in the
   tree, so a syntax error is caught here rather than by the
   first sweep or deploy that sources it.

     node scripts/sh-parse.js            # list every script and parse it
     node scripts/sh-parse.js --check    # exit 1 on the first failure (CI)

   A script that does not parse is found today by starting a sweep —
   sixteen minutes of launches before the shell gets to the line that
   is broken. `bash -n` answers the same question in milliseconds, so
   this runs over the whole tree instead of trusting the entry point:
   run-macos.sh sources sweep-matrix.sh, and a breakage in the sourced
   file is the same failure with a longer fuse.
═══════════════════════════════════════════════════════════ */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// Directories a find would descend into that hold vendored or generated
// trees rather than shell scripts we maintain. Everything else is walked:
// scripts/, its examples/, the ios/ build hooks, docs/, the root upload.sh.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage']);

function* shellScripts(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* shellScripts(p);
    } else if (entry.name.endsWith('.sh')) {
      yield p;
    }
  }
}

function parse(file) {
  const res = spawnSync('bash', ['-n', file], { encoding: 'utf8' });
  return { file: path.relative(ROOT, file), status: res.status ?? 1, stderr: (res.stderr || '').trim() };
}

const scripts = [...shellScripts(ROOT)].sort();
const results = scripts.map(parse);
const failed = results.filter((r) => r.status !== 0);

if (process.argv.includes('--check')) {
  if (failed.length) {
    console.error('Shell scripts that do not parse:');
    for (const f of failed) {
      console.error(`  ${f.file}`);
      f.stderr.split('\n').forEach((line) => console.error(`    ${line}`));
    }
    process.exit(1);
  }
  console.log(`All ${scripts.length} shell scripts parse (bash -n).`);
  process.exit(0);
}

for (const r of results) {
  console.log(`${r.status === 0 ? 'ok  ' : 'FAIL'}  ${r.file}`);
  if (r.stderr) r.stderr.split('\n').forEach((line) => console.log(`      ${line}`));
}
process.exit(failed.length ? 1 : 0);
