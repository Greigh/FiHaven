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
const billing = require('../billing');
const emails = require('../emails');
const mfa = require('../mfa');
const plaid = require('../plaid');
const rateLimit = require('../rateLimit');
const reauth = require('../reauth');
const tokens = require('../tokens');
const { requireAuth, requireVerified, requireCsrf, requirePro, destroySession } = require('../session');
const {
  normalizeEmail,
  isValidEmail,
  checkPasswordPolicy,
  sendError,
  ACTIVE_BCRYPT_COST,
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

// Second-factor gate for destructive actions (account deletion, data wipe).
//
// Any enrolled factor counts, not just TOTP: checking TOTP alone meant an
// account secured exclusively with a passkey or email codes got NO second
// factor here at all, so the password by itself deleted everything. The
// accepted proof, in the order the client should offer it:
//   • TOTP code, when TOTP is enrolled;
//   • an unused backup code (same field — they're distinguishable by shape);
//   • an emailed code, when email MFA is the only factor.
// Accounts with no second factor at all are still password-only by design.
//
// `opts.emailFactorSatisfied` — the caller already consumed an emailed code to
// re-authenticate, so the email channel is proven and must not be demanded a
// second time (codes are single-use; asking twice would be unanswerable).
//
// Returns null on success, or a { status, error } to send back.
async function checkSecondFactor(user, code, opts) {
  const emailProven = !!(opts && opts.emailFactorSatisfied);
  const totp = dbApi.getTotp(user.id);
  const totpEnabled = !!(totp && totp.enabled_at);
  const hasPasskey = dbApi.countPasskeys(user.id) > 0;
  const emailEnabled = !!user.email_mfa_enabled;
  if (!totpEnabled && !hasPasskey && !emailEnabled) return null;
  // Only TOTP and backup codes are secrets the email channel doesn't already
  // cover, so once the email is proven they're the only thing left to ask for.
  if (emailProven && !totpEnabled) return null;

  const supplied = String(code || '').trim();
  if (!supplied) return { status: 401, error: 'second-factor-required' };

  // Backup codes carry a letter or hyphen; TOTP/email codes are 6 digits.
  if (/[A-Za-z]/.test(supplied) || supplied.includes('-')) {
    for (const row of dbApi.listBackupCodes(user.id)) {
      if (row.used_at) continue;
      if (await mfa.compareBackupCode(supplied, row.code_hash)) {
        dbApi.markBackupCodeUsed(row.id);
        return null;
      }
    }
    return { status: 401, error: 'invalid-second-factor' };
  }

  if (totpEnabled) {
    let secret;
    try { secret = mfa.decrypt(totp.secret_enc); }
    catch (_) { return { status: 500, error: 'decrypt-failed' }; }
    if (mfa.verifyTotpCode(secret, supplied, user.email)) return null;
    return { status: 401, error: 'invalid-second-factor' };
  }

  // No TOTP, but a factor IS enrolled → the emailed re-auth code is the
  // answer (passkey-only accounts use it too; a WebAuthn assertion round-trip
  // on a destructive REST call would need its own challenge flow).
  const fail = await reauth.verify(
    { ...user, password_hash: null },   // force the emailed-code branch
    { reauthCode: supplied }
  );
  return fail ? { status: fail.status, error: fail.error } : null;
}

/**
 * The full gate for a destructive action: prove who you are, then prove the
 * second factor.
 *
 * For a password account those are genuinely independent secrets, so both are
 * required. For a password-less (Apple / Google) account the only channel we
 * have is their email, so ONE emailed code covers both — codes are single-use,
 * and demanding two from the same mailbox would be unanswerable rather than
 * more secure. A TOTP secret or backup code, if enrolled, is still independent
 * of email and is still required.
 *
 * @returns {Promise<null|{status:number, error:string}>} null on success
 */
async function confirmDestructive(user, body) {
  const passwordless = !dbApi.userHasPassword(user);
  const proof = passwordless
    ? { reauthCode: body.reauthCode || body.code }
    : body;

  const fail = await reauth.verify(user, proof);
  if (fail) return fail;

  return checkSecondFactor(user, body.code, { emailFactorSatisfied: passwordless });
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

  const hash = await bcrypt.hash(body.newPassword, ACTIVE_BCRYPT_COST);
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

// Deliberately available to an UNVERIFIED account. Typing the address wrong at
// signup used to be a dead end: the verify screen is the only thing an
// unverified session can reach, nothing there could correct the address, and
// the confirmation mail was on its way to an inbox the user doesn't own. The
// password re-entry above is what makes this safe to allow — and since an
// OAuth account is verified the moment it is created, every unverified account
// has a password to re-enter.
router.post('/change-email', requireAuth, requireCsrf, async (req, res) => {
  const body = req.body || {};

  const user = await verifyPassword(req.user.id, body.password);
  if (!user) return sendError(res, 401, 'wrong-password');

  const newEmail = normalizeEmail(body.newEmail);
  if (!isValidEmail(newEmail)) return sendError(res, 400, 'invalid-email');
  if (newEmail === user.email) return sendError(res, 400, 'email-unchanged');

  const existing = dbApi.findUserByEmail(newEmail);
  if (existing) return sendError(res, 409, 'email-taken');

  // Each accepted change sends mail to an address the user has only claimed,
  // so an account walking addresses is a way to make FiHaven mail strangers.
  // Same per-IP+email budget the resend button spends from. Checked after the
  // rejections above so a typo or an already-taken address costs nothing —
  // only a change that actually sends mail spends from the budget.
  const limit = rateLimit.check(req.ip, newEmail);
  if (!limit.allowed) {
    return res.status(429).json({ error: 'rate-limited', retryAfter: limit.retryAfter });
  }
  rateLimit.record(req.ip, newEmail);

  try {
    dbApi.updateUserEmail(user.id, newEmail);
  } catch (err) {
    if (err && /UNIQUE/.test(String(err.message))) {
      return sendError(res, 409, 'email-taken');
    }
    console.error('change-email failed:', err);
    return sendError(res, 500, 'server-error');
  }

  try {
    const raw = tokens.issue(user.id, 'verify-email');
    await emails.sendVerifyEmail(newEmail, raw);
  } catch (err) {
    console.error('change-email verification email failed:', err && err.message);
    // Email is already updated and unverified — let the client redirect to
    // verify so the user can resend rather than leaving them in limbo.
  }

  return res.json({ ok: true, email: newEmail, verificationRequired: true });
});

// Best-effort revoke of a user's linked Plaid Items AT Plaid before we drop the
// local rows. Required on offboarding (account delete) and bank disconnect: it
// stops Plaid billing for the Item and honors data-retention (Plaid deletes the
// Item's data on /item/remove). Never blocks the user's action — a Plaid hiccup
// or unconfigured Plaid just leaves the local cleanup to proceed.
async function revokePlaidItems(userId) {
  let items;
  try { items = dbApi.listPlaidItems(userId); } catch (_) { return; }
  for (const summary of items || []) {
    try {
      const item = dbApi.findPlaidItemById(summary.id, userId);
      if (item && item.access_token_enc) {
        await plaid.removeItem(plaid.decryptToken(item.access_token_enc));
      }
    } catch (_) { /* best-effort; revoke failures must not block offboarding */ }
  }
}

/* ── POST /api/account/delete ────────────────────────────────── */

// The phrase a passwordless (OAuth-only) account types instead of a password.
// Kept in sync with the clients' confirm field.
const DELETE_CONFIRM_PHRASE = 'DELETE ACCOUNT DATA';

router.post('/delete', requireAuth, requireCsrf, async (req, res) => {
  const body = req.body || {};

  // Sign in with Apple / Google accounts have no usable password, so a password
  // prompt would lock them out of deleting entirely (App Store Guideline
  // 5.1.1(v) requires in-app deletion for every account we let people create).
  // They confirm by typing the phrase instead; the session + CSRF header still
  // authenticate the request, and the second factor below is enforced either
  // way — for a password-less account that factor (an emailed code, when
  // email/passkey is what's enrolled) is the real gate, since the phrase is
  // something anyone holding the session could type. Deliberately NOT routed
  // through confirmDestructive: deletion must stay reachable even if the user
  // can no longer receive mail (App Store 5.1.1(v)).
  const row = dbApi.findUserById(req.user.id);
  if (!row) return sendError(res, 401, 'wrong-password');

  let user;
  if (dbApi.userHasPassword(row)) {
    user = await verifyPassword(req.user.id, body.password);
    if (!user) return sendError(res, 401, 'wrong-password');
  } else {
    const typed = String(body.confirm || '').trim().toUpperCase();
    if (typed !== DELETE_CONFIRM_PHRASE) return sendError(res, 400, 'confirm-required');
    user = row;
  }

  // Re-confirm the second factor (TOTP) when one is enrolled.
  const sf = await checkSecondFactor(user, body.code);
  if (sf) return sendError(res, sf.status, sf.error);

  // Revoke any linked banks at Plaid first (the local plaid_items cascade-delete
  // with the user row, but the Item must be removed AT Plaid to stop billing and
  // delete its data).
  await revokePlaidItems(user.id);

  // Cancel any web subscription at Paddle. The local row cascade-deletes, but
  // Paddle is the merchant of record — left alone it keeps charging a customer
  // whose account is gone, and with the account deleted there is no portal left
  // to cancel from. Apple/Google subscriptions can't be cancelled server-side;
  // the UI tells those users to cancel in the store first.
  try {
    const cancelResult = await billing.cancelPaddleSubscriptionsForUser(user.id);
    if (cancelResult.failed.length) {
      console.error('[account] deleted user', user.id,
        'with un-cancelled Paddle subscriptions:', cancelResult.failed.join(', '));
    }
  } catch (err) {
    console.error('[account] Paddle cancel threw during delete:', err && err.message);
  }

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

  // Re-auth rather than a bare password check: Apple/Google accounts have no
  // password, so a password-only gate made this endpoint unreachable for them.
  const user = dbApi.findUserById(req.user.id);
  if (!user) return sendError(res, 401, 'unauthenticated');
  const gate = await confirmDestructive(user, body);
  if (gate) return sendError(res, gate.status, gate.error);

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
    // Disconnecting bank data also drops the live Plaid connections — revoke
    // them at Plaid and delete the local items, or they'd just re-sync.
    await revokePlaidItems(user.id);
    try {
      (dbApi.listPlaidItems(user.id) || []).forEach((it) => dbApi.deletePlaidItem(it.id, user.id));
    } catch (_) { /* best-effort */ }
  }
  // settings are intentionally left untouched.
  dbApi.upsertUserData(user.id, data);

  return res.json({ ok: true, cleared: groups });
});

/* ── GET /api/account/export ─────────────────────────────────── */

router.get('/export', requireAuth, requireVerified, (req, res) => {
  const data = dbApi.getUserData(req.user.id);
  const payload = {
    account: { email: req.user.email },
    exportedAt: new Date().toISOString(),
    bills: data.bills,
    cards: data.cards,
    payments: data.payments,
    // The other three lists the account holds. They were missing, so the file
    // offered as "All data" / "a full JSON backup" quietly excluded net-worth
    // accounts, savings goals, and imported bank transactions — and restoring
    // from it could not bring back what it never carried.
    accounts: data.accounts,
    goals: data.goals,
    transactions: data.transactions,
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

// Characters that make Excel / Sheets / LibreOffice treat a cell as a formula
// rather than text. A bill named `=HYPERLINK("http://evil","click")` — or the
// classic `=cmd|'/c calc'!A1` — executes when the export is opened, so the
// value is prefixed with a tab to force text interpretation. Tab is used
// rather than a quote because it survives a round-trip through the importer.
const CSV_FORMULA_LEAD = /^[=+\-@\t\r]/;

function csvEscape(cell) {
  let s = String(cell == null ? '' : cell);
  if (CSV_FORMULA_LEAD.test(s)) s = '\t' + s;
  s = s.replace(/"/g, '""');
  return /[",\n\t\r]/.test(s) ? `"${s}"` : s;
}
function toCsv(rows) {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n');
}
function sendCsv(res, filename, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(rows));
}

router.get('/export/bills.csv', requireAuth, requireVerified, (req, res) => {
  const { bills } = dbApi.getUserData(req.user.id);
  const rows = [['Name', 'Category', 'Amount', 'Due Day', 'Frequency', 'Autopay', 'Autopay Day', 'Notes']];
  bills.forEach((b) => rows.push([
    b.name || '',
    b.category || '',
    b.amount || 0,
    b.dueDay || '',
    b.frequency || '',
    b.autopay ? 'Yes' : 'No',
    b.autopayDay || '',
    b.notes || '',
  ]));
  sendCsv(res, 'fihaven-bills.csv', rows);
});

router.get('/export/cards.csv', requireAuth, requireVerified, (req, res) => {
  const { cards } = dbApi.getUserData(req.user.id);
  const rows = [[
    'Name', 'Balance', 'Credit Limit', 'Min Payment', 'Regular APR',
    'Has Promo', 'Promo APR', 'Promo End Date', 'Promo Balance',
    'Due Day', 'Autopay', 'Autopay Day', 'Notes',
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
    c.autopayDay || '',
    c.notes || '',
  ]));
  sendCsv(res, 'fihaven-cards.csv', rows);
});

router.get('/export/history.csv', requireAuth, requireVerified, (req, res) => {
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

router.post('/ical-token', requireAuth, requireCsrf, requirePro, (req, res) => {
  const token = crypto.randomBytes(24).toString('base64url');
  dbApi.updateUserIcalToken(req.user.id, token);
  return res.json({ token });
});

router.delete('/ical-token', requireAuth, requireCsrf, (req, res) => {
  dbApi.updateUserIcalToken(req.user.id, null);
  return res.json({ token: null });
});

module.exports = router;
