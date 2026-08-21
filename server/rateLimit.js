/* ═══════════════════════════════════════════════════════════
   rateLimit.js — login throttle keyed by IP + email.
   Mirrors the old client-side constants: 5 attempts / 15 min.

   The live counters are an in-memory Map (the lookup is on the hot
   path of every login). A durable store may be attached at boot via
   attachStore() — see index.js — so the counters survive a restart;
   without one the module behaves exactly as it always did, which is
   what keeps it unit-testable with no database.
═════════════════════════════════════════════════════════════════ */

'use strict';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

/* A second budget, keyed on the ACCOUNT alone.
   The pair counter above includes the source IP, so credential stuffing that
   rotates addresses never exhausts it — every new IP starts again at 5, and a
   single account can be guessed at indefinitely. This one ignores the IP.

   Deliberately generous, because a per-account counter is also a lockout
   primitive: anyone can burn a known address's budget on purpose. 50/hour is
   far above what a real person retyping a password reaches, and far below what
   a brute force needs. It is scoped to the login path only (see
   checkAccount's callers) — putting it on the mail-sending endpoints would let
   that same burn block the victim's password reset, which is the one thing
   they need most when someone is attacking their account. */
const ACCOUNT_MAX_ATTEMPTS = 50;
const ACCOUNT_WINDOW_MS = 60 * 60 * 1000;

// Account keys are namespaced so both budgets can share one map and one
// durable table while keeping their own window lengths.
const ACCOUNT_PREFIX = 'acct:';

const attempts = new Map(); // key -> { count, windowStart, windowMs }

// { load(), save(key, count, windowStart), remove(key), prune(before) }
let store = null;

// How long a key's window runs — derived from the key so a row replayed from
// the store lands on the right one without needing an extra column.
function windowFor(key) {
  return String(key).startsWith(ACCOUNT_PREFIX) ? ACCOUNT_WINDOW_MS : WINDOW_MS;
}

function limitFor(key) {
  return String(key).startsWith(ACCOUNT_PREFIX) ? ACCOUNT_MAX_ATTEMPTS : MAX_ATTEMPTS;
}

/**
 * Attach durable backing and replay whatever it holds. Called once at boot.
 * A throttle that resets on restart is a throttle an attacker can clear by
 * getting the process to bounce.
 */
function attachStore(next) {
  store = next;
  if (!store) return;
  const now = Date.now();
  for (const row of store.load()) {
    // Skip windows that already elapsed while we were down.
    if (now - row.window_start > windowFor(row.key)) continue;
    attempts.set(row.key, {
      count: row.count,
      windowStart: row.window_start,
      windowMs: windowFor(row.key),
    });
  }
}

function keyFor(ip, email) {
  return `${ip || '?'}:${email || '?'}`;
}

function accountKeyFor(email) {
  return `${ACCOUNT_PREFIX}${email || '?'}`;
}

function freshState(windowMs) {
  return { count: 0, windowStart: Date.now(), windowMs };
}

function getState(key) {
  const windowMs = windowFor(key);
  let state = attempts.get(key);
  if (!state || Date.now() - state.windowStart > windowMs) {
    state = freshState(windowMs);
    attempts.set(key, state);
  }
  return state;
}

// Shared body of check/record/reset, so both budgets behave identically.
function checkKey(key) {
  const state = getState(key);
  if (state.count < limitFor(key)) return { allowed: true, retryAfter: 0 };
  const retryAfter = Math.ceil(
    (state.windowStart + state.windowMs - Date.now()) / 1000
  );
  return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
}

function recordKey(key) {
  const state = getState(key);
  state.count += 1;
  if (store) store.save(key, state.count, state.windowStart);
}

function resetKey(key) {
  attempts.delete(key);
  if (store) store.remove(key);
}

// Returns { allowed, retryAfter } — retryAfter is seconds until the window clears.
function check(ip, email) { return checkKey(keyFor(ip, email)); }

function record(ip, email) { recordKey(keyFor(ip, email)); }

function reset(ip, email) { resetKey(keyFor(ip, email)); }

/* The account-wide budget. Same shape as the trio above, minus the IP.
   Only the login path spends from it — see the note on ACCOUNT_MAX_ATTEMPTS. */
function checkAccount(email) { return checkKey(accountKeyFor(email)); }

function recordAccount(email) { recordKey(accountKeyFor(email)); }

function resetAccount(email) { resetKey(accountKeyFor(email)); }

// Drop stale entries so the map cannot grow unbounded. Each entry is measured
// against its own window, so the hour-long account counters are not swept
// early by the 15-minute one.
function prune() {
  const now = Date.now();
  for (const [key, state] of attempts) {
    if (now - state.windowStart > state.windowMs) attempts.delete(key);
  }
  // The store is pruned at the longest window; anything shorter is already
  // ignored on replay by attachStore.
  if (store) store.prune(now - Math.max(WINDOW_MS, ACCOUNT_WINDOW_MS));
}

setInterval(prune, 60 * 60 * 1000).unref();

// The per-IP flood guard (formerly ipRateLimiter here) now lives in
// index.js, backed by express-rate-limit. This module keeps the
// email-keyed login throttle used by the auth routes.
module.exports = {
  check, record, reset,
  checkAccount, recordAccount, resetAccount,
  prune, attachStore,
  MAX_ATTEMPTS, WINDOW_MS,
  ACCOUNT_MAX_ATTEMPTS, ACCOUNT_WINDOW_MS,
};
