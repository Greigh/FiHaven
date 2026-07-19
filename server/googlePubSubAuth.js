/* ═══════════════════════════════════════════════════════════
   googlePubSubAuth.js — verify Cloud Pub/Sub push OIDC JWTs
   (Play Real-Time Developer Notifications).
═════════════════════════════════════════════════════════════════ */

'use strict';

const crypto = require('crypto');

const GOOGLE_ISS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';

const jwksCache = { keys: null, fetchedAt: 0 };
const JWKS_TTL_MS = 60 * 60 * 1000;

function b64urlToBuffer(s) {
  return Buffer.from(String(s), 'base64url');
}

async function fetchJwks() {
  if (jwksCache.keys && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(GOOGLE_JWKS);
  if (!res.ok) throw new Error('jwks-fetch-failed');
  const body = await res.json();
  jwksCache.keys = Array.isArray(body.keys) ? body.keys : [];
  jwksCache.fetchedAt = Date.now();
  return jwksCache.keys;
}

function expectedAudiences() {
  const explicit = String(process.env.GOOGLE_PUBSUB_AUDIENCE || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (explicit.length) return explicit;
  const origin = String(process.env.PUBLIC_ORIGIN || '').replace(/\/+$/, '');
  if (origin) return [`${origin}/api/billing/google/notifications`];
  return [];
}

/**
 * Verify Authorization: Bearer <OIDC JWT> from a Pub/Sub push request.
 * In production this is required; in other envs a missing header is allowed
 * when GOOGLE_PUBSUB_REQUIRE_AUTH is not set.
 */
async function verifyPushRequest(req) {
  const requireAuth =
    process.env.NODE_ENV === 'production' ||
    process.env.GOOGLE_PUBSUB_REQUIRE_AUTH === '1';

  // Optional shared secret (query or header) as a second gate.
  const expectedToken = process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN;
  if (expectedToken) {
    const q = (req.query && req.query.token) || '';
    const h = req.get && req.get('x-goog-pubsub-token');
    if (q !== expectedToken && h !== expectedToken) {
      throw new Error('pubsub-token-invalid');
    }
  }

  const auth = (req.get && req.get('authorization')) || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) {
    if (requireAuth && !expectedToken) throw new Error('pubsub-auth-missing');
    return { ok: true, skipped: true };
  }

  const token = m[1];
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('pubsub-malformed-token');
  const header = JSON.parse(b64urlToBuffer(parts[0]).toString('utf8'));
  const payload = JSON.parse(b64urlToBuffer(parts[1]).toString('utf8'));

  if (header.alg !== 'RS256') throw new Error('pubsub-unsupported-alg');
  const keys = await fetchJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('pubsub-signing-key-not-found');
  const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    pub,
    b64urlToBuffer(parts[2])
  );
  if (!ok) throw new Error('pubsub-bad-signature');

  if (!GOOGLE_ISS.includes(payload.iss)) throw new Error('pubsub-bad-issuer');
  const audiences = expectedAudiences();
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (audiences.length && !auds.some((a) => audiences.includes(a))) {
    throw new Error('pubsub-bad-audience');
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) {
    throw new Error('pubsub-token-expired');
  }
  return { ok: true, email: payload.email || null };
}

module.exports = { verifyPushRequest, expectedAudiences };
