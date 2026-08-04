/* ═══════════════════════════════════════════════════════════
   securityConfig.js — fail closed on dangerous production
   misconfiguration (dev-trust modes, missing PUBLIC_ORIGIN).
═════════════════════════════════════════════════════════════════ */

'use strict';

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Log the state of a dated "open for App Review" window at boot.
 *
 * Both stores get identical treatment because both mistakes are identical:
 * a hole you opened for review and never closed looks exactly like a working
 * system. Silence here means it is shut.
 */
function reportReviewWindow(name, what) {
  const raw = String(process.env[name] || '').trim();
  if (!raw || raw === '0') return;

  // Required lazily — billing pulls in the database, and this runs before
  // the app has decided it is safe to start.
  const billing = require('./billing');
  const open = name === 'APPLE_ALLOW_SANDBOX'
    ? billing.sandboxAllowed()
    : billing.testPurchasesAllowed();
  const expires = name === 'APPLE_ALLOW_SANDBOX'
    ? billing.sandboxExpiresAt()
    : billing.testPurchasesExpireAt();

  if (raw === '1') {
    console.warn(
      `[security] ${name}=1 — ${what} grant real Pro, with NO expiry. ` +
        'Prefer a dated window: deploy with `--allow-sandbox` so it closes itself.'
    );
  } else if (!open) {
    console.log(
      `[security] ${name} window closed ${expires ? new Date(expires).toISOString() : ''}` +
        ` — ${what} are being rejected again. Safe to remove the var.`
    );
  } else {
    const daysLeft = Math.max(0, Math.ceil((expires - Date.now()) / 86400000));
    console.warn(
      `[security] ${name} open until ${new Date(expires).toISOString()} ` +
        `(${daysLeft} day${daysLeft === 1 ? '' : 's'} left) — ${what} grant real Pro ` +
        'until then, after which they are rejected automatically.'
    );
  }
}

/**
 * Validate env before accepting traffic. Throws Error with a
 * human-readable message (caller should log + exit).
 */
function assertProductionSafe() {
  if (!isProduction()) return;

  const problems = [];

  const origin = String(process.env.PUBLIC_ORIGIN || '').trim();
  if (!origin) {
    problems.push('PUBLIC_ORIGIN is required in production (checkout redirects / webhook audiences)');
  } else if (!/^https:\/\//i.test(origin)) {
    problems.push('PUBLIC_ORIGIN must be an https:// URL in production');
  }

  const iapMode = process.env.IAP_VERIFY_MODE || 'production';
  if (iapMode === 'dev-trust') {
    problems.push('IAP_VERIFY_MODE=dev-trust is forbidden in production');
  }

  const oauthMode = process.env.OAUTH_VERIFY_MODE || 'production';
  if (oauthMode === 'dev-trust') {
    problems.push('OAUTH_VERIFY_MODE=dev-trust is forbidden in production');
  }

  if (process.env.DISABLE_RATE_LIMIT === '1') {
    problems.push('DISABLE_RATE_LIMIT=1 is forbidden in production');
  }

  // A valid Apple signature proves only that Apple issued the transaction, not
  // that it belongs to THIS app. Without a bundle id to pin against, a signed
  // receipt from any other App Store app grants Pro here.
  if (process.env.APPLE_VERIFY_ENABLED && !String(process.env.APPLE_BUNDLE_ID || '').trim()) {
    problems.push('APPLE_BUNDLE_ID is required when APPLE_VERIFY_ENABLED=1 (receipts must be pinned to this app)');
  }

  // Test/sandbox store transactions carry the same signing chain and API shape
  // as real ones, so these are deliberate, temporary holes for App Review —
  // never standing settings. A dated window closes itself; a bare "1" does not,
  // and says so loudly.
  reportReviewWindow('APPLE_ALLOW_SANDBOX', 'sandbox StoreKit transactions');
  reportReviewWindow('GOOGLE_ALLOW_TEST_PURCHASES', 'Play license-tester purchases');

  // Not a hole that needs closing: the pin narrows on its own with each
  // release, since the next deploy stamps the next build.
  const pinned = String(process.env.APPLE_SANDBOX_BUILD || '').trim();
  if (pinned) {
    console.log(
      `[security] APPLE_SANDBOX_BUILD=${pinned} — sandbox StoreKit transactions are accepted ` +
        'only from an app transaction naming this build or a newer one.'
    );
  }

  // Play RTDN audience: googlePubSubAuth fails closed without one, which would
  // silently drop every renewal/expiry notification. Catch it at boot instead.
  if (
    process.env.GOOGLE_VERIFY_ENABLED &&
    !String(process.env.GOOGLE_PUBSUB_AUDIENCE || '').trim() &&
    !origin
  ) {
    problems.push('GOOGLE_PUBSUB_AUDIENCE or PUBLIC_ORIGIN is required when GOOGLE_VERIFY_ENABLED=1');
  }

  if (problems.length) {
    const err = new Error(
      'Unsafe production configuration:\n  - ' + problems.join('\n  - ')
    );
    err.code = 'unsafe-production-config';
    throw err;
  }
}

module.exports = { assertProductionSafe, isProduction };
