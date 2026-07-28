/* ═══════════════════════════════════════════════════════════
   pageGate.js — the server-side gate on the private pages
   (/dashboard, /settings, /plaid-oauth). It runs before the static
   handler, so it works with JS disabled and decides who gets the
   page at all. Kept out of index.js so it can be tested without
   booting the app.
═══════════════════════════════════════════════════════════ */

'use strict';

/**
 * @param {string} base  subpath the app is mounted at ('' at a domain root)
 */
function privatePageGate(base) {
  const BASE = base || '';
  return function gate(req, res, next) {
    if (!req.user) {
      // A bare /dashboard from a signed-out visitor is a marketing
      // impression, not a thwarted intent — leave that one on the landing
      // page. A URL carrying a query means someone was sent somewhere
      // specific (the "Manage notification preferences" link in an email
      // lands on /settings?tab=notifications), so hand the target to
      // sign-in and let it finish the trip. The client validates `next`
      // before navigating; the #hash never reaches the server, which is
      // why that link puts the tab in the query too.
      const qs = String(req.originalUrl || '').split('?')[1];
      if (qs) {
        const target = BASE + req.path + '?' + qs;
        return res.redirect(BASE + '/login?next=' + encodeURIComponent(target));
      }
      return res.redirect(BASE + '/');
    }
    if (!req.user.emailVerified) return res.redirect(BASE + '/verify-email');
    // New, verified accounts run the welcome flow first. Only /dashboard
    // forces it — /settings stays reachable so onboarding can deep-link there.
    if (!req.user.onboarded && req.path === '/dashboard') {
      return res.redirect(BASE + '/welcome');
    }
    return next();
  };
}

module.exports = { privatePageGate };
