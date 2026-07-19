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
    problems.push('PUBLIC_ORIGIN is required in production (Stripe redirects / webhook audiences)');
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

  if (problems.length) {
    const err = new Error(
      'Unsafe production configuration:\n  - ' + problems.join('\n  - ')
    );
    err.code = 'unsafe-production-config';
    throw err;
  }
}

module.exports = { assertProductionSafe, isProduction };
