/* ═══════════════════════════════════════════════════════════
   util.js — email normalization/validation, password policy,
   and a small JSON error helper.
═════════════════════════════════════════════════════════════════ */

'use strict';

// Conservative email check — good enough to reject obvious junk.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 10;
const MAX_PASSWORD = 128;
const BCRYPT_COST = 12;

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
  normalizeEmail,
  isValidEmail,
  checkPasswordPolicy,
  sendError,
};
