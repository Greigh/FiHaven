/* ═══════════════════════════════════════════════════════════
   routes/auth.js — account + session endpoints.
   Mounted at /api/auth.  Endpoints: signup, login, logout, me.
═════════════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');
const bcrypt = require('bcrypt');

const dbApi = require('../db');
const oauth = require('../oauth');
const oauthHandoff = require('../oauthHandoff');
const { verifyCaptcha } = require('../captcha');
const rateLimit = require('../rateLimit');
const { createSession, destroySession, requireAuth } = require('../session');
const mfa = require('../mfa');
const mail = require('../mail');
const tokens = require('../tokens');
const emails = require('../emails');
const {
  normalizeEmail,
  isValidEmail,
  checkPasswordPolicy,
  sendError,
  BCRYPT_COST,
} = require('../util');

const router = express.Router();

const MIN_SUBMIT_MS = 2500;
// How long an MFA continuation token is valid for between
// password verification and second-factor confirmation.
const MFA_TOKEN_TTL_MS = 5 * 60 * 1000;
// A pre-computed hash used to run a dummy bcrypt.compare when an
// account does not exist, keeping login timing constant.
const DUMMY_HASH = bcrypt.hashSync('fihaven-dummy-password', BCRYPT_COST);

// Native clients send `X-Auth-Mode: token` to request a cookieless,
// long-lived session whose id comes back as a Bearer token. Web
// clients omit it and keep the existing HttpOnly-cookie behaviour.
function authMode(req) {
  return req.get('x-auth-mode') === 'token' ? 'token' : 'cookie';
}

// The standard auth-success body. `token` is included only for
// token-mode logins, so a web response never exposes the session id
// (which stays HttpOnly in the cookie).
function sessionResponse(session, user, mode) {
  const body = {
    user: {
      email: user.email,
      name: user.name || null,
      emailVerified: !!user.email_verified,
      onboarded: !!user.onboarded,
    },
    csrfToken: session.csrf_token,
  };
  if (mode === 'token') body.token = session.id;
  return body;
}

// Shared anti-bot gate for signup/login: honeypot + submit timing.
function botGate(body) {
  if (body.website && String(body.website).trim() !== '') return 'spam';
  const startedAt = parseInt(body.loginStartedAt, 10) || 0;
  if (!startedAt || Date.now() - startedAt < MIN_SUBMIT_MS) return 'too-fast';
  return null;
}

/* ── POST /api/auth/signup ───────────────────────────────────── */

router.post('/signup', async (req, res) => {
  const body = req.body || {};

  const botError = botGate(body);
  if (botError) return sendError(res, 400, botError);

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) return sendError(res, 400, 'invalid-email');

  const pwError = checkPasswordPolicy(body.password, email);
  if (pwError) return sendError(res, 400, pwError);

  const captcha = await verifyCaptcha(body.captchaToken, req.ip);
  if (!captcha.ok) return sendError(res, 400, 'captcha-failed');

  if (dbApi.findUserByEmail(email)) return sendError(res, 409, 'email-taken');

  let user;
  try {
    const hash = await bcrypt.hash(body.password, BCRYPT_COST);
    user = dbApi.createUser(email, hash);
  } catch (err) {
    // Covers the race where the unique constraint fires after the check.
    if (err && /UNIQUE/.test(String(err.message))) {
      return sendError(res, 409, 'email-taken');
    }
    console.error('signup failed:', err);
    return sendError(res, 500, 'server-error');
  }

  // Kick off email verification. The account is unverified until the
  // link is clicked, and the app gates data access until then.
  try {
    const raw = tokens.issue(user.id, 'verify-email');
    await emails.sendVerifyEmail(user.email, raw);
  } catch (err) {
    console.error('verification email failed:', err && err.message);
    // Non-fatal: the user can resend from the verify screen.
  }

  dbApi.touchLastLogin(user.id);
  const mode = authMode(req);
  const session = createSession(res, user, req, { mode });
  return res.status(201).json(sessionResponse(session, user, mode));
});

/* ── POST /api/auth/forgot ───────────────────────────────────── */
// Request a password-reset link. Always responds 200 with the same body
// whether or not the account exists, so it can't be used to enumerate
// registered emails. Mail failures are logged, never surfaced.

router.post('/forgot', async (req, res) => {
  const body = req.body || {};

  const botError = botGate(body);
  if (botError) return sendError(res, 400, botError);

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) return sendError(res, 400, 'invalid-email');

  const limit = rateLimit.check(req.ip, email);
  if (!limit.allowed) {
    return res.status(429).json({ error: 'rate-limited', retryAfter: limit.retryAfter });
  }

  const captcha = await verifyCaptcha(body.captchaToken, req.ip);
  if (!captcha.ok) return sendError(res, 400, 'captcha-failed');

  // Count the request so the endpoint can't be used to spam reset emails.
  rateLimit.record(req.ip, email);

  const account = dbApi.findUserByEmail(email);
  if (account) {
    try {
      const raw = tokens.issue(account.id, 'password-reset');
      await emails.sendPasswordReset(account.email, raw);
    } catch (err) {
      console.error('password-reset email failed:', err);
      // Swallow — responding the same way avoids account enumeration.
    }
  }

  return res.json({ ok: true });
});

/* ── POST /api/auth/reset ────────────────────────────────────── */
// Complete a password reset with the emailed token. Single-use token,
// password policy enforced, and every existing session is killed so a
// thief who still holds an old session is locked out.

router.post('/reset', async (req, res) => {
  const body = req.body || {};

  const found = tokens.check(body.token, 'password-reset');
  if (!found) return sendError(res, 400, 'invalid-token');

  const user = dbApi.findUserById(found.userId);
  if (!user) return sendError(res, 400, 'invalid-token');

  const pwError = checkPasswordPolicy(body.password, user.email);
  if (pwError) return sendError(res, 400, pwError);

  const hash = await bcrypt.hash(body.password, BCRYPT_COST);
  dbApi.updateUserPassword(user.id, hash);
  tokens.consume(found.id);
  dbApi.deleteUserSessions(user.id);

  return res.json({ ok: true });
});

/* ── POST /api/auth/recover-2fa/request ──────────────────────── */
// Request a 2FA-recovery link for a locked-out account. Always 200 (no
// enumeration); only actually sends when the account has a second factor.

router.post('/recover-2fa/request', async (req, res) => {
  const body = req.body || {};

  const botError = botGate(body);
  if (botError) return sendError(res, 400, botError);

  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) return sendError(res, 400, 'invalid-email');

  const limit = rateLimit.check(req.ip, email);
  if (!limit.allowed) {
    return res.status(429).json({ error: 'rate-limited', retryAfter: limit.retryAfter });
  }

  const captcha = await verifyCaptcha(body.captchaToken, req.ip);
  if (!captcha.ok) return sendError(res, 400, 'captcha-failed');

  rateLimit.record(req.ip, email);

  const account = dbApi.findUserByEmail(email);
  if (account && dbApi.userHasMfa(account.id)) {
    try {
      const raw = tokens.issue(account.id, 'recover-2fa');
      await emails.sendRecovery(account.email, raw);
    } catch (err) {
      console.error('2fa-recovery email failed:', err && err.message);
    }
  }

  return res.json({ ok: true });
});

/* ── POST /api/auth/recover-2fa/confirm ──────────────────────── */
// Confirm recovery with the emailed token. DESTRUCTIVE: disables every
// second factor and erases bills/cards/payments (settings kept), then
// revokes all sessions. The token is the proof; no other auth.

router.post('/recover-2fa/confirm', (req, res) => {
  const found = tokens.check((req.body || {}).token, 'recover-2fa');
  if (!found) return sendError(res, 400, 'invalid-token');
  dbApi.recover2faWipe(found.userId);
  tokens.consume(found.id);
  return res.json({ ok: true });
});

/* ── POST /api/auth/verify-email ─────────────────────────────── */
// Confirm an email with the emailed token. Unauthenticated — the token
// itself is proof, so the link works from any device or inbox.

router.post('/verify-email', (req, res) => {
  const found = tokens.check((req.body || {}).token, 'verify-email');
  if (!found) return sendError(res, 400, 'invalid-token');
  dbApi.setEmailVerified(found.userId, Date.now());
  tokens.consume(found.id);
  return res.json({ ok: true });
});

/* ── POST /api/auth/resend-verification ──────────────────────── */
// Re-send the verification email. Requires a session (signup/login mint
// one even while unverified) and is rate-limited per IP+email.

router.post('/resend-verification', requireAuth, async (req, res) => {
  const user = dbApi.findUserById(req.user.id);
  if (!user) return sendError(res, 401, 'unauthenticated');
  if (user.email_verified) return res.json({ ok: true, alreadyVerified: true });

  const limit = rateLimit.check(req.ip, user.email);
  if (!limit.allowed) {
    return res.status(429).json({ error: 'rate-limited', retryAfter: limit.retryAfter });
  }
  rateLimit.record(req.ip, user.email);

  try {
    const raw = tokens.issue(user.id, 'verify-email');
    await emails.sendVerifyEmail(user.email, raw);
  } catch (err) {
    console.error('verification email failed:', err && err.message);
    return sendError(res, 500, 'mail-send-failed');
  }
  return res.json({ ok: true });
});

/* ── POST /api/auth/login ────────────────────────────────────── */

router.post('/login', async (req, res) => {
  const body = req.body || {};

  const botError = botGate(body);
  if (botError) return sendError(res, 400, botError);

  const email = normalizeEmail(body.email);

  const limit = rateLimit.check(req.ip, email);
  if (!limit.allowed) {
    return res
      .status(429)
      .json({ error: 'rate-limited', retryAfter: limit.retryAfter });
  }

  const captcha = await verifyCaptcha(body.captchaToken, req.ip);
  if (!captcha.ok) return sendError(res, 400, 'captcha-failed');

  const account = dbApi.findUserByEmail(email);
  // Always run a bcrypt compare (dummy hash when the user is missing)
  // so response timing does not reveal whether the email exists.
  const ok = await bcrypt.compare(
    String(body.password || ''),
    account ? account.password_hash : DUMMY_HASH
  );

  if (!account || !ok) {
    rateLimit.record(req.ip, email);
    return sendError(res, 401, 'invalid-credentials');
  }

  if (account.suspended) {
    return sendError(res, 403, 'account-suspended');
  }

  rateLimit.reset(req.ip, email);

  // If the account has any second factor enrolled, do NOT mint a
  // session yet. Issue a short-lived mfaToken instead; the client
  // must call /mfa/verify with a TOTP / backup / passkey response
  // to finish the login.
  const totp = dbApi.getTotp(account.id);
  const totpEnabled = !!(totp && totp.enabled_at);
  const passkeyCount = dbApi.countPasskeys(account.id);
  const emailEnabled = !!(account.email_mfa_enabled);
  if (totpEnabled || passkeyCount > 0 || emailEnabled) {
    const tokenId = mfa.newChallengeId();
    const now = Date.now();
    dbApi.insertChallenge({
      id: tokenId,
      user_id: account.id,
      kind: 'mfa-login',
      payload: null,
      created_at: now,
      expires_at: now + MFA_TOKEN_TTL_MS,
    });
    const methods = [];
    if (passkeyCount > 0) methods.push('passkey');
    if (totpEnabled)       methods.push('totp');
    if (emailEnabled)      methods.push('email');
    return res.status(200).json({
      mfaRequired: true,
      mfaToken: tokenId,
      methods,
    });
  }

  dbApi.touchLastLogin(account.id);
  const mode = authMode(req);
  const session = createSession(res, account, req, { mode });
  return res.status(200).json(sessionResponse(session, account, mode));
});

/* ── helpers for the MFA-finish flow ─────────────────────────── */

function consumeMfaToken(tokenId, expectedUserId) {
  const ch = dbApi.findChallenge(tokenId || '');
  // Both the initial 'mfa-login' row and the email-stamped
  // 'mfa-login-email' row should be treated as valid in-flight
  // tokens; the verify endpoint will inspect kind/payload to
  // decide which factor to check.
  if (!ch) return null;
  if (ch.kind !== 'mfa-login' && ch.kind !== 'mfa-login-email') return null;
  if (expectedUserId && ch.user_id !== expectedUserId) return null;
  if (ch.expires_at < Date.now()) {
    dbApi.deleteChallenge(ch.id);
    return null;
  }
  return ch;
}

function finishLogin(res, req, account) {
  if (account.suspended) return sendError(res, 403, 'account-suspended');
  dbApi.touchLastLogin(account.id);
  const mode = authMode(req);
  const session = createSession(res, account, req, { mode });
  return res.status(200).json(sessionResponse(session, account, mode));
}

/* ── POST /api/auth/mfa/email/send ───────────────────────────── */
// Generates a 6-digit code and emails it. The code's bcrypt hash
// goes into the mfa-login row's payload field; /mfa/verify checks
// against it first when the user enters a 6-digit code.

router.post('/mfa/email/send', async (req, res) => {
  const body = req.body || {};
  const ch = consumeMfaToken(body.mfaToken);
  if (!ch) return sendError(res, 401, 'mfa-token-invalid');

  const account = dbApi.findUserById(ch.user_id);
  if (!account || !account.email_mfa_enabled) {
    return sendError(res, 400, 'email-mfa-not-enabled');
  }

  const code = mfa.newEmailCode();
  const hash = await mfa.hashEmailCode(code);

  // Replace the existing mfa-login row, keeping the same id so the
  // client's mfaToken still works. payload now carries the bcrypt
  // hash of the emailed code.
  const now = Date.now();
  dbApi.deleteChallenge(ch.id);
  dbApi.insertChallenge({
    id: ch.id,
    user_id: ch.user_id,
    kind: 'mfa-login-email',
    payload: hash,
    created_at: now,
    expires_at: now + MFA_TOKEN_TTL_MS,
  });

  try {
    await mail.sendMail({
      to: account.email,
      subject: 'Your FiHaven sign-in code',
      text:
        `Your FiHaven sign-in code is: ${code}\n\n` +
        `Enter this code on the sign-in page to finish logging in.\n` +
        `The code expires in 5 minutes.\n\n` +
        `If you didn't try to sign in, change your password right away.`,
      html:
        `<p>Your FiHaven sign-in code:</p>` +
        `<p style="font-size:24px;font-family:monospace;letter-spacing:.15em;"><strong>${code}</strong></p>` +
        `<p>Enter this code on the sign-in page to finish logging in. The code expires in 5 minutes.</p>` +
        `<p style="color:#888;font-size:12px;">If you didn't try to sign in, change your password right away.</p>`,
    });
  } catch (err) {
    console.error('mfa/email/send failed:', err && err.message);
    return sendError(res, 500, 'mail-send-failed');
  }
  res.json({ ok: true });
});

/* ── POST /api/auth/mfa/verify  (TOTP / backup / email code) ──── */

router.post('/mfa/verify', async (req, res) => {
  const body = req.body || {};
  const ch = consumeMfaToken(body.mfaToken);
  if (!ch) return sendError(res, 401, 'mfa-token-invalid');

  const account = dbApi.findUserById(ch.user_id);
  if (!account) {
    dbApi.deleteChallenge(ch.id);
    return sendError(res, 401, 'mfa-token-invalid');
  }

  const code = String(body.code || '').trim();
  if (!code) return sendError(res, 400, 'invalid-totp-code');

  // Hyphen / letter → backup code path.
  const looksLikeBackup = /[A-Za-z]/.test(code) || code.includes('-');

  if (looksLikeBackup) {
    const rows = dbApi.listBackupCodes(account.id);
    for (const row of rows) {
      if (row.used_at) continue;
      if (await mfa.compareBackupCode(code, row.code_hash)) {
        dbApi.markBackupCodeUsed(row.id);
        dbApi.deleteChallenge(ch.id);
        return finishLogin(res, req, account);
      }
    }
    return sendError(res, 401, 'invalid-totp-code');
  }

  // Email-code path takes priority when an email code is outstanding.
  if (ch.kind === 'mfa-login-email' && ch.payload) {
    if (await mfa.compareEmailCode(code, ch.payload)) {
      dbApi.deleteChallenge(ch.id);
      return finishLogin(res, req, account);
    }
    return sendError(res, 401, 'invalid-totp-code');
  }

  const totp = dbApi.getTotp(account.id);
  if (!totp || !totp.enabled_at) return sendError(res, 400, 'totp-not-enabled');
  let secret;
  try { secret = mfa.decrypt(totp.secret_enc); }
  catch (_) { return sendError(res, 500, 'decrypt-failed'); }
  if (!mfa.verifyTotpCode(secret, code, account.email)) {
    return sendError(res, 401, 'invalid-totp-code');
  }
  dbApi.touchTotpUsed(account.id);
  dbApi.deleteChallenge(ch.id);
  return finishLogin(res, req, account);
});

/* ── POST /api/auth/passkey/login/start ──────────────────────────
   First-factor, passwordless passkey login. No user is known yet, so the
   options carry no allowCredentials (the device offers its discoverable
   passkeys, like Bitwarden/iCloud Keychain/Google Password Manager). The
   challenge is stashed under a fresh, user-less challenge row. */

router.post('/passkey/login/start', async (req, res) => {
  const options = await mfa.startPasskeyLogin(req);
  const id = mfa.newChallengeId();
  const now = Date.now();
  dbApi.insertChallenge({
    id,
    user_id: null, // unknown until the assertion identifies the credential
    kind: 'passkey-login',
    payload: options.challenge,
    created_at: now,
    expires_at: now + MFA_TOKEN_TTL_MS,
  });
  res.json({ challengeId: id, options });
});

/* ── POST /api/auth/passkey/login/finish ─────────────────────────
   Verify the assertion, identify the user from the credential id it was
   signed with, and start a session — no password required. */

router.post('/passkey/login/finish', async (req, res) => {
  const body = req.body || {};
  const ch = dbApi.findChallenge(body.challengeId);
  if (!ch || ch.kind !== 'passkey-login' || ch.expires_at < Date.now()) {
    if (ch) dbApi.deleteChallenge(ch.id);
    return sendError(res, 401, 'challenge-invalid');
  }
  const credId = body.response && body.response.id;
  if (!credId) { dbApi.deleteChallenge(ch.id); return sendError(res, 400, 'bad-response'); }
  const credential = dbApi.findPasskeyByCredId(credId);
  if (!credential) { dbApi.deleteChallenge(ch.id); return sendError(res, 401, 'passkey-unknown'); }

  let verification;
  try {
    verification = await mfa.finishPasskeyLogin(
      { response: body.response, expectedChallenge: ch.payload, credential },
      req
    );
  } catch (err) {
    dbApi.deleteChallenge(ch.id);
    console.error('passkey login failed:', err && err.message);
    return sendError(res, 401, 'passkey-verify-failed');
  }
  if (!verification.verified) {
    dbApi.deleteChallenge(ch.id);
    return sendError(res, 401, 'passkey-verify-failed');
  }
  const newCounter = (verification.authenticationInfo && verification.authenticationInfo.newCounter) || credential.counter || 0;
  dbApi.bumpPasskeyUsage(credential.id, newCounter);
  dbApi.deleteChallenge(ch.id);

  const account = dbApi.findUserById(credential.user_id);
  if (!account) return sendError(res, 401, 'passkey-unknown');
  return finishLogin(res, req, account);
});

/* ── POST /api/auth/mfa/passkey/start ────────────────────────── */

router.post('/mfa/passkey/start', async (req, res) => {
  const body = req.body || {};
  const ch = consumeMfaToken(body.mfaToken);
  if (!ch) return sendError(res, 401, 'mfa-token-invalid');

  const allowed = dbApi.listPasskeysForChallenge(ch.user_id);
  if (!allowed.length) return sendError(res, 400, 'no-passkeys');

  const options = await mfa.startPasskeyAuthentication(allowed, req);
  // Stash the WebAuthn challenge on top of the same mfa-login token
  // so passkey/finish can validate it. We keep the row (overwriting
  // payload) instead of issuing a separate challenge id.
  const now = Date.now();
  dbApi.deleteChallenge(ch.id);
  dbApi.insertChallenge({
    id: ch.id,
    user_id: ch.user_id,
    kind: 'mfa-login',
    payload: options.challenge,
    created_at: now,
    expires_at: now + MFA_TOKEN_TTL_MS,
  });
  res.json({ options });
});

/* ── POST /api/auth/mfa/passkey/finish ───────────────────────── */

router.post('/mfa/passkey/finish', async (req, res) => {
  const body = req.body || {};
  const ch = consumeMfaToken(body.mfaToken);
  if (!ch) return sendError(res, 401, 'mfa-token-invalid');
  if (!ch.payload) return sendError(res, 400, 'bad-challenge');

  const credId = body.response && body.response.id;
  if (!credId) return sendError(res, 400, 'bad-response');
  const credential = dbApi.findPasskeyByCredId(credId);
  if (!credential || credential.user_id !== ch.user_id) {
    return sendError(res, 401, 'passkey-unknown');
  }

  let verification;
  try {
    verification = await mfa.finishPasskeyAuthentication(
      { response: body.response, expectedChallenge: ch.payload, credential },
      req
    );
  } catch (err) {
    dbApi.deleteChallenge(ch.id);
    console.error('passkey login failed:', err && err.message);
    return sendError(res, 401, 'passkey-verify-failed');
  }
  if (!verification.verified) {
    dbApi.deleteChallenge(ch.id);
    return sendError(res, 401, 'passkey-verify-failed');
  }
  const newCounter = (verification.authenticationInfo && verification.authenticationInfo.newCounter) || credential.counter || 0;
  dbApi.bumpPasskeyUsage(credential.id, newCounter);
  dbApi.deleteChallenge(ch.id);

  const account = dbApi.findUserById(ch.user_id);
  return finishLogin(res, req, account);
});

/* ── POST /api/auth/logout ───────────────────────────────────── */

router.post('/logout', (req, res) => {
  if (!req.session) return res.status(204).end();
  // Cookie clients must echo the CSRF token; Bearer clients are exempt
  // (the header is never auto-attached by a browser).
  if (req.authVia !== 'bearer') {
    const supplied = req.get('x-csrf-token');
    if (!supplied || supplied !== req.session.csrf_token) {
      return sendError(res, 403, 'bad-csrf-token');
    }
  }
  destroySession(req, res);
  return res.status(204).end();
});

/* ── GET /api/auth/me ────────────────────────────────────────── */

// A session-check endpoint: returns 200 in both cases (signed in or
// not) so an anonymous visitor does not generate a console error.
router.get('/me', (req, res) => {
  if (!req.user) return res.status(200).json({ user: null });
  // created_at isn't carried on the session row; fetch it for "Member since".
  const row = dbApi.findUserById(req.user.id);
  return res.status(200).json({
    user: {
      email: req.user.email,
      name: req.user.name || null,
      role: req.user.role || 'user',
      emailVerified: !!req.user.emailVerified,
      onboarded: !!req.user.onboarded,
      createdAt: row ? row.created_at : null,
      suspended: !!(row && row.suspended),
      suspendedReason: (row && row.suspended_reason) || null,
    },
    csrfToken: req.session.csrf_token,
  });
});

/* ── Federated sign-in (Sign in with Apple / Google) ─────────── */
// GET /api/auth/oauth/config — which providers are enabled + their public
// client ids, so the login page can render the right buttons.
router.get('/oauth/config', (req, res) => {
  res.json(oauth.config());
});

// Sign in with Apple on Android is a web flow: the app opens Apple's
// authorize page in a Custom Tab with this URL as the redirect. Apple
// form-posts the result here; we store the id_token under a one-time
// handoff code and 302 to an https App Link (`/oauth/apple?code=…`).
// The app consumes the code via POST /oauth/apple. Native iOS uses
// ASAuthorization and never hits this callback.
const appleFormBody = express.urlencoded({ extended: false });
function appleAndroidCallback(req, res) {
  const b = req.body || {};
  let name = '';
  try {
    if (b.user) {
      const u = JSON.parse(b.user);
      name = [u.name && u.name.firstName, u.name && u.name.lastName].filter(Boolean).join(' ');
    }
  } catch (_) { /* name is best-effort */ }
  const idToken = String(b.id_token || '');
  const state = String(b.state || '');
  if (!idToken) {
    return res.status(400).type('html').send(
      '<!doctype html><title>Sign-in failed</title><p>Apple did not return a token. Close this tab and try again in FiHaven.</p>'
    );
  }
  let code;
  try {
    code = oauthHandoff.create({ provider: 'apple', idToken, name, state });
  } catch (err) {
    console.error('oauth apple handoff create failed:', err && err.message);
    return res.status(500).type('html').send(
      '<!doctype html><title>Sign-in failed</title><p>Could not finish Apple sign-in. Close this tab and try again in FiHaven.</p>'
    );
  }
  return res.redirect(302, oauthHandoff.appReturnUrl('apple', { code, state }));
}
router.post('/oauth/apple/callback', appleFormBody, appleAndroidCallback);
// GET fallback (e.g. user-error redirects from Apple).
router.get('/oauth/apple/callback', appleAndroidCallback);

// Google Custom Tab: GIS posts the id_token here (form), we store a handoff
// and 302 to fihaven:// — same pattern as Apple. Async JS location.replace
// after fetch often leaves Chrome Custom Tabs stuck on the page.
function googleAndroidCallback(req, res) {
  const b = req.body || {};
  const idToken = String(b.id_token || b.idToken || '');
  const state = String(b.state || '');
  if (!idToken) {
    return res.status(400).type('html').send(
      '<!doctype html><title>Sign-in failed</title><p>Google did not return a token. Close this tab and try again in FiHaven.</p>'
    );
  }
  let code;
  try {
    code = oauthHandoff.create({ provider: 'google', idToken, name: null, state });
  } catch (err) {
    console.error('oauth google handoff create failed:', err && err.message);
    return res.status(500).type('html').send(
      '<!doctype html><title>Sign-in failed</title><p>Could not finish Google sign-in. Close this tab and try again in FiHaven.</p>'
    );
  }
  return res.redirect(302, oauthHandoff.appReturnUrl('google', { code, state }));
}
router.post('/oauth/google/callback', appleFormBody, googleAndroidCallback);
router.get('/oauth/google/callback', googleAndroidCallback);

// POST /api/auth/oauth/:provider/handoff — Custom Tab Google page deposits
// an id_token and receives a one-time code for the App Link return.
router.post('/oauth/:provider/handoff', (req, res) => {
  const provider = req.params.provider;
  if (provider !== 'google' && provider !== 'apple') {
    return sendError(res, 404, 'unknown-provider');
  }
  const body = req.body || {};
  const idToken = String(body.idToken || '');
  if (!idToken) return sendError(res, 400, 'missing-id-token');
  let code;
  try {
    code = oauthHandoff.create({
      provider,
      idToken,
      name: body.name || null,
      state: body.state || null,
    });
  } catch (err) {
    console.error(`oauth ${provider} handoff create failed:`, err && err.message);
    return sendError(res, 500, 'server-error');
  }
  return res.json({
    code,
    returnUrl: oauthHandoff.appReturnUrl(provider, {
      code,
      state: body.state || null,
    }),
    httpsReturnUrl: oauthHandoff.httpsReturnUrl(provider, {
      code,
      state: body.state || null,
    }),
  });
});

// POST /api/auth/oauth/:provider — exchange a provider ID token (or a
// one-time Android handoff code) for a FiHaven session. Find the linked
// account; else auto-link by verified email; else create a new
// (already-verified, no-password) account. If the account has app-level
// MFA enrolled, require it before minting a session (same challenge flow
// as password login).
router.post('/oauth/:provider', async (req, res) => {
  const provider = req.params.provider;
  if (provider !== 'google' && provider !== 'apple') {
    return sendError(res, 404, 'unknown-provider');
  }
  const configured = provider === 'google'
    ? oauth.googleAudiences().length
    : oauth.appleAudiences().length;
  if (!configured) return sendError(res, 400, 'provider-not-configured');

  const body = req.body || {};
  let idToken = body.idToken;
  let name = body.name;
  if (body.handoffCode) {
    try {
      const handoff = oauthHandoff.consume({
        provider,
        code: body.handoffCode,
        state: body.state,
      });
      idToken = handoff.idToken;
      if (!name && handoff.name) name = handoff.name;
    } catch (err) {
      const code = (err && err.code) || 'handoff-invalid';
      return sendError(res, 401, code);
    }
  }
  if (!idToken) return sendError(res, 400, 'missing-id-token');

  let identity;
  try {
    identity = await oauth.verifyProvider(provider, idToken, name);
  } catch (err) {
    console.error(`oauth ${provider} verify failed:`, err && err.message);
    return sendError(res, 401, 'oauth-verify-failed');
  }
  // Auto-linking relies on the provider having verified the address.
  if (!identity.email || !identity.emailVerified) {
    return sendError(res, 401, 'oauth-email-unverified');
  }

  let account = dbApi.findUserByOAuth(provider, identity.subject);
  if (!account) {
    const existing = dbApi.findUserByEmail(identity.email);
    if (existing) {
      dbApi.linkOAuth(existing.id, provider, identity.subject);
      account = existing;
    } else {
      try {
        const created = dbApi.createOAuthUser(identity.email, identity.name);
        dbApi.linkOAuth(created.id, provider, identity.subject);
        account = dbApi.findUserById(created.id);
      } catch (err) {
        if (err && /UNIQUE/.test(String(err.message))) {
          const again = dbApi.findUserByEmail(identity.email); // raced same-email signup
          if (again) { dbApi.linkOAuth(again.id, provider, identity.subject); account = again; }
        }
        if (!account) {
          console.error('oauth account create failed:', err && err.message);
          return sendError(res, 500, 'server-error');
        }
      }
    }
  }

  if (account.suspended) {
    return sendError(res, 403, 'account-suspended');
  }

  // App-level MFA still applies after a federated first factor.
  const totp = dbApi.getTotp(account.id);
  const totpEnabled = !!(totp && totp.enabled_at);
  const passkeyCount = dbApi.countPasskeys(account.id);
  const emailEnabled = !!(account.email_mfa_enabled);
  if (totpEnabled || passkeyCount > 0 || emailEnabled) {
    const tokenId = mfa.newChallengeId();
    const now = Date.now();
    dbApi.insertChallenge({
      id: tokenId,
      user_id: account.id,
      kind: 'mfa-login',
      payload: null,
      created_at: now,
      expires_at: now + MFA_TOKEN_TTL_MS,
    });
    const methods = [];
    if (passkeyCount > 0) methods.push('passkey');
    if (totpEnabled) methods.push('totp');
    if (emailEnabled) methods.push('email');
    return res.status(200).json({
      mfaRequired: true,
      mfaToken: tokenId,
      methods,
    });
  }

  return finishLogin(res, req, account);
});

module.exports = router;
