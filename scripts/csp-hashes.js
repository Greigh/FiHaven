#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   csp-hashes.js — recompute the SHA-256 hashes of every inline
   <script> in client/*.html for the CSP allowlist.

   The CSP names inline scripts by hash instead of using
   'unsafe-inline', so EDITING ANY INLINE SCRIPT BREAKS THE PAGE
   until its hash is updated here. Run this and paste the output into
   INLINE_SCRIPT_HASHES in server/securityHeaders.js.

     node scripts/csp-hashes.js
     node scripts/csp-hashes.js --check    # exit 1 if out of date (CI)
═══════════════════════════════════════════════════════════ */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Both directories ship HTML: client/ is Vite-processed, client/public/ is
// copied verbatim (it holds the OAuth return pages the Android sign-in flow
// lands on). Missing the second set is exactly the kind of gap that only shows
// up as a broken sign-in once the CSP is enforcing.
const HTML_DIRS = [
  path.join(__dirname, '..', 'client'),
  path.join(__dirname, '..', 'client', 'public'),
];

// Matches <script> elements with no src attribute — i.e. the inline ones.
const INLINE_SCRIPT_RE = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g;

function collect() {
  const found = new Map(); // hash -> Set(files)
  for (const dir of HTML_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(dir, file), 'utf8');
      let m;
      while ((m = INLINE_SCRIPT_RE.exec(html))) {
        // The hash covers the element's exact text content, byte for byte.
        const hash = crypto.createHash('sha256').update(m[1], 'utf8').digest('base64');
        if (!found.has(hash)) found.set(hash, new Set());
        found.get(hash).add(path.basename(dir) + '/' + file);
      }
    }
  }
  return found;
}

const found = collect();

if (process.argv.includes('--check')) {
  const { INLINE_SCRIPT_HASHES } = require('../server/securityHeaders');
  const missing = [...found.keys()].filter(
    (h) => !INLINE_SCRIPT_HASHES.includes(h)
  );
  if (missing.length) {
    console.error('CSP hash list is out of date. Missing:');
    for (const h of missing) {
      console.error(`  'sha256-${h}'  (${[...found.get(h)].join(', ')})`);
    }
    console.error('\nRun: node scripts/csp-hashes.js');
    process.exit(1);
  }
  console.log(`CSP hash list is current (${found.size} inline scripts).`);
  process.exit(0);
}

console.log('Paste into INLINE_SCRIPT_HASHES in server/securityHeaders.js:\n');
for (const [hash, files] of found) {
  console.log(`  // ${[...files].join(', ')}`);
  console.log(`  "'sha256-${hash}'",`);
}
