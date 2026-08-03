/* ═══════════════════════════════════════════════════════════
   reauth.js — "prove you're still there" for sensitive actions.

   Two problems this solves at once:

   1. Password was the ONLY accepted proof, and Sign in with Apple /
      Google accounts have no usable password (they carry a sentinel
      hash). Every re-auth prompt was therefore unanswerable for them,
      which locked those users out of disabling TOTP, deleting a
      passkey, regenerating backup codes, and account deletion.

   2. Some sensitive actions asked for nothing at all — notably passkey
      ENROLLMENT, so a stolen session could plant a credential that
      outlives the password change that was supposed to evict it.

   Accepted proofs, in order of preference:
     • the account password, when the account has one;
     • a 6-digit code emailed on demand, for password-less accounts.

   The emailed code reuses the mfa_challenges row (and its attempts
   counter) so it gets the same brute-force ceiling as login MFA.
═════════════════════════════════════════════════════════════════ */

'use strict';

const bcrypt = require('bcrypt');

const dbApi = require('./db');
const mfa = require('./mfa');
const mail = require('./mail');

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
// One outstanding re-auth code per user. A deterministic id means no extra
// lookup statement, and it is not a secret: the row's payload is a bcrypt hash
// of the code, and `kind` keeps it from being mistaken for a login token.
function challengeId(userId) {
  return `reauth:${userId}`;
}

/** Does this account have a password that could be re-entered? */
function hasPassword(user) {
  return dbApi.userHasPassword(user);
}

/**
 * Email a fresh re-auth code. Only meaningful for password-less accounts;
 * callers should not offer it when hasPassword(user) is true.
 */
async function sendCode(user) {
  const code = mfa.newEmailCode();
  const hash = await mfa.hashEmailCode(code);
  const now = Date.now();
  const id = challengeId(user.id);

  // Replace any outstanding code, resetting attempts — this branch is reached
  // only by someone already holding a valid session for the account.
  dbApi.deleteChallenge(id);
  dbApi.insertChallenge({
    id,
    user_id: user.id,
    kind: 'reauth',
    payload: hash,
    created_at: now,
    expires_at: now + CODE_TTL_MS,
  });

  await mail.sendMail({
    to: user.email,
    subject: 'Your FiHaven confirmation code',
    text:
      `Your FiHaven confirmation code is: ${code}\n\n` +
      `Enter it to confirm a sensitive change to your account.\n` +
      `The code expires in 10 minutes.\n\n` +
      `If you didn't request this, someone may have access to your account — ` +
      `sign out of all devices and review your security settings.`,
    html:
      `<p>Your FiHaven confirmation code:</p>` +
      `<p style="font-size:24px;font-family:monospace;letter-spacing:.15em;"><strong>${code}</strong></p>` +
      `<p>Enter it to confirm a sensitive change to your account. The code expires in 10 minutes.</p>` +
      `<p style="color:#888;font-size:12px;">If you didn't request this, someone may have access to ` +
      `your account — sign out of all devices and review your security settings.</p>`,
  });
}

/**
 * Verify a re-auth proof from a request body.
 *
 * @param {object} user  full user row (needs id, email, password_hash)
 * @param {object} body  request body; reads `password` or `reauthCode`
 * @returns {Promise<null|{status:number, error:string}>} null on success
 */
async function verify(user, body) {
  const b = body || {};

  if (hasPassword(user)) {
    const ok = await bcrypt.compare(String(b.password || ''), user.password_hash);
    return ok ? null : { status: 401, error: 'wrong-password' };
  }

  // Password-less (OAuth) account → emailed code.
  const code = String(b.reauthCode || '').trim();
  if (!code) return { status: 401, error: 'reauth-code-required' };

  const ch = dbApi.findChallenge(challengeId(user.id));
  if (!ch || ch.kind !== 'reauth') return { status: 401, error: 'reauth-code-required' };
  if (ch.expires_at < Date.now()) {
    dbApi.deleteChallenge(ch.id);
    return { status: 401, error: 'reauth-code-expired' };
  }
  if (ch.attempts >= MAX_ATTEMPTS) {
    dbApi.deleteChallenge(ch.id);
    return { status: 429, error: 'reauth-too-many-attempts' };
  }

  if (!(await mfa.compareEmailCode(code, ch.payload))) {
    const attempts = dbApi.bumpChallengeAttempts(ch.id);
    if (attempts >= MAX_ATTEMPTS) {
      dbApi.deleteChallenge(ch.id);
      return { status: 429, error: 'reauth-too-many-attempts' };
    }
    return { status: 401, error: 'invalid-reauth-code' };
  }

  // Single use — a confirmed code must not authorize a second action.
  dbApi.deleteChallenge(ch.id);
  return null;
}

module.exports = { verify, sendCode, hasPassword, CODE_TTL_MS, MAX_ATTEMPTS };
