/* ═══════════════════════════════════════════════════════════
   plaid.js — Plaid client wrapper for the OPTIONAL, Pro-gated
   bank-linking feature.

   FiHaven is manual-first: linking a bank via Plaid is a paid
   convenience overlay, never a requirement. This module is a thin
   wrapper around the official `plaid` SDK that:
     • lazily builds a client from PLAID_CLIENT_ID / PLAID_SECRET,
     • creates Link tokens, exchanges public tokens,
     • pulls account balances and (cursor-based) transactions,
     • removes items on disconnect.

   Access tokens are bank credentials, so they are encrypted at
   rest with the same AES-256-GCM helper that protects TOTP
   secrets (see mfa.js) — only the ciphertext is stored.

   PLAID_ENV defaults to 'sandbox'; nothing here talks to a real
   bank until you set production credentials.
═════════════════════════════════════════════════════════════════ */

'use strict';

const {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} = require('plaid');

// Reuse the vetted at-rest encryption used for MFA secrets so the
// Plaid access_token is never stored in plaintext.
const { encrypt, decrypt } = require('./mfa');

// Only 'sandbox' and 'production' exist in the v42 SDK. Anything else
// (including the retired 'development') falls back to sandbox.
function plaidEnv() {
  const e = (process.env.PLAID_ENV || 'sandbox').toLowerCase();
  return PlaidEnvironments[e] ? e : 'sandbox';
}

// The client_id is the same across environments, so accept a generic
// name or either env-specific one.
function plaidClientId() {
  return (
    process.env.PLAID_CLIENT_ID ||
    process.env.PLAID_SANDBOX_CLIENT_ID ||
    process.env.PLAID_PRODUCTION_CLIENT_ID ||
    ''
  );
}

// The secret IS per-environment. Prefer the one matching PLAID_ENV, then fall
// back to a generic PLAID_SECRET. Order matters: a stale generic PLAID_SECRET
// left over from sandbox would otherwise shadow PLAID_PRODUCTION_SECRET and
// every call would fail INVALID_API_KEYS.
function plaidSecret() {
  if (plaidEnv() === 'production') {
    return process.env.PLAID_PRODUCTION_SECRET || process.env.PLAID_SECRET || '';
  }
  return process.env.PLAID_SANDBOX_SECRET || process.env.PLAID_SECRET || '';
}

function plaidConfigured() {
  return !!(plaidClientId() && plaidSecret());
}

let _client = null;
function client() {
  if (!plaidConfigured()) throw new Error('plaid-not-configured');
  if (_client) return _client;
  _client = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[plaidEnv()],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': plaidClientId(),
          'PLAID-SECRET': plaidSecret(),
          'Plaid-Version': '2020-09-14',
        },
      },
    })
  );
  return _client;
}

// Map the comma-separated env lists onto the SDK enums, dropping
// anything unrecognized and falling back to sane defaults.
function products() {
  const valid = new Set(Object.values(Products));
  const out = (process.env.PLAID_PRODUCTS || 'transactions')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => valid.has(s));
  return out.length ? out : [Products.Transactions];
}
function countryCodes() {
  const valid = new Set(Object.values(CountryCode));
  const out = (process.env.PLAID_COUNTRY_CODES || 'US')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => valid.has(s));
  return out.length ? out : [CountryCode.Us];
}

/* ── Link / exchange ─────────────────────────────────────────── */

// Create a short-lived Link token the browser hands to Plaid Link.
// Pass `accessToken` to create an UPDATE-MODE token (re-auth an existing
// item after ITEM_LOGIN_REQUIRED) — update mode omits `products`.
// `opts.accountSelection` opens update mode with account selection enabled,
// the flow for NEW_ACCOUNTS_AVAILABLE (let the user add newly-available
// accounts to an existing Item).
async function createLinkToken(user, accessToken, opts = {}) {
  const req = {
    user: { client_user_id: String(user.id) },
    client_name: 'FiHaven',
    language: 'en',
    country_codes: countryCodes(),
  };
  if (accessToken) {
    req.access_token = accessToken; // update mode: re-link the existing item
    if (opts.accountSelection) req.update = { account_selection_enabled: true };
  } else {
    req.products = products();
  }
  if (process.env.PLAID_WEBHOOK_URL) req.webhook = process.env.PLAID_WEBHOOK_URL;
  if (process.env.PLAID_REDIRECT_URI) req.redirect_uri = process.env.PLAID_REDIRECT_URI;
  const resp = await client().linkTokenCreate(req);
  return resp.data; // { link_token, expiration, request_id }
}

// Trade the one-time public_token from Link for a long-lived
// access_token + item_id.
async function exchangePublicToken(publicToken) {
  const resp = await client().itemPublicTokenExchange({ public_token: publicToken });
  return { accessToken: resp.data.access_token, itemId: resp.data.item_id };
}

async function getInstitution(institutionId) {
  if (!institutionId) return null;
  try {
    const resp = await client().institutionsGetById({
      institution_id: institutionId,
      country_codes: countryCodes(),
    });
    return resp.data.institution || null;
  } catch (_) {
    return null; // institution metadata is best-effort
  }
}

/* ── Data pulls ──────────────────────────────────────────────── */

// Accounts + live balances for an item.
async function getAccounts(accessToken) {
  const resp = await client().accountsBalanceGet({ access_token: accessToken });
  return { item: resp.data.item, accounts: resp.data.accounts || [] };
}

// Cursor-based transactions sync. Paginates until caught up and
// returns the diff plus the next cursor. We don't persist individual
// transactions yet (no transactions UI) — advancing the cursor proves
// the pipeline and leaves a hook for future bill auto-matching.
async function syncTransactions(accessToken, cursor) {
  let added = [];
  let modified = [];
  let removed = [];
  let next = cursor || null;
  let hasMore = true;
  while (hasMore) {
    const resp = await client().transactionsSync({
      access_token: accessToken,
      cursor: next || undefined,
    });
    const d = resp.data;
    added = added.concat(d.added || []);
    modified = modified.concat(d.modified || []);
    removed = removed.concat(d.removed || []);
    next = d.next_cursor;
    hasMore = d.has_more;
  }
  return { added, modified, removed, cursor: next };
}

async function removeItem(accessToken) {
  await client().itemRemove({ access_token: accessToken });
}

/* ── Webhook verification ────────────────────────────────────── */

const crypto = require('crypto');
const _jwkCache = new Map(); // kid → JWK (Plaid keys are stable per kid)

// Verify a Plaid webhook: the `Plaid-Verification` header is an ES256 JWT
// whose `request_body_sha256` claim must equal sha256(raw body), signed by
// the key Plaid returns for the JWT's `kid`. Replay-guarded via `iat`.
// Returns true only when everything checks out. (Sandbox sends no header,
// so callers skip verification there.)
async function verifyWebhook(headerJwt, rawBody) {
  try {
    if (!headerJwt || !rawBody) return false;
    const [h64, p64, sig64] = String(headerJwt).split('.');
    if (!h64 || !p64 || !sig64) return false;

    const header = JSON.parse(Buffer.from(h64, 'base64url').toString('utf8'));
    if (header.alg !== 'ES256' || !header.kid) return false;

    let jwk = _jwkCache.get(header.kid);
    if (!jwk) {
      const resp = await client().webhookVerificationKeyGet({ key_id: header.kid });
      jwk = resp.data.key;
      if (!jwk || jwk.expired_at) return false;
      _jwkCache.set(header.kid, jwk);
    }

    const pubKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const ok = crypto.verify(
      'sha256',
      Buffer.from(`${h64}.${p64}`),
      { key: pubKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(sig64, 'base64url')
    );
    if (!ok) return false;

    const claims = JSON.parse(Buffer.from(p64, 'base64url').toString('utf8'));
    // Reject stale webhooks (>5 min) to blunt replays.
    if (!claims.iat || Math.abs(Date.now() / 1000 - claims.iat) > 300) return false;

    const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    return typeof claims.request_body_sha256 === 'string' &&
      crypto.timingSafeEqual(Buffer.from(bodyHash), Buffer.from(claims.request_body_sha256));
  } catch (_) {
    return false;
  }
}

module.exports = {
  plaidConfigured,
  plaidEnv,
  plaidClientId,
  plaidSecret,
  createLinkToken,
  exchangePublicToken,
  verifyWebhook,
  getInstitution,
  getAccounts,
  syncTransactions,
  removeItem,
  // Re-export the at-rest helpers so the route/db layer encrypts the
  // access_token without reaching into mfa.js directly.
  encryptToken: encrypt,
  decryptToken: decrypt,
};
