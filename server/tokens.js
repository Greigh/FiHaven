/* ═══════════════════════════════════════════════════════════
   tokens.js — single-use, expiring email tokens. Used for email
   verification, password reset, and 2FA recovery. The raw token is
   returned once (to put in the email link); only its SHA-256 hash is
   stored, so a database leak can't be turned into a working link.
═════════════════════════════════════════════════════════════════ */

'use strict';

const crypto = require('crypto');
const dbApi = require('./db');

// Per-purpose lifetimes. Reset/recover are short (sensitive); the
// verification link is generous so people can confirm later.
const TTL_MS = {
  'verify-email': 24 * 60 * 60 * 1000, // 24h
  'password-reset': 30 * 60 * 1000, // 30m
  'recover-2fa': 30 * 60 * 1000, // 30m
};

function hash(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

// Mint a fresh token for (userId, purpose). Any prior unused token of the
// same purpose is dropped so only the newest link works. Returns the RAW
// token — the only moment it exists in plaintext.
function issue(userId, purpose) {
  const raw = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  dbApi.deleteEmailTokensByPurpose(userId, purpose);
  dbApi.insertEmailToken({
    user_id: userId,
    purpose,
    token_hash: hash(raw),
    created_at: now,
    expires_at: now + (TTL_MS[purpose] || 30 * 60 * 1000),
  });
  return raw;
}

// Validate a raw token for a purpose. Returns { id, userId } when the
// token exists, matches the purpose, is unused, and is unexpired —
// otherwise null. Does NOT consume; the caller consumes on success.
function check(raw, purpose) {
  if (!raw) return null;
  const row = dbApi.findEmailTokenByHash(hash(raw));
  if (!row) return null;
  if (row.purpose !== purpose) return null;
  if (row.used_at) return null;
  if (row.expires_at < Date.now()) return null;
  return { id: row.id, userId: row.user_id };
}

// Mark a token consumed so the link can't be replayed.
function consume(id) {
  dbApi.markEmailTokenUsed(id, Date.now());
}

module.exports = { issue, check, consume, hash };
