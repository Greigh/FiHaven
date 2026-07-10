/* ═══════════════════════════════════════════════════════════
   plaidLink.js — shared helpers for the Plaid Link callbacks.
   Used by settings.js (in-page Link) and plaid-oauth.js (OAuth resume).
═══════════════════════════════════════════════════════════ */

/**
 * sessionStorage key /plaid-oauth uses to hand its outcome back to Settings:
 * `{ outcome: 'linked'|'reconnected'|'error', reason }`. Deliberately not a
 * query param — a `?reason=` would let a crafted link put arbitrary text in
 * FiHaven's own voice on the Settings page.
 */
export const PLAID_OAUTH_RESULT = 'fh_plaid_result';

/**
 * Plaid calls `onExit(err, metadata)` with a null `err` when the user simply
 * closed Link, and a non-null `err` when Link itself failed. Treating the two
 * the same reports real failures as cancellations.
 *
 * @param {object|null|undefined} err The first argument Plaid hands `onExit`.
 * @returns {string|null} A message to show, or null for a plain user close.
 */
export function plaidExitError(err) {
  if (!err) return null;
  return err.display_message
    || err.error_message
    || ('Bank linking failed (' + (err.error_code || 'unknown error') + ').');
}
