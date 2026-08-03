/* ═══════════════════════════════════════════════════════════
   pendingSync.js — the durable half of offline-first saving.

   Sync is whole-blob last-write-wins (`PUT /api/data` replaces the
   snapshot; the server keeps no version or updatedAt), so the outbound
   "queue" is not a list of operations — it is exactly one fact: *this
   device holds edits the server has not accepted yet*. The edits
   themselves already live in the localStorage cache that
   storage.svelte.js maintains, so all that has to survive a browser
   restart is the flag, and who it belongs to.

   Why the owner matters: without it, edits made offline under one
   account would be pushed into whichever account signed in next —
   the same class of bug as a save still retrying across a sign-out.
   A marker is honored only when its owner matches the account that
   just loaded; anything else is discarded unpushed.
═══════════════════════════════════════════════════════════ */

export const PENDING_KEY = 'fh_pending_sync';

/**
 * Record that local edits are not yet on the server.
 * @param {string} owner Account email these edits belong to.
 */
export function markPending(owner) {
  try {
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ owner: owner || '', at: Date.now() })
    );
  } catch (e) {
    /* private mode / quota — we simply lose the durability guarantee */
  }
}

/** Clear the marker. Call only after the server has accepted the write. */
export function clearPending() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch (e) {
    /* ignore */
  }
}

/**
 * The stored marker, or null when there is none / it is unreadable.
 * @returns {{owner: string, at: number}|null}
 */
export function readPending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return { owner: String(parsed.owner || ''), at: Number(parsed.at) || 0 };
  } catch (e) {
    return null;
  }
}

/**
 * Whether this device is holding unsynced edits for `owner`.
 *
 * A marker left by a different account is not just ignored — it is
 * dropped, so it can never be mistaken for the current user's work on
 * some later load.
 *
 * @param {string} owner Account email that just loaded.
 */
export function hasPendingFor(owner) {
  const pending = readPending();
  if (!pending) return false;
  if (pending.owner !== (owner || '')) {
    clearPending();
    return false;
  }
  return true;
}
