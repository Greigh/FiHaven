/* ═══════════════════════════════════════════════════════════
   securityConfig.js — fail closed on dangerous production
   misconfiguration (dev-trust modes, missing PUBLIC_ORIGIN).
═════════════════════════════════════════════════════════════════ */

'use strict';

function isProduction() {
  return process.env.NODE_ENV === 'production';
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

  // Sandbox transactions carry the production signing chain, so this is a
  // deliberate, temporary hole for App Review — never a standing setting.
  if (process.env.APPLE_ALLOW_SANDBOX === '1') {
    console.warn(
      '[security] APPLE_ALLOW_SANDBOX=1 — sandbox StoreKit transactions will grant real Pro. ' +
        'Set this only while a build is in App Review, and unset it afterwards.'
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
