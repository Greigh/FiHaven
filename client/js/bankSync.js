/* ═══════════════════════════════════════════════════════════
   bankSync.js — keep a linked bank actually doing something.

   Linking a bank used to be the end of the story: the Item was stored
   server-side and nothing ever pulled from it again unless the user went
   digging for the Refresh button in Settings. This runs a sync when the app
   opens, so imported purchases show up where you'd expect them to.

   The server throttles (an item synced within the last hour is skipped), so
   calling this on every load is cheap — the throttle lives there rather than
   here because every client would otherwise have to reimplement it.
═════════════════════════════════════════════════════════════════ */

import {
  pullFromServer, entitlement, flushLocalWrites, syncBlockedReason,
} from './storage.svelte.js';

function csrf() {
  return (window.AppAuth && window.AppAuth.getCsrfToken && window.AppAuth.getCsrfToken()) || '';
}

/**
 * Sync every linked bank, then adopt the server's copy so any newly imported
 * transactions actually appear. No-op for Free users (the routes are Pro-gated)
 * and for anyone with no bank linked.
 *
 * @param {{force?: boolean}} [opts] force skips the server's freshness throttle.
 * @returns {Promise<boolean>} whether new server data was pulled.
 */
export function syncBanks(opts) {
  const force = !!(opts && opts.force);
  if (!entitlement.pro) return Promise.resolve(false);

  // Push what this device is holding BEFORE asking the server to merge. The
  // refresh reads the stored blob, folds the bank's rows into it and writes
  // the whole thing back, so getting our edits in first is what keeps the
  // merge working from current data. It is no longer load-bearing for safety —
  // pullFromServer reconciles rather than overwrites — but it is still the
  // ordering that produces the fewest conflicts, so it stays.
  //
  // A REJECTED write is the one case worth stopping for: the dataset is already
  // over the server's size cap, and folding a bank's transactions into it would
  // only make the blob that cannot be saved larger.
  return flushLocalWrites()
    .then(() => {
      if (syncBlockedReason() === 'rejected') return null;
      return fetch('/api/plaid/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
        body: JSON.stringify({ force }),
      });
    })
    .then((r) => {
      if (!r) return null;
      // 402 (not Pro) / 404 (Plaid not configured) are ordinary, not errors.
      if (!r.ok) return null;
      return r.json();
    })
    .then((body) => {
      if (!body || !Array.isArray(body.items) || !body.items.length) return false;
      // The sync merged into the server's copy; adopt it or the rows stay unseen.
      // A skipped pull (local edits still unsynced) means nothing was adopted,
      // so the caller has no reason to re-render.
      return pullFromServer().then((server) => !!server);
    })
    .catch(() => false);
}
