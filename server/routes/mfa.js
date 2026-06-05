/* ═══════════════════════════════════════════════════════════
   routes/mfa.js — authenticated MFA management.
   Mounted at /api/account/mfa. Every state-changing route
   requires session + CSRF; sensitive operations (disable,
   delete passkey) also require password re-entry.

   Endpoints:
     GET    /status
     POST   /totp/setup              { password }
     POST   /totp/confirm            { code }
     POST   /totp/disable            { password, code }
     POST   /backup-codes/regenerate { password, code }
     POST   /passkey/register-start
     POST   /passkey/register-finish { challengeId, response, name }
     GET    /passkey/list
     POST   /passkey/delete          { passkeyId, password }
═══════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');
const bcrypt = require('bcrypt');

const dbApi = require('../db');
const mfa = require('../mfa');
const mail = require('../mail');
const { requireAuth, requireCsrf } = require('../session');
const { sendError } = require('../util');

const router = express.Router();

const SETUP_TTL_MS = 10 * 60 * 1000;       // 10 min to scan QR + enter code
const REG_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 min for passkey registration

async function verifyPassword(userId, password) {
  const user = dbApi.findUserById(userId);
  if (!user) return null;
  const ok = await bcrypt.compare(String(password || ''), user.password_hash);
  return ok ? user : null;
}

function isTotpEnabled(userId) {
  const row = dbApi.getTotp(userId);
  return !!(row && row.enabled_at);
}

/* ── GET /status ─────────────────────────────────────────── */
// Summarizes what the user has enrolled. Safe to call from the
// settings page without re-prompting for the password.

router.get('/status', requireAuth, (req, res) => {
  const totp = dbApi.getTotp(req.user.id);
  const passkeys = dbApi.listPasskeys(req.user.id);
  const backupAll = dbApi.listBackupCodes(req.user.id);
  const backupUnused = backupAll.filter((b) => !b.used_at).length;
  const u = dbApi.findUserById(req.user.id);
  res.json({
    totp: {
      enabled: !!(totp && totp.enabled_at),
      enabledAt: totp && totp.enabled_at,
      lastUsedAt: totp && totp.last_used_at,
    },
    passkeys: passkeys.map((p) => ({
      id: p.id,
      name: p.name,
      transports: mfa.parseTransports(p.transports),
      createdAt: p.created_at,
      lastUsedAt: p.last_used_at,
    })),
    backupCodes: { total: backupAll.length, unused: backupUnused },
    emailMfa: { enabled: !!(u && u.email_mfa_enabled), email: u && u.email },
  });
});

/* ── POST /email/enable ───────────────────────────────────── */
// Sends a verification code to the user's email; only when the
// user submits a matching code via /email/confirm is the factor
// actually turned on.

router.post('/email/enable', requireAuth, requireCsrf, async (req, res) => {
  const body = req.body || {};
  const user = await verifyPassword(req.user.id, body.password);
  if (!user) return sendError(res, 401, 'wrong-password');

  const code = mfa.newEmailCode();
  const hash = await mfa.hashEmailCode(code);
  const id = mfa.newChallengeId();
  const now = Date.now();
  dbApi.insertChallenge({
    id,
    user_id: req.user.id,
    kind: 'email-enroll',
    payload: hash,
    created_at: now,
    expires_at: now + 10 * 60 * 1000,
  });

  try {
    await mail.sendMail({
      to: user.email,
      subject: 'Your FiHaven verification code',
      text:
        `Your FiHaven verification code is: ${code}\n\n` +
        `Enter this in Settings to turn on email-based sign-in security.\n` +
        `The code expires in 10 minutes.\n\n` +
        `If you didn't request this, you can ignore this message.`,
      html:
        `<p>Your FiHaven verification code:</p>` +
        `<p style="font-size:24px;font-family:monospace;letter-spacing:.15em;"><strong>${code}</strong></p>` +
        `<p>Enter this in Settings to turn on email-based sign-in security. The code expires in 10 minutes.</p>` +
        `<p style="color:#888;font-size:12px;">If you didn't request this, you can ignore this message.</p>`,
    });
  } catch (err) {
    dbApi.deleteChallenge(id);
    console.error('email/enable send failed:', err && err.message);
    return sendError(res, 500, 'mail-send-failed');
  }
  res.json({ ok: true, challengeId: id });
});

/* ── POST /email/confirm ──────────────────────────────────── */

router.post('/email/confirm', requireAuth, requireCsrf, async (req, res) => {
  const body = req.body || {};
  const ch = dbApi.findChallenge(body.challengeId || '');
  if (!ch || ch.kind !== 'email-enroll' || ch.user_id !== req.user.id) {
    return sendError(res, 400, 'bad-challenge');
  }
  if (ch.expires_at < Date.now()) {
    dbApi.deleteChallenge(ch.id);
    return sendError(res, 400, 'challenge-expired');
  }
  const code = String(body.code || '').trim();
  if (!/^\d{6}$/.test(code)) return sendError(res, 400, 'invalid-code');
  if (!await mfa.compareEmailCode(code, ch.payload)) {
    return sendError(res, 401, 'invalid-code');
  }
  dbApi.deleteChallenge(ch.id);
  dbApi.setEmailMfa(req.user.id, true);
  res.json({ ok: true });
});

/* ── POST /email/disable ──────────────────────────────────── */

router.post('/email/disable', requireAuth, requireCsrf, async (req, res) => {
  const body = req.body || {};
  const user = await verifyPassword(req.user.id, body.password);
  if (!user) return sendError(res, 401, 'wrong-password');
  dbApi.setEmailMfa(req.user.id, false);
  res.json({ ok: true });
});

/* ── POST /totp/setup ────────────────────────────────────── */
// Generates a new secret and stashes it server-side as a "pending"
// row (enabled_at = NULL). Returns the otpauth URL + a QR data URL
// + the base32 secret so the client can render a fallback. The
// secret is not active until /confirm verifies a code.

router.post('/totp/setup', requireAuth, requireCsrf, async (req, res) => {
  const user = await verifyPassword(req.user.id, (req.body || {}).password);
  if (!user) return sendError(res, 401, 'wrong-password');

  if (isTotpEnabled(req.user.id)) return sendError(res, 409, 'totp-already-enabled');

  const secret = mfa.newTotpSecretBase32();
  const uri = mfa.totpUri(secret, user.email);
  const qrDataUrl = await mfa.totpQrDataUrl(uri);

  // Stash the pending secret encrypted at rest; enabled_at stays
  // NULL until the user confirms by entering a valid code.
  dbApi.upsertTotp(req.user.id, mfa.encrypt(secret), null);

  res.json({ uri, qrDataUrl, secret });
});

/* ── POST /totp/confirm ──────────────────────────────────── */
// Verifies the user actually scanned the QR by checking a code,
// then flips enabled_at, generates 10 backup codes, and returns
// them in plaintext (shown ONCE on the client; only hashes stored).

router.post('/totp/confirm', requireAuth, requireCsrf, async (req, res) => {
  const totp = dbApi.getTotp(req.user.id);
  if (!totp) return sendError(res, 400, 'no-pending-setup');

  let secret;
  try { secret = mfa.decrypt(totp.secret_enc); }
  catch (_) { return sendError(res, 500, 'decrypt-failed'); }

  const user = dbApi.findUserById(req.user.id);
  if (!mfa.verifyTotpCode(secret, (req.body || {}).code, user.email)) {
    return sendError(res, 401, 'invalid-totp-code');
  }

  // Activate + (re-)generate backup codes.
  dbApi.upsertTotp(req.user.id, totp.secret_enc, Date.now());
  dbApi.deleteBackupCodes(req.user.id);
  const codes = mfa.newBackupCodeSet();
  for (const c of codes) dbApi.insertBackupCode(req.user.id, await mfa.hashBackupCode(c));

  res.json({ ok: true, backupCodes: codes });
});

/* ── POST /totp/disable ──────────────────────────────────── */
// Requires both the password AND a valid current TOTP code so a
// stolen-session attacker cannot turn off the second factor.

router.post('/totp/disable', requireAuth, requireCsrf, async (req, res) => {
  const body = req.body || {};
  const user = await verifyPassword(req.user.id, body.password);
  if (!user) return sendError(res, 401, 'wrong-password');

  const totp = dbApi.getTotp(req.user.id);
  if (!totp || !totp.enabled_at) return sendError(res, 400, 'totp-not-enabled');

  let secret;
  try { secret = mfa.decrypt(totp.secret_enc); }
  catch (_) { return sendError(res, 500, 'decrypt-failed'); }

  if (!mfa.verifyTotpCode(secret, body.code, user.email)) {
    return sendError(res, 401, 'invalid-totp-code');
  }

  dbApi.deleteTotp(req.user.id);
  dbApi.deleteBackupCodes(req.user.id);
  res.json({ ok: true });
});

/* ── POST /backup-codes/regenerate ───────────────────────── */

router.post('/backup-codes/regenerate', requireAuth, requireCsrf, async (req, res) => {
  const body = req.body || {};
  const user = await verifyPassword(req.user.id, body.password);
  if (!user) return sendError(res, 401, 'wrong-password');

  const totp = dbApi.getTotp(req.user.id);
  if (!totp || !totp.enabled_at) return sendError(res, 400, 'totp-not-enabled');

  let secret;
  try { secret = mfa.decrypt(totp.secret_enc); }
  catch (_) { return sendError(res, 500, 'decrypt-failed'); }

  if (!mfa.verifyTotpCode(secret, body.code, user.email)) {
    return sendError(res, 401, 'invalid-totp-code');
  }

  dbApi.deleteBackupCodes(req.user.id);
  const codes = mfa.newBackupCodeSet();
  for (const c of codes) dbApi.insertBackupCode(req.user.id, await mfa.hashBackupCode(c));

  res.json({ ok: true, backupCodes: codes });
});

/* ── POST /passkey/register-start ────────────────────────── */
// Returns WebAuthn registration options; the challenge is stored
// server-side so the matching finish call can replay it.

router.post('/passkey/register-start', requireAuth, requireCsrf, async (req, res) => {
  const user = dbApi.findUserById(req.user.id);
  const existing = dbApi.listPasskeysForChallenge(req.user.id);
  const options = await mfa.startPasskeyRegistration(user, existing, req);

  const challengeId = mfa.newChallengeId();
  const now = Date.now();
  dbApi.insertChallenge({
    id: challengeId,
    user_id: req.user.id,
    kind: 'passkey-reg',
    payload: options.challenge,
    created_at: now,
    expires_at: now + REG_CHALLENGE_TTL_MS,
  });

  res.json({ challengeId, options });
});

/* ── POST /passkey/register-finish ───────────────────────── */

router.post('/passkey/register-finish', requireAuth, requireCsrf, async (req, res) => {
  const body = req.body || {};
  const ch = dbApi.findChallenge(body.challengeId || '');
  if (!ch || ch.kind !== 'passkey-reg' || ch.user_id !== req.user.id) {
    return sendError(res, 400, 'bad-challenge');
  }
  if (ch.expires_at < Date.now()) {
    dbApi.deleteChallenge(ch.id);
    return sendError(res, 400, 'challenge-expired');
  }

  let verification;
  try {
    verification = await mfa.finishPasskeyRegistration(body.response, ch.payload, req);
  } catch (err) {
    dbApi.deleteChallenge(ch.id);
    console.error('passkey registration failed:', err && err.message);
    return sendError(res, 400, 'passkey-verify-failed');
  }
  dbApi.deleteChallenge(ch.id);

  if (!verification.verified || !verification.registrationInfo) {
    return sendError(res, 400, 'passkey-verify-failed');
  }

  const info = verification.registrationInfo;
  const cred = info.credential;
  const credentialId = cred.id;
  const publicKey = Buffer.from(cred.publicKey).toString('base64');
  const counter = cred.counter || 0;
  const transports = mfa.stringifyTransports(
    (body.response && body.response.response && body.response.response.transports) || cred.transports
  );

  const safeName = String((body.name || '')).trim().slice(0, 60) || 'Passkey';

  dbApi.insertPasskey({
    user_id: req.user.id,
    credential_id: credentialId,
    public_key: publicKey,
    counter,
    transports,
    name: safeName,
    created_at: Date.now(),
  });

  res.json({ ok: true, name: safeName });
});

/* ── GET /passkey/list ───────────────────────────────────── */

router.get('/passkey/list', requireAuth, (req, res) => {
  const list = dbApi.listPasskeys(req.user.id).map((p) => ({
    id: p.id,
    name: p.name,
    transports: mfa.parseTransports(p.transports),
    createdAt: p.created_at,
    lastUsedAt: p.last_used_at,
  }));
  res.json({ passkeys: list });
});

/* ── POST /passkey/delete ────────────────────────────────── */

router.post('/passkey/delete', requireAuth, requireCsrf, async (req, res) => {
  const body = req.body || {};
  const user = await verifyPassword(req.user.id, body.password);
  if (!user) return sendError(res, 401, 'wrong-password');

  const id = parseInt(body.passkeyId, 10);
  if (!id) return sendError(res, 400, 'bad-passkey-id');
  dbApi.deletePasskey(id, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
