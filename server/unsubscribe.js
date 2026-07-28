/* ═══════════════════════════════════════════════════════════
   unsubscribe.js — signed, login-free opt-out links for the
   notification emails (reminders, digest, summary, offers).

   GDPR/ePrivacy and the Gmail/Yahoo bulk-sender rules both want an
   opt-out that works from the message itself — no sign-in, no
   support ticket. Every notification email therefore carries:

     • a visible "Manage preferences" link (→ /settings, notifications)
     • a visible "Unsubscribe" link  (→ /unsubscribe?t=…)
     • List-Unsubscribe + List-Unsubscribe-Post headers so the mail
       client's own one-click button hits POST /unsubscribe.

   The token is an HMAC over (userId, kind) — stateless, so it stays
   valid for the life of the address and no table has to be swept.
   Signing key is derived from the master key via HKDF, so there is
   no extra secret to deploy.
═════════════════════════════════════════════════════════════════ */

'use strict';

const crypto = require('crypto');
const mfa = require('./mfa');

// Each kind maps to the settings flag(s) the link turns off, plus the
// wording used on the confirmation page. 'all' is what the header-level
// one-click button uses when an email covers several categories.
const KINDS = {
  reminders: { flags: ['billReminders'], label: 'bill and trial reminders' },
  digest: { flags: ['weeklyDigest'], label: 'the weekly digest' },
  summary: { flags: ['monthlySummary'], label: 'the monthly summary' },
  offers: { flags: ['offerReminders'], label: 'card offer reminders' },
  all: {
    flags: ['billReminders', 'weeklyDigest', 'monthlySummary', 'offerReminders'],
    label: 'all FiHaven notification emails',
  },
};

let KEY = null;
function key() {
  if (!KEY) KEY = mfa.deriveKey('unsubscribe-link');
  return KEY;
}

function sign(payload) {
  return crypto.createHmac('sha256', key()).update(payload).digest('base64url');
}

/** Mint the opt-out token for (userId, kind). Stateless — no DB write. */
function token(userId, kind) {
  const k = KINDS[kind] ? kind : 'all';
  const payload = `${userId}.${k}`;
  return `${payload}.${sign(payload)}`;
}

/** Parse + verify a token. Returns { userId, kind } or null. */
function verify(raw) {
  if (typeof raw !== 'string') return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [id, kind, sig] = parts;
  if (!/^\d+$/.test(id) || !KINDS[kind]) return null;
  const expected = sign(`${id}.${kind}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { userId: parseInt(id, 10), kind };
}

/** Human-readable name of what a kind covers (for the confirmation page). */
function label(kind) {
  return (KINDS[kind] || KINDS.all).label;
}

/**
 * Turn the kind's flags off in the user's settings blob. Idempotent —
 * re-opening the link on an already-unsubscribed account is a no-op that
 * still reports success, which is what mail clients retrying expect.
 * Returns false only when the user no longer exists.
 */
function apply(userId, kind, db) {
  // Required lazily: emails.js pulls this module in just to mint links,
  // and minting shouldn't drag the SQLite connection along with it.
  const database = db || require('./db');
  const user = database.findUserById(userId);
  if (!user) return false;
  const data = database.getUserData(userId) || {};
  const settings = { ...(data.settings || {}) };
  for (const flag of (KINDS[kind] || KINDS.all).flags) settings[flag] = false;
  // upsertUserData REPLACES the record, so every list has to be in the
  // body — naming only `settings` here would erase the user's bills.
  database.upsertUserData(userId, { ...data, settings });
  return true;
}

module.exports = { token, verify, apply, label, KINDS };
