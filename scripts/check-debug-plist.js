#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   check-debug-plist.js — assert the iOS Debug Info.plist hasn't
   drifted from the Release one.

   project.yml points Release at Sources/Info.plist and Debug at
   Sources/Info.Debug.plist. The Debug copy must equal the Release
   copy plus exactly one key — NSAppTransportSecurity/
   NSAllowsLocalNetworking — which Debug needs to reach a local dev
   server (http://localhost:5222 or a LAN IP). Anything else that
   changes project.yml's `info.properties` regenerates Info.plist
   and silently leaves the Debug copy stale.

     node scripts/check-debug-plist.js          — verify
     bash ios/FiHavenApp/Scripts/sync-debug-plist.sh  — fix

   Textual diff is intentional: plutil's output is canonical, so
   byte equality after stripping the ATS block is the exact
   contract sync-debug-plist.sh produces.
═════════════════════════════════════════════════════════════════ */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'ios', 'FiHavenApp', 'Sources');
const release = fs.readFileSync(path.join(SRC, 'Info.plist'), 'utf8');
const debug = fs.readFileSync(path.join(SRC, 'Info.Debug.plist'), 'utf8');

function fail(msg) {
  console.error(`plist drift: ${msg}`);
  console.error('fix: bash ios/FiHavenApp/Scripts/sync-debug-plist.sh');
  process.exit(1);
}

if (release.includes('NSAppTransportSecurity')) {
  fail('Sources/Info.plist must not carry NSAppTransportSecurity — ' +
    'the local-networking exception is Debug-only (Info.Debug.plist).');
}

const lines = debug.split('\n');
const keyIdx = lines.findIndex((l) => l.trim() === '<key>NSAppTransportSecurity</key>');
if (keyIdx === -1) {
  fail('Sources/Info.Debug.plist is missing NSAppTransportSecurity/' +
    'NSAllowsLocalNetworking — Debug builds cannot reach a local dev server without it.');
}
if (lines[keyIdx + 1]?.trim() !== '<dict>') {
  fail('NSAppTransportSecurity in Info.Debug.plist is not a <dict> block — unexpected shape.');
}
const dictEnd = lines.findIndex((l, i) => i > keyIdx + 1 && l.trim() === '</dict>');
const inner = lines.slice(keyIdx + 2, dictEnd).map((l) => l.trim());
if (dictEnd === -1 || inner.length !== 2 ||
    inner[0] !== '<key>NSAllowsLocalNetworking</key>' || inner[1] !== '<true/>') {
  fail('the Debug ATS block must hold exactly NSAllowsLocalNetworking=true ' +
    `— found [${inner.join(', ')}]. A broader exception belongs nowhere in the repo.`);
}

const stripped = [...lines.slice(0, keyIdx), ...lines.slice(dictEnd + 1)].join('\n');
if (stripped !== release) {
  fail('Info.Debug.plist differs from Info.plist beyond the ATS block — ' +
    'someone changed info.properties without re-running the sync script.');
}

console.log('plist check: Debug = Release + NSAllowsLocalNetworking only.');
