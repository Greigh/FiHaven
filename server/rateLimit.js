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

const attempts = new Map(); // key -> { count, windowStart }

// { load(), save(key, count, windowStart), remove(key), prune(before) }
let store = null;

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
    if (now - row.window_start > WINDOW_MS) continue;
    attempts.set(row.key, { count: row.count, windowStart: row.window_start });
  }
}

function keyFor(ip, email) {
  return `${ip || '?'}:${email || '?'}`;
}

function freshState() {
  return { count: 0, windowStart: Date.now() };
}

function getState(key) {
  let state = attempts.get(key);
  if (!state || Date.now() - state.windowStart > WINDOW_MS) {
    state = freshState();
    attempts.set(key, state);
  }
  return state;
}

// Returns { allowed, retryAfter } — retryAfter is seconds until the window clears.
function check(ip, email) {
  const state = getState(keyFor(ip, email));
  if (state.count < MAX_ATTEMPTS) return { allowed: true, retryAfter: 0 };
  const retryAfter = Math.ceil(
    (state.windowStart + WINDOW_MS - Date.now()) / 1000
  );
  return { allowed: false, retryAfter: Math.max(retryAfter, 1) };
}

function record(ip, email) {
  const key = keyFor(ip, email);
  const state = getState(key);
  state.count += 1;
  if (store) store.save(key, state.count, state.windowStart);
}

function reset(ip, email) {
  const key = keyFor(ip, email);
  attempts.delete(key);
  if (store) store.remove(key);
}

// Drop stale entries so the map cannot grow unbounded.
function prune() {
  const now = Date.now();
  for (const [key, state] of attempts) {
    if (now - state.windowStart > WINDOW_MS) attempts.delete(key);
  }
  if (store) store.prune(now - WINDOW_MS);
}

setInterval(prune, 60 * 60 * 1000).unref();

// The per-IP flood guard (formerly ipRateLimiter here) now lives in
// index.js, backed by express-rate-limit. This module keeps the
// email-keyed login throttle used by the auth routes.
module.exports = { check, record, reset, prune, attachStore, MAX_ATTEMPTS, WINDOW_MS };
