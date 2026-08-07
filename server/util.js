/* ═══════════════════════════════════════════════════════════
   util.js — email normalization/validation, password policy,
   and a small JSON error helper.
═════════════════════════════════════════════════════════════════ */

'use strict';

// Conservative email check — good enough to reject obvious junk.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 10;
const MAX_PASSWORD = 128;
// The cost FiHaven ships. This is the security-relevant number and it is
// pinned by util.test.js — keep it here, unconditional, so that guard means
// something.
const BCRYPT_COST = 12;

// The cost actually passed to bcrypt. Identical in production; under test it
// drops to bcrypt's floor, because the integration suite clears the require
// cache and re-imports `routes/auth` for every file — each paying a *blocking*
// `hashSync` for DUMMY_HASH — and then signs a user up per case. At cost 12
// that is ~197ms of blocked event loop apiece (~1ms at cost 4), which starved
// the workers running alongside and made timing-sensitive cases flake. Nothing
// in the suite asserts on the KDF's strength.
//
// It takes BOTH the test runner's own marker and NODE_ENV, deliberately.
// `NODE_ENV=test` on its own is not proof a test is running — it is one of the
// most commonly set variables in a process manager, and a single stray value in
// production would silently hash every new password at cost 4 while the
// BCRYPT_COST guard below kept passing. `VITEST` is set by the runner itself
// and cannot be true of a real deployment, so the weaker cost is unreachable
// outside a test process.
const IS_TEST_RUN = process.env.VITEST === 'true' && process.env.NODE_ENV === 'test';
const ACTIVE_BCRYPT_COST = IS_TEST_RUN ? 4 : BCRYPT_COST;

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return email.length >= 3 && email.length <= 254 && EMAIL_RE.test(email);
}

// Returns null when the password is acceptable, otherwise an error code.
function checkPasswordPolicy(password, email) {
  const pw = String(password || '');
  if (pw.length < MIN_PASSWORD || pw.length > MAX_PASSWORD) return 'weak-password';
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'weak-password';
  const localPart = String(email || '').split('@')[0];
  if (localPart && pw.toLowerCase() === localPart.toLowerCase()) return 'weak-password';
  return null;
}

function sendError(res, status, code) {
  return res.status(status).json({ error: code });
}

module.exports = {
  MIN_PASSWORD,
  MAX_PASSWORD,
  BCRYPT_COST,
  ACTIVE_BCRYPT_COST,
  normalizeEmail,
  isValidEmail,
  checkPasswordPolicy,
  sendError,
};
