/* ═══════════════════════════════════════════════════════════
   routes/mfa.js — authenticated MFA management.
   Mounted at /api/account/mfa. Every state-changing route requires
   session + CSRF; every route that ADDS or REMOVES an authentication
   factor also requires re-auth (see ../reauth.js) — password, or an
   emailed code for Apple/Google accounts that have no password.

   Re-auth on ENROLMENT matters as much as on removal: a passkey planted
   through a hijacked session outlives the password change meant to end
   that session.

   Endpoints ({reauth} = { password } or { reauthCode }):
     GET    /status
     POST   /reauth/send             — email a code (password-less accounts)
     POST   /email/enable            {reauth}
     POST   /email/confirm           { code }
     POST   /email/disable           {reauth}
     POST   /totp/setup              {reauth}
     POST   /totp/confirm            { code }
     POST   /totp/disable            {reauth, code }
     POST   /backup-codes/regenerate {reauth, code }
     POST   /passkey/register-start  {reauth} (waived on a <5min-old session)
     POST   /passkey/register-finish { challengeId, response, name }
     GET    /passkey/list
     POST   /passkey/delete          { passkeyId, ...reauth }
═══════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');

const dbApi = require('../db');
const mfa = require('../mfa');
const mail = require('../mail');
const reauth = require('../reauth');
const { requireAuth, requireCsrf } = require('../session');
const { sendError } = require('../util');

const router = express.Router();

const SETUP_TTL_MS = 10 * 60 * 1000;       // 10 min to scan QR + enter code
const REG_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 min for passkey registration

// Re-auth for a sensitive MFA change. Accepts the password, or an emailed
// code for accounts that have none (Sign in with Apple / Google) — those used
// to fail every one of these endpoints forever. Returns the user row on
// success, or sends the error response and returns null.
async function requireReauth(req, res) {
  const user = dbApi.findUserById(req.user.id);
  if (!user) {
    sendError(res, 401, 'unauthenticated');
    return null;
  }
  const fail = await reauth.verify(user, req.body);
  if (fail) {
    sendError(res, fail.status, fail.error);
    return null;
  }
  return user;
}

// How recently the session must have been established to count as proof of
// presence on its own. Signing in IS an authentication, so re-prompting
// seconds later adds friction without adding assurance.
const FRESH_SESSION_MS = 5 * 60 * 1000;

function sessionIsFresh(req) {
  const createdAt = req.session && req.session.created_at;
  return !!createdAt && Date.now() - createdAt < FRESH_SESSION_MS;
}

// Re-auth for passkey ENROLMENT, which is the flow users hit immediately after
// signing in (onboarding, "add this device"). A just-created session is its own
// proof, so it passes; anything older must re-authenticate. That closes the
// real attack — a stolen long-lived bearer token, which is by definition not
// fresh, planting a credential that survives the victim's password reset —
// without breaking already-shipped clients that post no body here.
async function requireReauthUnlessFresh(req, res) {
  if (sessionIsFresh(req)) {
    const user = dbApi.findUserById(req.user.id);
    if (user) return user;
  }
  return requireReauth(req, res);
}

function isTotpEnabled(userId) {
  const row = dbApi.getTotp(userId);
  return !!(row && row.enabled_at);
}

/* ── POST /reauth/send ───────────────────────────────────── */
// Emails a confirmation code for accounts with no password. Password
// accounts are told to use their password instead, so the client never has to
// guess which prompt to render — GET /status reports `hasPassword`.

router.post('/reauth/send', requireAuth, requireCsrf, async (req, res) => {
  const user = dbApi.findUserById(req.user.id);
  if (!user) return sendError(res, 401, 'unauthenticated');
  if (reauth.hasPassword(user)) return sendError(res, 400, 'password-required');
  try {
    await reauth.sendCode(user);
  } catch (err) {
    console.error('reauth code send failed:', err && err.message);
    return sendError(res, 500, 'mail-send-failed');
  }
  res.json({ ok: true });
});

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
    // Tells the client which re-auth prompt to show on sensitive actions:
    // a password field, or "send me a code" for Apple/Google accounts.
    hasPassword: dbApi.userHasPassword(u),
  });
});

/* ── POST /email/enable ───────────────────────────────────── */
// Sends a verification code to the user's email; only when the
// user submits a matching code via /email/confirm is the factor
// actually turned on.

router.post('/email/enable', requireAuth, requireCsrf, async (req, res) => {
  const user = await requireReauth(req, res);
  if (!user) return undefined;

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
  const user = await requireReauth(req, res);
  if (!user) return undefined;
  dbApi.setEmailMfa(req.user.id, false);
  res.json({ ok: true });
});

/* ── POST /totp/setup ────────────────────────────────────── */
// Generates a new secret and stashes it server-side as a "pending"
// row (enabled_at = NULL). Returns the otpauth URL + a QR data URL
// + the base32 secret so the client can render a fallback. The
// secret is not active until /confirm verifies a code.

router.post('/totp/setup', requireAuth, requireCsrf, async (req, res) => {
  const user = await requireReauth(req, res);
  if (!user) return undefined;

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
  const user = await requireReauth(req, res);
  if (!user) return undefined;

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
  const user = await requireReauth(req, res);
  if (!user) return undefined;

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
//
// Re-auth required unless the session was just established. Enrolling a
// passkey is a credential-ADDING operation, so session + CSRF alone let a
// hijacked session plant a permanent credential — one that survives the
// password change meant to evict the attacker, since changing a password
// revokes sessions but not passkeys.

router.post('/passkey/register-start', requireAuth, requireCsrf, async (req, res) => {
  const user = await requireReauthUnlessFresh(req, res);
  if (!user) return undefined;
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
  const user = await requireReauth(req, res);
  if (!user) return undefined;

  const id = parseInt(body.passkeyId, 10);
  if (!id) return sendError(res, 400, 'bad-passkey-id');
  dbApi.deletePasskey(id, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
