/* ═══════════════════════════════════════════════════════════
   securityHeaders.js — the response headers that constrain what a
   browser will do with a FiHaven page.

   Everything here except the CSP is unconditional and safe: it only
   ever removes capability the app never used. The CSP is the one that
   can break a working page (a missed third-party origin kills bank
   linking or checkout), so it ships in Report-Only until the console
   is quiet — see CSP_ENFORCE below.
═════════════════════════════════════════════════════════════════ */

'use strict';

const crypto = require('crypto');

/* ── third-party origins the app genuinely loads ─────────────── */
// Kept as named groups so it's obvious WHY each origin is trusted, and
// so removing a vendor is a one-line change.
const TURNSTILE = 'https://challenges.cloudflare.com';
const PLAID = 'https://cdn.plaid.com';
const PADDLE_CDN = 'https://cdn.paddle.com';
const PADDLE_BUY = 'https://buy.paddle.com https://sandbox-buy.paddle.com';
// Paddle's REST API, called from the browser by Paddle.js `PricePreview` — the
// paywall reads live plan prices from it (client/js/pro.js `fetchPrices`).
const PADDLE_API = 'https://api.paddle.com https://sandbox-api.paddle.com';
// Paddle Retain (ProfitWell), which Paddle.js loads itself on Initialize.
const PADDLE_RETAIN = 'https://public.profitwell.com https://api.profitwell.com';
const GOOGLE_SIGNIN = 'https://accounts.google.com';
const APPLE_SIGNIN = 'https://appleid.cdn-apple.com https://appleid.apple.com';
const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com';
const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com';
// Cloudflare Web Analytics beacon (injected on the proxied edge).
const CF_INSIGHTS = 'https://static.cloudflareinsights.com';
const CF_INSIGHTS_CONNECT = 'https://cloudflareinsights.com';

// SHA-256 of every inline <script> we ship, so the CSP can allow exactly
// those and nothing else — no 'unsafe-inline'. Static HTML keeps working
// without per-request rewriting; Cloudflare Bot Fight Mode's injected
// detection script is covered separately via a per-request nonce (below).
//
// Regenerate after editing any inline script in client/*.html:
//   node scripts/csp-hashes.js
const INLINE_SCRIPT_HASHES = [
  // The theme bootstrap that runs before paint (all 25 pages).
  "'sha256-mR59x0idOhjPq9cQO1dF3RJ1JNucX4BsdliBrgLrMZM='",
  // application/ld+json structured data — non-executable, but script-src
  // still governs the element. One per page that carries a graph.
  "'sha256-cOlgc+GH17pvyWW6f1tDQh9ZzNGB1wFfeuSQoE605c8='",   // bill-tracker-app
  "'sha256-d+3PmsTGuTjmuLoKnV5RQKZuH0ChLzEdxqHWwt4Tlns='",   // contact
  "'sha256-uQ3OJDm1QL/5f/FCOuUNFI2uh6PjLMcHFfZ071hot64='",   // faq
  "'sha256-7zmQDR95YJ8xn8dUHL9gYujafeBDphRdFMECgTpJb24='",   // home
  "'sha256-UuB16srnzFcaJreOuqElKFG4R2dbS6z8IXF7v8I+4iw='",   // mint-alternative
  "'sha256-Pgu8v+o7MsmXMXOMXOyvTw3Nekrm8vhv73lvNIGcVfk='",   // pricing
  "'sha256-IJhy48F3Yo5ThnZe8BjrGbxyk9zm1po4trcq0P+/ikM='",   // rocket-money-alternative
  // client/public/ — copied verbatim into dist, not Vite-processed: the OAuth
  // return pages the Android sign-in flow lands on, and the offline fallback
  // page (its retry script must run with no network).
  "'sha256-U4dw3sAvIlexZIlD+ERF5Ec6xL4tXZAVg28V0G/59eQ='",   // oauth-google-android
  "'sha256-L3r+JZUA0GeWfSDQ7c+BwlOACFyw3apTMGbsYIzHScY='",   // oauth-return
  "'sha256-ExHs1lzkzBKdLeBPRmz8KByACsewCi326efa+s0NKuU='",   // offline
].join(' ');

/**
 * @param {string} [nonce] base64url nonce. When set, script-src includes
 *   'nonce-…' so Cloudflare can stamp the Bot Fight Mode / JS Detections
 *   snippet it injects at the edge (that snippet's body changes every
 *   request, so a hash allowlist can never cover it). Our own inline
 *   scripts stay on the hash list and do not need the attribute.
 */
function buildCsp(nonce) {
  const nonceSrc = nonce ? `'nonce-${nonce}' ` : '';
  return [
    "default-src 'self'",
    `script-src 'self' ${nonceSrc}${INLINE_SCRIPT_HASHES} ${TURNSTILE} ${PLAID} ${PADDLE_CDN} ${PADDLE_RETAIN} ${GOOGLE_SIGNIN} ${APPLE_SIGNIN} ${CF_INSIGHTS}`,
    // 'unsafe-inline' is load-bearing for styles: the UI is rendered from
    // HTML strings carrying style="" attributes throughout. Removing it is a
    // real refactor, and style injection is a far smaller prize than script.
    // Paddle.js pulls its own stylesheet from the CDN on Initialize.
    `style-src 'self' 'unsafe-inline' ${GOOGLE_FONTS_CSS} ${PADDLE_CDN}`,
    `font-src 'self' ${GOOGLE_FONTS_FILES} data:`,
    // Issuer logos + user-supplied category icons can be data: URIs or remote.
    "img-src 'self' data: https:",
    `connect-src 'self' ${PLAID} ${PADDLE_CDN} ${PADDLE_BUY} ${PADDLE_API} ${PADDLE_RETAIN} ${GOOGLE_SIGNIN} ${CF_INSIGHTS_CONNECT}`,
    `frame-src ${TURNSTILE} ${PLAID} https://plaid.com ${PADDLE_BUY} ${GOOGLE_SIGNIN} ${APPLE_SIGNIN}`,
    // Clickjacking: no one frames us. Belt to X-Frame-Options' braces, and the
    // only one of the two that modern browsers actually consult.
    "frame-ancestors 'none'",
    // Neutralises <base href> injection redirecting every relative URL.
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/**
 * Express middleware applying the standard security headers.
 *
 * CSP is Report-Only unless CSP_ENFORCE=1. Promote it once the browser
 * console is quiet on: sign-in (Turnstile, Google, Apple), Paddle checkout,
 * and Plaid Link — those are the flows with third-party frames and scripts.
 *
 * Cloudflare note: Bot Fight Mode injects a per-request inline script for
 * JavaScript Detections. A hash allowlist can never match it; we emit a
 * fresh CSP nonce each response so Cloudflare can copy it onto that tag
 * (documented under JavaScript Detections + CSP). Meta-tag nonces are not
 * supported — the value must be in the CSP *header*.
 */
function securityHeaders() {
  const enforce = process.env.CSP_ENFORCE === '1';
  const cspHeader = enforce
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only';
  const isProd = process.env.NODE_ENV === 'production';

  return function applySecurityHeaders(req, res, next) {
    const nonce = crypto.randomBytes(16).toString('base64url');
    res.locals.cspNonce = nonce;
    res.setHeader(cspHeader, buildCsp(nonce));
    // Stops the browser second-guessing a declared Content-Type — the vector
    // for turning an uploaded/echoed file into script.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    // Financial URLs can carry account context; never leak the path
    // cross-origin, but keep same-origin referrers so in-app links work.
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // The app asks for none of these; deny them so injected content can't.
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()'
    );
    // HSTS only over real HTTPS — sending it from a plaintext dev server
    // would pin localhost to https and make the dev server unreachable.
    if (isProd) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
    }
    next();
  };
}

module.exports = { securityHeaders, buildCsp, INLINE_SCRIPT_HASHES };
