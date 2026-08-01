/* ═══════════════════════════════════════════════════════════
   paddle.js — Paddle Billing API client, webhook signature
   verification, and the notification-IP allowlist.

   Paddle is the merchant of record for web purchases: it takes the
   payment, handles tax, and tells us what happened over webhooks. That
   makes the webhook the ONLY thing standing between a forged HTTP
   request and a free Pro entitlement, so verification here is the
   security boundary for all web billing.

   Two independent checks guard it:

     1. SIGNATURE (authoritative). Paddle signs every delivery with
        HMAC-SHA256 over "<ts>:<raw body>" using the destination's
        endpoint secret. Verified timing-safely against the raw bytes —
        re-serializing the parsed body would change whitespace and key
        order and break the comparison.
     2. SOURCE IP (defence in depth). Paddle publishes its notification
        IPs at https://api.paddle.com/ips. Never hard-coded: the list is
        fetched and cached, because Paddle can and does change it.

   The IP check deliberately does NOT fail closed when the IP list can't
   be fetched. The signature is cryptographically authoritative on its
   own, and dropping real subscription events during a transient network
   blip would silently strip Pro from paying customers. An unreachable
   list is logged and the request falls through to signature checking.
═════════════════════════════════════════════════════════════════ */

'use strict';

const crypto = require('crypto');

const API_BASE = 'https://api.paddle.com';
const IPS_URL = API_BASE + '/ips';

/* ── configuration ───────────────────────────────────────────── */

function apiKey() { return process.env.PADDLE_API_KEY || ''; }
function webhookSecret() { return process.env.PADDLE_WEBHOOK_SECRET || ''; }

/** Public, ships in the browser bundle — safe to expose over the API. */
function clientToken() { return process.env.PADDLE_CLIENT_TOKEN || null; }

/** Server-side calls need the API key; checkout only needs the token. */
function paddleConfigured() { return !!apiKey(); }

/**
 * 'production' | 'sandbox' — Paddle's own naming, sent to Paddle.js.
 * Live is the default; sandbox must be opted into explicitly so a
 * missing env var can never silently point production at test data.
 */
function environment() {
  return process.env.PADDLE_ENV === 'sandbox' ? 'sandbox' : 'production';
}

/* ── REST ────────────────────────────────────────────────────── */

/**
 * Call the Paddle API. Throws on a non-2xx so callers don't have to
 * unpack Paddle's error envelope themselves.
 * @returns {Promise<object>} the `data` member of the response
 */
async function api(path, { method = 'GET', body } = {}) {
  if (!paddleConfigured()) throw new Error('paddle-not-configured');
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + apiKey(),
      'Content-Type': 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (json && json.error && (json.error.detail || json.error.code)) || res.status;
    const err = new Error('paddle-api-error: ' + detail);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json.data;
}

/**
 * Cancel a subscription at Paddle.
 *
 * `effectiveFrom` is Paddle's own vocabulary: 'immediately' stops the
 * subscription now, 'next_billing_period' lets the paid term run out first.
 * Account deletion uses 'immediately' — the account it belongs to is about to
 * cease existing, so there is nothing left to run out.
 *
 * A subscription that is already canceled at Paddle returns 4xx; callers that
 * are offboarding should treat that as success, not as a failure to retry.
 */
async function cancelSubscription(subscriptionId, effectiveFrom = 'immediately') {
  return api('/subscriptions/' + encodeURIComponent(String(subscriptionId)) + '/cancel', {
    method: 'POST',
    body: { effective_from: effectiveFrom },
  });
}

/* ── webhook signature ───────────────────────────────────────── */

// Paddle-Signature: "ts=1671552777;h1=eb4d0dc8853be…"
function parseSignatureHeader(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  // timingSafeEqual throws on a length mismatch, which would itself leak
  // length via the exception path — compare lengths first, explicitly.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify a Paddle webhook delivery.
 *
 * @param {Buffer|string} rawBody  the EXACT bytes received (never the re-encoded body)
 * @param {string} signatureHeader value of the `Paddle-Signature` header
 * @param {number} [toleranceSec]  replay window; Paddle recommends 5 seconds,
 *                                 widened to 5 minutes so ordinary clock skew
 *                                 between hosts doesn't reject real events.
 * @returns {boolean}
 */
function verifyWebhookSignature(rawBody, signatureHeader, toleranceSec = 300) {
  const secret = webhookSecret();
  if (!secret) return false;

  const parts = parseSignatureHeader(signatureHeader);
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return false;

  // Reject stale deliveries so a captured request can't be replayed later.
  const tsSec = Number(ts);
  if (!Number.isFinite(tsSec)) return false;
  const ageSec = Math.abs(Date.now() / 1000 - tsSec);
  if (ageSec > toleranceSec) return false;

  const payload = Buffer.concat([
    Buffer.from(ts + ':', 'utf8'),
    Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8'),
  ]);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return timingSafeEqualHex(expected, h1);
}

/* ── notification IP allowlist ───────────────────────────────── */

const IP_TTL_MS = 60 * 60 * 1000;   // refresh hourly
let ipCache = { cidrs: null, fetchedAt: 0 };

/**
 * Paddle's current notification IPs, as /32 CIDR strings. Cached for an
 * hour. Returns the last known good list if a refresh fails, or null if
 * we have never managed to fetch one.
 */
async function notificationIps() {
  const fresh = ipCache.cidrs && Date.now() - ipCache.fetchedAt < IP_TTL_MS;
  if (fresh) return ipCache.cidrs;
  try {
    const res = await fetch(IPS_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('status ' + res.status);
    const json = await res.json();
    const cidrs = (json && json.data && json.data.ipv4_cidrs) || [];
    if (!Array.isArray(cidrs) || !cidrs.length) throw new Error('empty list');
    ipCache = { cidrs, fetchedAt: Date.now() };
    return cidrs;
  } catch (err) {
    console.warn('paddle: could not refresh notification IPs:', err.message);
    return ipCache.cidrs;   // stale is better than nothing; null if never fetched
  }
}

// Paddle publishes plain /32s, so the address itself is the whole test —
// no netmask arithmetic, and anything wider would be a change worth noticing.
function cidrMatches(cidr, ip) {
  const [addr, bits] = String(cidr).split('/');
  if (bits && bits !== '32') return false;
  return addr === ip;
}

/** Normalize Express's IP, which may arrive IPv6-mapped ("::ffff:1.2.3.4"). */
function normalizeIp(ip) {
  const s = String(ip || '');
  return s.startsWith('::ffff:') ? s.slice(7) : s;
}

/**
 * Is this request from Paddle? `null` means "unknown" — the IP list was
 * never fetchable — and callers should fall through to the signature
 * check rather than reject.
 * @returns {Promise<boolean|null>}
 */
async function isPaddleIp(ip) {
  const cidrs = await notificationIps();
  if (!cidrs) return null;
  const addr = normalizeIp(ip);
  return cidrs.some((c) => cidrMatches(c, addr));
}

/** Test seam — drop the cached IP list. */
function _resetIpCache() { ipCache = { cidrs: null, fetchedAt: 0 }; }

module.exports = {
  API_BASE,
  api,
  apiKey,
  cancelSubscription,
  clientToken,
  environment,
  paddleConfigured,
  webhookSecret,
  verifyWebhookSignature,
  parseSignatureHeader,
  notificationIps,
  isPaddleIp,
  normalizeIp,
  cidrMatches,
  _resetIpCache,
};
