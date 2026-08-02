#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   scripts/dev/paddle-webhook-check.js — drive the Paddle webhook
   handler with a correctly-signed payload (not wired into the app).

   Paddle's dashboard "Send a test" proves the endpoint is reachable and
   that the signature matches, but its simulated payloads carry synthetic
   ids and no `custom_data.userId` — so the handler resolves no account
   and no entitlement is ever written. That leaves the half that actually
   matters untested: attribution and fulfillment.

   This script closes that gap. It mints a real HMAC signature the same
   way Paddle does (see server/paddle.js) over a payload naming a REAL
   local account, so the full path runs: verify → resolve user → upsert
   subscription → recompute entitlement.

   Run from repo root:
     npm run paddle:webhook -- --user you@example.com
     npm run paddle:webhook -- --user 1 --event subscription.canceled
     npm run paddle:webhook -- --user 1 --plan family

   Modes:
     (default)     call the handler in-process. The route's IP allowlist
                   can never pass from a dev machine, so going in-process
                   is the only way to exercise fulfillment locally.
     --url <base>  POST over HTTP instead, to test the route itself.

   Reads .env from the repo root (PADDLE_WEBHOOK_SECRET + price ids).

   WRITES TO THE DATABASE: a successful run grants the named user Pro.
   Undo with the dev portal, or `--event subscription.canceled`.
═════════════════════════════════════════════════════════════════ */

'use strict';

const path = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '../../.env'), quiet: true });

/* ── args ────────────────────────────────────────────────────── */

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function flag(name) { return process.argv.includes('--' + name); }

const EVENTS = [
  'subscription.created',
  'subscription.updated',
  'subscription.canceled',
  'subscription.past_due',
  'subscription.paused',
  'transaction.completed',
];

const who = arg('user');
const event = arg('event', 'subscription.created');
const plan = arg('plan', 'yearly');
const target = arg('url');
const subId = arg('sub', 'sub_01dev' + crypto.randomBytes(6).toString('hex'));
const customerId = arg('customer', 'ctm_01dev' + crypto.randomBytes(6).toString('hex'));

if (flag('help') || !who) {
  console.log(`
Usage: npm run paddle:webhook -- --user <id|email> [options]

  --user <id|email>  account the webhook is attributed to   (required)
  --event <type>     ${EVENTS.join('\n                     ')}
  --plan <name>      monthly | yearly | family              (default yearly)
  --sub <sub_...>    reuse a subscription id (needed to cancel one you made)
  --url <base>       POST to a running server instead of in-process
                     e.g. --url http://localhost:${process.env.PORT || 5222}
  --force            allow --url to target a non-local host
`);
  process.exit(who ? 0 : 1);
}

if (!EVENTS.includes(event)) {
  console.error(`Unknown --event "${event}".\nExpected one of:\n  ${EVENTS.join('\n  ')}`);
  process.exit(1);
}

const secret = process.env.PADDLE_WEBHOOK_SECRET;
if (!secret) {
  console.error('PADDLE_WEBHOOK_SECRET is not set in .env — nothing to sign with.');
  process.exit(1);
}

const PRICE_ENV = { monthly: 'PADDLE_PRICE_MONTHLY', yearly: 'PADDLE_PRICE_YEARLY', family: 'PADDLE_PRICE_FAMILY' };
if (!PRICE_ENV[plan]) {
  console.error(`Unknown --plan "${plan}". Expected monthly, yearly, or family.`);
  process.exit(1);
}
const priceId = process.env[PRICE_ENV[plan]];
if (!priceId) {
  console.error(`${PRICE_ENV[plan]} is not set in .env, so the payload would carry no price id.`);
  process.exit(1);
}

// A valid signature is a Pro grant. The production endpoint IP-gates us out
// anyway, but never let a stray --url quietly forge one at a real host.
if (target && !flag('force')) {
  const host = (() => { try { return new URL(target).hostname; } catch { return ''; } })();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    console.error(`Refusing to send a signed payload to "${host}".\n` +
      'This mints a real, valid Paddle signature. Pass --force if you meant it.');
    process.exit(1);
  }
}

/* ── resolve the account ─────────────────────────────────────── */

const db = require('../../server/db');
const billing = require('../../server/billing');

const user = /^\d+$/.test(who) ? db.findUserById(Number(who)) : db.findUserByEmail(who);
if (!user) {
  console.error(`No such user: ${who}`);
  process.exit(1);
}

/* ── build a payload shaped like Paddle's ────────────────────── */

const DAY_MS = 86400000;
const now = new Date();
const periodDays = plan === 'monthly' ? 30 : 365;
const status = {
  'subscription.canceled': 'canceled',
  'subscription.past_due': 'past_due',
  'subscription.paused': 'paused',
}[event] || 'active';

const subscription = {
  id: subId,
  status,
  customer_id: customerId,
  custom_data: { userId: String(user.id) },
  current_billing_period: {
    starts_at: now.toISOString(),
    ends_at: new Date(now.getTime() + periodDays * DAY_MS).toISOString(),
  },
  items: [{ price: { id: priceId }, status: 'active' }],
  scheduled_change: null,
};

const data = event === 'transaction.completed'
  ? {
    id: 'txn_01dev' + crypto.randomBytes(6).toString('hex'),
    status: 'completed',
    subscription_id: subId,
    customer_id: customerId,
    custom_data: { userId: String(user.id) },
  }
  : subscription;

const body = JSON.stringify({
  event_id: 'evt_01dev' + crypto.randomBytes(6).toString('hex'),
  event_type: event,
  occurred_at: now.toISOString(),
  notification_id: 'ntf_01dev' + crypto.randomBytes(6).toString('hex'),
  data,
});

// Exactly Paddle's scheme: HMAC-SHA256 over "<ts>:<raw body>". Sign the same
// bytes we send — re-serializing would reorder keys and break verification.
const raw = Buffer.from(body, 'utf8');
const ts = Math.floor(Date.now() / 1000);
const h1 = crypto.createHmac('sha256', secret)
  .update(Buffer.concat([Buffer.from(ts + ':', 'utf8'), raw]))
  .digest('hex');
const signature = `ts=${ts};h1=${h1}`;

/* ── run it ──────────────────────────────────────────────────── */

function summarize(label, ent) {
  const e = ent || {};
  const until = e.expiresAt ? new Date(e.expiresAt).toISOString().slice(0, 10) : (e.pro ? 'lifetime' : '—');
  console.log(`  ${label.padEnd(7)} pro=${!!e.pro}  plan=${e.plan || '—'}  source=${e.source || '—'}` +
              `  renews=${!!e.autoRenew}  until=${until}`);
}

(async () => {
  console.log(`\nPaddle webhook check`);
  console.log(`  user     ${user.email} (id ${user.id})`);
  console.log(`  event    ${event}`);
  console.log(`  plan     ${plan} → ${priceId}`);
  console.log(`  sub      ${subId}`);
  console.log(`  mode     ${target ? 'HTTP → ' + target : 'in-process'}\n`);

  if (event === 'transaction.completed') {
    console.log('  note     transaction.completed re-fetches the subscription from the\n' +
                '           Paddle API. A synthetic --sub id will 404 there and the\n' +
                '           handler will no-op. Pass a real --sub to see it write.\n');
  }

  const before = billing.computeEntitlement(user.id);
  summarize('before', before);

  try {
    if (target) {
      const res = await fetch(target.replace(/\/$/, '') + '/api/billing/paddle/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Paddle-Signature': signature },
        body,
      });
      const text = await res.text();
      console.log(`\n  HTTP ${res.status} ${text.slice(0, 200)}`);
      if (res.status === 403) {
        console.log('\n  403 is the IP allowlist, not the signature: the request did not come\n' +
                    '  from one of Paddle\'s published IPs. Drop --url to test in-process.');
      }
    } else {
      const out = await billing.handlePaddleWebhook(raw, signature);
      console.log(`\n  handler → ${JSON.stringify(out)}`);
    }
  } catch (err) {
    console.error(`\n  FAILED: ${err.message}`);
    if (err.message === 'invalid-signature') {
      console.error('  The secret in .env does not match the one used to sign.');
    }
    process.exit(1);
  }

  const after = billing.computeEntitlement(user.id);
  summarize('after', after);

  const changed = JSON.stringify(before) !== JSON.stringify(after);
  console.log(`\n  ${changed ? '✅ entitlement changed' : '⚠️  entitlement unchanged'}\n`);
})();
