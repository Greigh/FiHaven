#!/usr/bin/env node
'use strict';

/**
 * Print whether APNs / FCM env vars and local credential files look ready.
 * Safe to run locally or on the server (loads .env from cwd).
 */
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');

function status(label, ok, detail) {
  const mark = ok ? '✅' : '❌';
  console.log(`${mark} ${label}${detail ? `: ${detail}` : ''}`);
}

const apnsVars = ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_KEY_PATH'];
const fcmVar = 'FCM_SERVICE_ACCOUNT_JSON';

const apnsEnv = apnsVars.every((k) => process.env[k]);
const fcmEnv = !!process.env[fcmVar];

const apnsPath = process.env.APNS_KEY_PATH;
const fcmPath = process.env[fcmVar];

function resolveLocal(p, fallback) {
  if (p && fs.existsSync(p)) return p;
  const local = path.join(__dirname, '..', fallback);
  return fs.existsSync(local) ? local : p;
}

const apnsResolved = resolveLocal(apnsPath, 'data/apns-key.p8');
const fcmResolved = resolveLocal(fcmPath, 'data/firebase-sa.json');

const apnsFile = apnsResolved && fs.existsSync(apnsResolved);
const fcmFile = fcmResolved && fs.existsSync(fcmResolved);

status('APNs env vars', apnsEnv, apnsEnv ? apnsVars.map((k) => k).join(', ') : 'set APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_PATH');
status('APNs key file', !!apnsFile, apnsResolved || '(missing)');
status('FCM env var', fcmEnv, fcmEnv ? fcmVar : 'set FCM_SERVICE_ACCOUNT_JSON');
status('FCM SA JSON file', !!fcmFile, fcmResolved || '(missing)');

const gsPath = path.join(__dirname, '..', 'android', 'app', 'google-services.json');
status('Android google-services.json', fs.existsSync(gsPath), gsPath);

try {
  const push = require('../server/push');
  status('Server push module', push.configured(), push.configured() ? 'ready to send' : 'env-gated off');
} catch (e) {
  status('Server push module', false, e.message);
}

process.exit(apnsEnv && apnsFile && fcmEnv && fcmFile ? 0 : 1);
