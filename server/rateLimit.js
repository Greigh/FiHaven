/* ═══════════════════════════════════════════════════════════
   rateLimit.js — in-memory login throttle keyed by IP + email.
   Mirrors the old client-side constants: 5 attempts / 15 min.
   Single-process only; resets when the server restarts.
═════════════════════════════════════════════════════════════════ */

'use strict';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

const attempts = new Map(); // key -> { count, windowStart }

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
  const state = getState(keyFor(ip, email));
  state.count += 1;
}

function reset(ip, email) {
  attempts.delete(keyFor(ip, email));
}

// Drop stale entries so the map cannot grow unbounded.
function prune() {
  const now = Date.now();
  for (const [key, state] of attempts) {
    if (now - state.windowStart > WINDOW_MS) attempts.delete(key);
  }
}

setInterval(prune, 60 * 60 * 1000).unref();

// The per-IP flood guard (formerly ipRateLimiter here) now lives in
// index.js, backed by express-rate-limit. This module keeps the
// email-keyed login throttle used by the auth routes.
module.exports = { check, record, reset, prune, MAX_ATTEMPTS, WINDOW_MS };
