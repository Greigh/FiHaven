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

/* ═══════════════════════════════════════════════════════════
   Generic per-IP fixed-window limiter — an app-level guard against
   floods / abusive clients (basic anti-DDoS). In-memory + single
   process like the login throttle; for volumetric attacks put a CDN
   / WAF (e.g. Cloudflare) in front. `trust proxy` is set so req.ip is
   the real client IP behind the reverse proxy.
═════════════════════════════════════════════════════════════════ */
function ipRateLimiter({ windowMs, max, name }) {
  const buckets = new Map(); // ip -> { count, windowStart }

  setInterval(() => {
    const now = Date.now();
    for (const [ip, b] of buckets) {
      if (now - b.windowStart > windowMs) buckets.delete(ip);
    }
  }, windowMs).unref();

  return function rateLimitMiddleware(req, res, next) {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b || now - b.windowStart > windowMs) {
      b = { count: 0, windowStart: now };
      buckets.set(ip, b);
    }
    b.count += 1;

    const remaining = Math.max(0, max - b.count);
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(remaining));

    if (b.count > max) {
      const retryAfter = Math.max(1, Math.ceil((b.windowStart + windowMs - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`rate-limit[${name || 'ip'}]: ${ip} blocked (${b.count}/${max})`);
      }
      return res.status(429).json({ error: 'rate-limited', retryAfter });
    }
    return next();
  };
}

module.exports = { check, record, reset, MAX_ATTEMPTS, WINDOW_MS, ipRateLimiter };
