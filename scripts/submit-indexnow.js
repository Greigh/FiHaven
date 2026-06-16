#!/usr/bin/env node
'use strict';

/* ═══════════════════════════════════════════════════════════
   submit-indexnow.js — ping IndexNow after marketing page updates.
   https://www.indexnow.org/documentation

   Requires INDEXNOW_KEY in .env (8–128 hex chars). The matching
   {key}.txt file is emitted to dist/ at build time and must be live
   at https://fihaven.app/{key}.txt before submitting.

   Usage:
     npm run indexnow
     npm run indexnow -- https://fihaven.app/faq   # extra URLs
═══════════════════════════════════════════════════════════ */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { publicOrigin, publicUrls } = require('./indexnow-urls');

const ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
];

const KEY_RE = /^[a-f0-9]{8,128}$/i;

function usage() {
  console.error('Usage: npm run indexnow [-- <url> …]');
  process.exit(1);
}

function parseArgs(argv) {
  const extras = [];
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--help' || argv[i] === '-h') usage();
    extras.push(argv[i]);
  }
  return extras;
}

async function verifyKeyFile(origin, key) {
  const keyLocation = `${origin}/${key}.txt`;
  const res = await fetch(keyLocation, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`key file not reachable (${res.status}): ${keyLocation}`);
  }
  const body = (await res.text()).trim();
  if (body !== key) {
    throw new Error(`key file content mismatch at ${keyLocation}`);
  }
  return keyLocation;
}

async function submitEndpoint(endpoint, payload) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => '');
  return { endpoint, status: res.status, ok: res.ok || res.status === 202, body: text };
}

async function main() {
  const key = (process.env.INDEXNOW_KEY || '').trim();
  if (!key) {
    console.warn('INDEXNOW_KEY not set — skipping IndexNow');
    process.exit(0);
  }
  if (!KEY_RE.test(key)) {
    console.error('INDEXNOW_KEY must be 8–128 hexadecimal characters');
    process.exit(1);
  }

  const origin = publicOrigin();
  const host = new URL(origin).host;
  const extras = parseArgs(process.argv);
  const urlList = [...new Set([...publicUrls(origin), ...extras])];

  if (urlList.length > 10000) {
    console.error('IndexNow accepts at most 10,000 URLs per request');
    process.exit(1);
  }

  const keyLocation = await verifyKeyFile(origin, key);
  const payload = { host, key, keyLocation, urlList };

  console.log(`IndexNow: ${urlList.length} URL(s) → ${host}`);
  let anyOk = false;
  for (const endpoint of ENDPOINTS) {
    const result = await submitEndpoint(endpoint, payload);
    const label = result.ok ? 'ok' : 'warn';
    console.log(`  [${label}] ${endpoint} → HTTP ${result.status}`);
    if (result.body && !result.ok) {
      console.log(`         ${result.body.trim().slice(0, 200)}`);
    }
    if (result.ok) anyOk = true;
  }

  if (!anyOk) {
    console.error('IndexNow submission failed on all endpoints');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
