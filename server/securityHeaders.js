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

/* ── third-party origins the app genuinely loads ─────────────── */
// Kept as named groups so it's obvious WHY each origin is trusted, and
// so removing a vendor is a one-line change.
const TURNSTILE = 'https://challenges.cloudflare.com';
const PLAID = 'https://cdn.plaid.com';
const PADDLE_CDN = 'https://cdn.paddle.com';
const PADDLE_BUY = 'https://buy.paddle.com https://sandbox-buy.paddle.com';
const GOOGLE_SIGNIN = 'https://accounts.google.com';
const APPLE_SIGNIN = 'https://appleid.cdn-apple.com https://appleid.apple.com';
const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com';
const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com';

// SHA-256 of every inline <script> we ship, so the CSP can allow exactly
// those and nothing else — no 'unsafe-inline', no nonce plumbing through
// what are otherwise static files.
//
// Regenerate after editing any inline script in client/*.html:
//   node scripts/csp-hashes.js
const INLINE_SCRIPT_HASHES = [
  // The theme bootstrap that runs before paint (all 22 pages).
  "'sha256-mR59x0idOhjPq9cQO1dF3RJ1JNucX4BsdliBrgLrMZM='",
  // application/ld+json structured data — non-executable, but script-src
  // still governs the element.
  "'sha256-Eq/r8cRgwb7nkKuAIvSLEVvbpgu1DbSYGY/Bhg7HOmo='",
  "'sha256-XA5shDCeaVFBEBuJ3uT+QIigT2wA/AcS/KIjYvjZziI='",
  // home.html app-store badge switcher.
  "'sha256-HDaFQ449HYIS93STaGFZa9VrVx2GQCHO0bGOA+3MJgM='",
  // client/public/ — copied verbatim into dist, not Vite-processed. These are
  // the OAuth return pages the Android sign-in flow lands on.
  "'sha256-U4dw3sAvIlexZIlD+ERF5Ec6xL4tXZAVg28V0G/59eQ='",
  "'sha256-L3r+JZUA0GeWfSDQ7c+BwlOACFyw3apTMGbsYIzHScY='",
].join(' ');

function buildCsp() {
  return [
    "default-src 'self'",
    `script-src 'self' ${INLINE_SCRIPT_HASHES} ${TURNSTILE} ${PLAID} ${PADDLE_CDN} ${GOOGLE_SIGNIN} ${APPLE_SIGNIN}`,
    // 'unsafe-inline' is load-bearing for styles: the UI is rendered from
    // HTML strings carrying style="" attributes throughout. Removing it is a
    // real refactor, and style injection is a far smaller prize than script.
    `style-src 'self' 'unsafe-inline' ${GOOGLE_FONTS_CSS}`,
    `font-src 'self' ${GOOGLE_FONTS_FILES} data:`,
    // Issuer logos + user-supplied category icons can be data: URIs or remote.
    "img-src 'self' data: https:",
    `connect-src 'self' ${PLAID} ${PADDLE_CDN} ${PADDLE_BUY} ${GOOGLE_SIGNIN}`,
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
 */
function securityHeaders() {
  const csp = buildCsp();
  const enforce = process.env.CSP_ENFORCE === '1';
  const cspHeader = enforce
    ? 'Content-Security-Policy'
    : 'Content-Security-Policy-Report-Only';
  const isProd = process.env.NODE_ENV === 'production';

  return function applySecurityHeaders(req, res, next) {
    res.setHeader(cspHeader, csp);
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
