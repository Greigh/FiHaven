/* ═══════════════════════════════════════════════════════════
   routes/account.js — authenticated account management.
   Mounted at /api/account.  All routes require a valid session;
   the state-changing ones also require the CSRF header and a
   re-entered password.
     POST /change-password
     POST /change-email
     POST /delete
     GET  /export
═════════════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const dbApi = require('../db');
const mfa = require('../mfa');
const { requireAuth, requireVerified, requireCsrf, destroySession } = require('../session');
const {
  normalizeEmail,
  isValidEmail,
  checkPasswordPolicy,
  sendError,
  BCRYPT_COST,
} = require('../util');

const router = express.Router();

// Re-checks the signed-in user's password. Returns the user row on
// success, or null when the password is wrong / user is missing.
async function verifyPassword(userId, password) {
  const user = dbApi.findUserById(userId);
  if (!user) return null;
  const ok = await bcrypt.compare(String(password || ''), user.password_hash);
  return ok ? user : null;
}

// Second-factor gate for destructive actions. When TOTP is enrolled, a valid
// current code is required (mirrors the /mfa/totp/disable precedent). When no
// TOTP is enrolled, the re-entered password alone authorizes the action.
// Returns null on success, or an { status, error } to send back.
function checkSecondFactor(user, code) {
  const totp = dbApi.getTotp(user.id);
  if (!totp || !totp.enabled_at) return null; // no TOTP enrolled → password-only
  let secret;
  try { secret = mfa.decrypt(totp.secret_enc); }
  catch (_) { return { status: 500, error: 'decrypt-failed' }; }
  if (!mfa.verifyTotpCode(secret, code, user.email)) {
    return { status: 401, error: 'invalid-totp-code' };
  }
  return null;
}

/* ── POST /api/account/change-password ───────────────────────── */

router.post('/change-password', requireAuth, requireCsrf, async (req, res) => {
  const body = req.body || {};

  const user = await verifyPassword(req.user.id, body.currentPassword);
  if (!user) return sendError(res, 401, 'wrong-password');

  const pwError = checkPasswordPolicy(body.newPassword, user.email);
  if (pwError) return sendError(res, 400, pwError);

  // Reject a no-op change so "new password" actually means new.
  const same = await bcrypt.compare(String(body.newPassword), user.password_hash);
  if (same) return sendError(res, 400, 'password-unchanged');

  const hash = await bcrypt.hash(body.newPassword, BCRYPT_COST);
  dbApi.updateUserPassword(user.id, hash);
  // Log out every other device; keep the current session.
  dbApi.deleteOtherSessions(user.id, req.session.id);

  return res.json({ ok: true });
});

/* ── POST /api/account/onboarded ─────────────────────────────── */
// Mark the first-run onboarding flow complete (idempotent). Every exit
// from the welcome flow calls this so it shows only once.

router.post('/onboarded', requireAuth, requireVerified, requireCsrf, (req, res) => {
  dbApi.setOnboarded(req.user.id);
  return res.json({ ok: true });
});

/* ── POST /api/account/change-name ───────────────────────────── */
// No password re-entry: name is low-risk and the user is already
// authenticated by session + CSRF. Empty string clears the name.

router.post('/change-name', requireAuth, requireCsrf, (req, res) => {
  const raw = (req.body && req.body.name) ?? '';
  const name = String(raw).trim().slice(0, 80);
  // Reject any control character (newlines, tabs, DEL, etc.)
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return sendError(res, 400, 'invalid-name');
  }
  dbApi.updateUserName(req.user.id, name || null);
  return res.json({ ok: true, name: name || null });
});

/* ── POST /api/account/change-email ──────────────────────────── */

router.post('/change-email', requireAuth, requireCsrf, async (req, res) => {
  const body = req.body || {};

  const user = await verifyPassword(req.user.id, body.password);
  if (!user) return sendError(res, 401, 'wrong-password');

  const newEmail = normalizeEmail(body.newEmail);
  if (!isValidEmail(newEmail)) return sendError(res, 400, 'invalid-email');
  if (newEmail === user.email) return sendError(res, 400, 'email-unchanged');

  const existing = dbApi.findUserByEmail(newEmail);
  if (existing) return sendError(res, 409, 'email-taken');

  try {
    dbApi.updateUserEmail(user.id, newEmail);
  } catch (err) {
    if (err && /UNIQUE/.test(String(err.message))) {
      return sendError(res, 409, 'email-taken');
    }
    console.error('change-email failed:', err);
    return sendError(res, 500, 'server-error');
  }

  return res.json({ ok: true, email: newEmail });
});

/* ── POST /api/account/delete ────────────────────────────────── */

router.post('/delete', requireAuth, requireCsrf, async (req, res) => {
  const body = req.body || {};

  const user = await verifyPassword(req.user.id, body.password);
  if (!user) return sendError(res, 401, 'wrong-password');

  // Re-confirm the second factor (TOTP) when one is enrolled.
  const sf = checkSecondFactor(user, body.code);
  if (sf) return sendError(res, sf.status, sf.error);

  // Removes the user row; sessions and user_data cascade-delete.
  dbApi.deleteUser(user.id);
  destroySession(req, res);

  return res.json({ ok: true });
});

/* ── POST /api/account/clear-data ────────────────────────────── */
// Erase selected groups of financial data without deleting the account.
// Settings are always preserved. Same gate as deletion: re-entered password
// plus a current TOTP code when 2FA is enrolled.
//   body.groups: subset of ['bills','cards','payments','bank']
const CLEARABLE_GROUPS = ['bills', 'cards', 'payments', 'bank'];

router.post('/clear-data', requireAuth, requireCsrf, async (req, res) => {
  const body = req.body || {};

  const user = await verifyPassword(req.user.id, body.password);
  if (!user) return sendError(res, 401, 'wrong-password');

  const sf = checkSecondFactor(user, body.code);
  if (sf) return sendError(res, sf.status, sf.error);

  const groups = Array.isArray(body.groups)
    ? body.groups.filter((g) => CLEARABLE_GROUPS.includes(g))
    : [];
  if (!groups.length) return sendError(res, 400, 'no-groups');

  const data = dbApi.getUserData(user.id);
  // Clearing a category also drops the payment records tied to it; the
  // standalone "payments" group wipes the full history.
  if (groups.includes('bills')) {
    data.bills = [];
    data.payments = data.payments.filter((p) => p && p.type !== 'bill');
  }
  if (groups.includes('cards')) {
    data.cards = [];
    data.payments = data.payments.filter((p) => p && p.type !== 'card');
  }
  if (groups.includes('payments')) {
    data.payments = [];
  }
  if (groups.includes('bank')) {
    data.accounts = [];
    data.transactions = [];
  }
  // settings are intentionally left untouched.
  dbApi.upsertUserData(user.id, data);

  return res.json({ ok: true, cleared: groups });
});

/* ── GET /api/account/export ─────────────────────────────────── */

router.get('/export', requireAuth, (req, res) => {
  const data = dbApi.getUserData(req.user.id);
  const payload = {
    account: { email: req.user.email },
    exportedAt: new Date().toISOString(),
    bills: data.bills,
    cards: data.cards,
    payments: data.payments,
    settings: data.settings,
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="fihaven-account-data.json"'
  );
  res.send(JSON.stringify(payload, null, 2));
});

/* ── GET /api/account/export/<type>.csv ──────────────────────── */
// CSV exports for the Settings page. Mirror the columns the
// dashboard's client-side exportCSV(...) produces so the files
// round-trip with the importer below.

function csvEscape(cell) {
  const s = String(cell == null ? '' : cell).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}
function toCsv(rows) {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n');
}
function sendCsv(res, filename, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(rows));
}

router.get('/export/bills.csv', requireAuth, (req, res) => {
  const { bills } = dbApi.getUserData(req.user.id);
  const rows = [['Name', 'Category', 'Amount', 'Due Day', 'Frequency', 'Autopay', 'Notes']];
  bills.forEach((b) => rows.push([
    b.name || '',
    b.category || '',
    b.amount || 0,
    b.dueDay || '',
    b.frequency || '',
    b.autopay ? 'Yes' : 'No',
    b.notes || '',
  ]));
  sendCsv(res, 'fihaven-bills.csv', rows);
});

router.get('/export/cards.csv', requireAuth, (req, res) => {
  const { cards } = dbApi.getUserData(req.user.id);
  const rows = [[
    'Name', 'Balance', 'Credit Limit', 'Min Payment', 'Regular APR',
    'Has Promo', 'Promo APR', 'Promo End Date', 'Promo Balance',
    'Due Day', 'Autopay', 'Notes',
  ]];
  cards.forEach((c) => rows.push([
    c.name || '',
    c.balance || 0,
    c.limit || 0,
    c.minPayment || 0,
    c.regularAPR || 0,
    c.hasPromo ? 'Yes' : 'No',
    c.promoAPR || '',
    c.promoEndDate || '',
    c.promoBalance || '',
    c.dueDay || '',
    c.autopay ? 'Yes' : 'No',
    c.notes || '',
  ]));
  sendCsv(res, 'fihaven-cards.csv', rows);
});

router.get('/export/history.csv', requireAuth, (req, res) => {
  const { payments } = dbApi.getUserData(req.user.id);
  const rows = [['Date', 'Month', 'Type', 'Name', 'Amount', 'Note']];
  payments
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach((p) => rows.push([
      p.date || '',
      p.monthKey || '',
      p.type || '',
      p.name || '',
      p.amount || 0,
      p.note || '',
    ]));
  sendCsv(res, 'fihaven-history.csv', rows);
});

/* ── iCal subscription token (status + rotate) ───────────────── */
// The token itself is what makes the public /api/calendar/<t>.ics
// URL unguessable. GET returns the current state; POST mints a
// fresh token (so a leaked URL can be invalidated). DELETE turns
// the subscription off entirely.

router.get('/ical-token', requireAuth, (req, res) => {
  const u = dbApi.findUserById(req.user.id);
  return res.json({ token: (u && u.ical_token) || null });
});

router.post('/ical-token', requireAuth, requireCsrf, (req, res) => {
  const token = crypto.randomBytes(24).toString('base64url');
  dbApi.updateUserIcalToken(req.user.id, token);
  return res.json({ token });
});

router.delete('/ical-token', requireAuth, requireCsrf, (req, res) => {
  dbApi.updateUserIcalToken(req.user.id, null);
  return res.json({ token: null });
});

module.exports = router;
