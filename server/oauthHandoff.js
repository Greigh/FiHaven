/* ═══════════════════════════════════════════════════════════
   oauthHandoff.js — one-time codes that carry a provider
   id_token from Custom Tab / server callback into the native
   app via an https App Link (never via a custom-scheme URL).
═════════════════════════════════════════════════════════════════ */

'use strict';

const crypto = require('crypto');
const dbApi = require('./db');

const TTL_MS = 2 * 60 * 1000;

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function publicOrigin() {
  return String(process.env.PUBLIC_ORIGIN || '').replace(/\/+$/, '');
}

/**
 * Persist id_token under a random code. Returns the raw code (show once).
 */
function create({ provider, idToken, name, state }) {
  const token = String(idToken || '');
  if (!token) throw new Error('missing-id-token');
  if (provider !== 'apple' && provider !== 'google') throw new Error('bad-provider');

  // Opportunistic prune so the table stays small.
  dbApi.deleteExpiredOAuthHandoffs(Date.now());

  const code = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  dbApi.insertOAuthHandoff({
    code_hash: hashCode(code),
    provider,
    id_token: token,
    name: name ? String(name) : null,
    state: state != null ? String(state) : null,
    created_at: now,
    expires_at: now + TTL_MS,
  });
  return code;
}

/**
 * Consume a handoff. Throws with .code for HTTP mapping:
 *   handoff-invalid | handoff-expired | handoff-used | handoff-mismatch
 */
function consume({ provider, code, state }) {
  const raw = String(code || '');
  if (!raw) {
    const err = new Error('handoff-invalid');
    err.code = 'handoff-invalid';
    throw err;
  }
  const row = dbApi.findOAuthHandoffByHash(hashCode(raw));
  if (!row) {
    const err = new Error('handoff-invalid');
    err.code = 'handoff-invalid';
    throw err;
  }
  if (row.provider !== provider) {
    const err = new Error('handoff-mismatch');
    err.code = 'handoff-mismatch';
    throw err;
  }
  if (row.used_at) {
    const err = new Error('handoff-used');
    err.code = 'handoff-used';
    throw err;
  }
  if (row.expires_at < Date.now()) {
    const err = new Error('handoff-expired');
    err.code = 'handoff-expired';
    throw err;
  }
  // State is required when the handoff stored one (CSRF).
  if (row.state != null && row.state !== '' && String(state || '') !== row.state) {
    const err = new Error('handoff-mismatch');
    err.code = 'handoff-mismatch';
    throw err;
  }
  const marked = dbApi.markOAuthHandoffUsed(row.code_hash, Date.now());
  if (!marked) {
    const err = new Error('handoff-used');
    err.code = 'handoff-used';
    throw err;
  }
  return {
    idToken: row.id_token,
    name: row.name || null,
    state: row.state,
  };
}

/** Deep-link return into the Android app (Custom Tab–safe).
 *  Prefer the custom scheme: same-host https App Links often stay inside
 *  Chrome Custom Tabs and never reach MainActivity. The one-time handoff
 *  code (not a JWT) is what travels on the URL. */
function appReturnUrl(provider, { code, state }) {
  const params = new URLSearchParams({ code: String(code || '') });
  if (state) params.set('state', String(state));
  return `fihaven://oauth/${provider}?${params.toString()}`;
}

/** https App Link twin — useful for browsers / verified association; not used
 *  as the primary Custom Tab bounce (see appReturnUrl). */
function httpsReturnUrl(provider, { code, state }) {
  const params = new URLSearchParams({ code: String(code || '') });
  if (state) params.set('state', String(state));
  const origin = publicOrigin();
  if (origin && /^https:\/\//i.test(origin)) {
    return `${origin}/oauth/${provider}?${params.toString()}`;
  }
  return null;
}

module.exports = {
  TTL_MS,
  create,
  consume,
  appReturnUrl,
  httpsReturnUrl,
  publicOrigin,
};
