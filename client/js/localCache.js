/* ═══════════════════════════════════════════════════════════
   The localStorage keys that hold a signed-in user's data.

   One list, because there used to be three: storage.svelte.js cached
   seven keys, while the logout and delete-account paths each removed a
   hand-written five. `fh_accounts`, `fh_goals` and `fh_transactions`
   were therefore left behind on sign-out — the previous user's net-worth
   accounts, savings goals and spending stayed in the browser, and
   bootstrapData()'s offline fallback reads exactly those keys, so on a
   shared computer the next person could be shown them.

   Anything session-scoped that lands in localStorage belongs here.
   ═══════════════════════════════════════════════════════════ */

/** Cached copies of the synced dataset (mirrors SYNCED_KEYS in storage). */
export const DATA_CACHE_KEYS = [
  'fh_bills',
  'fh_cards',
  'fh_payments',
  'fh_accounts',
  'fh_goals',
  'fh_transactions',
  'fh_settings',
];

/** Everything to drop when a session ends: the data plus who owned it.
 *
 *  `fh_pending_sync` goes too. It marks edits the server hasn't accepted, and
 *  sign-out drops the cache holding those edits — so keeping the marker would
 *  leave a flag pointing at data that no longer exists, and invite the next
 *  session to push a cache that isn't its own.
 *
 *  So does `fh_sync_base`, the three-way merge's baseline. It is one account's
 *  data, and a merge measured against the wrong account's ancestor would read
 *  every one of the next user's records as a deliberate local deletion. */
export const SESSION_KEYS = DATA_CACHE_KEYS.concat([
  'fh_data_owner', 'fh_pending_sync', 'fh_sync_base',
]);

/** Remove every session-scoped key. Safe when storage is unavailable. */
export function clearSessionCache() {
  SESSION_KEYS.forEach(function (key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      /* private mode / quota — nothing to clear */
    }
  });
}
