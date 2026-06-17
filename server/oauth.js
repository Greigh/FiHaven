/* ═══════════════════════════════════════════════════════════
   oauth.js — federated sign-in (Sign in with Apple / Google).

   The client obtains an OIDC **ID token** from the provider and
   posts it to /api/auth/oauth/:provider. We verify it here and
   return a normalized identity { subject, email, emailVerified,
   name }, which the route turns into a session.

   Verification has two modes (OAUTH_VERIFY_MODE), mirroring
   billing.js:
     'dev-trust'  — decode the token and trust its claims without
                    checking the signature. Lets the flow be
                    exercised locally with hand-made tokens. Default
                    off-production.
     'production' — verify the RS256 signature against the provider's
                    published JWKS and validate iss / aud / exp.

   Config (env), all optional — a provider stays disabled until set:
     GOOGLE_OAUTH_CLIENT_ID   comma-separated allowed audiences
                              (web + iOS + Android client ids)
     APPLE_CLIENT_ID          comma-separated allowed audiences
                              (Service ID for web/Android + iOS bundle id)
═════════════════════════════════════════════════════════════════ */

'use strict';

const crypto = require('crypto');

const GOOGLE_ISS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
const APPLE_ISS = ['https://appleid.apple.com'];
const APPLE_JWKS = 'https://appleid.apple.com/auth/keys';

function verifyMode() {
  return (
    process.env.OAUTH_VERIFY_MODE ||
    (process.env.NODE_ENV === 'production' ? 'production' : 'dev-trust')
  );
}

function csv(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function googleAudiences() { return csv('GOOGLE_OAUTH_CLIENT_ID'); }
function appleAudiences() { return csv('APPLE_CLIENT_ID'); }

// Which providers are usable, for the client config endpoint + buttons.
function config() {
  const g = googleAudiences();
  const a = appleAudiences();
  return {
    google: g.length ? { enabled: true, clientId: g[0] } : { enabled: false },
    apple: a.length ? { enabled: true, clientId: a[0] } : { enabled: false },
  };
}

/* ── JWKS cache + JWT verification ───────────────────────────── */

const jwksCache = new Map(); // url -> { keys, fetchedAt }
const JWKS_TTL_MS = 60 * 60 * 1000;

async function fetchJwks(url) {
  const cached = jwksCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error('jwks-fetch-failed');
  const body = await res.json();
  const keys = Array.isArray(body.keys) ? body.keys : [];
  jwksCache.set(url, { keys, fetchedAt: Date.now() });
  return keys;
}

function b64urlToBuffer(s) {
  return Buffer.from(String(s), 'base64url');
}

function decodeJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('malformed-token');
  const header = JSON.parse(b64urlToBuffer(parts[0]).toString('utf8'));
  const payload = JSON.parse(b64urlToBuffer(parts[1]).toString('utf8'));
  return { header, payload, parts };
}

// Verify an OIDC ID token's signature + standard claims. Returns the payload.
async function verifyIdToken(token, { jwksUrl, issuers, audiences }) {
  const { header, payload, parts } = decodeJwt(token);

  if (verifyMode() === 'production') {
    if (header.alg !== 'RS256') throw new Error('unsupported-alg');
    const keys = await fetchJwks(jwksUrl);
    const jwk = keys.find((k) => k.kid === header.kid && (k.alg ? k.alg === 'RS256' : true));
    if (!jwk) throw new Error('signing-key-not-found');
    const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const ok = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      pub,
      b64urlToBuffer(parts[2])
    );
    if (!ok) throw new Error('bad-signature');

    if (!issuers.includes(payload.iss)) throw new Error('bad-issuer');
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.length || !auds.some((a) => audiences.includes(a))) {
      throw new Error('bad-audience');
    }
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < now) throw new Error('token-expired');
  }

  return payload;
}

/* ── provider entry points ───────────────────────────────────── */

function normalizeEmailVerified(v) {
  // Providers send true | "true" | false | "false".
  return v === true || v === 'true';
}

async function verifyGoogle(idToken) {
  const p = await verifyIdToken(idToken, {
    jwksUrl: GOOGLE_JWKS,
    issuers: GOOGLE_ISS,
    audiences: googleAudiences(),
  });
  if (!p.sub) throw new Error('missing-subject');
  return {
    provider: 'google',
    subject: String(p.sub),
    email: p.email ? String(p.email).toLowerCase() : null,
    emailVerified: normalizeEmailVerified(p.email_verified),
    name: p.name || null,
  };
}

async function verifyApple(idToken, fallbackName) {
  const p = await verifyIdToken(idToken, {
    jwksUrl: APPLE_JWKS,
    issuers: APPLE_ISS,
    audiences: appleAudiences(),
  });
  if (!p.sub) throw new Error('missing-subject');
  return {
    provider: 'apple',
    subject: String(p.sub),
    email: p.email ? String(p.email).toLowerCase() : null,
    // Apple verifies every address it returns (real or private-relay).
    emailVerified: normalizeEmailVerified(p.email_verified),
    // Apple never puts the name in the token; it arrives once, separately,
    // on the first authorization — the route passes it through here.
    name: fallbackName || null,
  };
}

async function verifyProvider(provider, idToken, name) {
  if (provider === 'google') return verifyGoogle(idToken);
  if (provider === 'apple') return verifyApple(idToken, name);
  throw new Error('unknown-provider');
}

module.exports = {
  verifyMode,
  config,
  googleAudiences,
  appleAudiences,
  verifyGoogle,
  verifyApple,
  verifyProvider,
};
