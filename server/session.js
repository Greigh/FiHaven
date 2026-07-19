/* ═══════════════════════════════════════════════════════════
   session.js — server-side session store on top of SQLite.
   Sessions are opaque random IDs delivered in an HttpOnly cookie;
   the data lives in the `sessions` table so logout is a real
   server-side delete. Also exports the loadSession / requireAuth
   middleware.
═════════════════════════════════════════════════════════════════ */

'use strict';

const crypto = require('crypto');
const dbApi = require('./db');

const SESSION_COOKIE = process.env.SESSION_COOKIE || 'ct_sid';
const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS) || 12;
const TTL_MS = TTL_HOURS * 60 * 60 * 1000;
// Native (token-mode) sessions live far longer than the browser's
// short cookie session: there is no tab to close, and the client
// holds the token in OS secure storage (Keychain / Keystore). The
// client re-authenticates when it eventually gets a 401.
const TOKEN_TTL_DAYS = Number(process.env.TOKEN_TTL_DAYS) || 30;
const TOKEN_TTL_MS = TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

function newId() {
  return crypto.randomBytes(32).toString('base64url');
}

// FiHaven serves at its own domain root, so the session cookie is
// scoped to '/'.
const COOKIE_PATH = '/';

function cookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: TTL_MS,
  };
}

// Resolves a session id from the request. Web clients carry it in
// the HttpOnly cookie; native clients send it as `Authorization:
// Bearer <id>`. The cookie wins if both are present. Returns
// { id, via } or null.
function readSessionId(req) {
  const cookieId = req.cookies && req.cookies[SESSION_COOKIE];
  if (cookieId) return { id: cookieId, via: 'cookie' };
  const auth = (req.get && req.get('authorization')) || '';
  const trimmed = auth.trim();
  // Linear parse (single \s, no quantifier) so a crafted "bearer " header
  // with many spaces can't trigger catastrophic backtracking (ReDoS).
  if (/^bearer\s/i.test(trimmed)) {
    const id = trimmed.slice(6).trim();   // 'Bearer'.length === 6
    if (id) return { id, via: 'bearer' };
  }
  return null;
}

// Creates a session row and returns it (the caller needs csrf_token /
// id for the JSON response body). `opts.mode`:
//   'cookie' (default) — web: set the HttpOnly cookie, short TTL.
//   'token'            — native: no cookie, long TTL; the caller
//                        returns row.id to the client as a Bearer token.
function createSession(res, user, req, opts) {
  const mode = (opts && opts.mode) || 'cookie';
  const now = Date.now();
  const row = {
    id: newId(),
    user_id: user.id,
    csrf_token: newId(),
    created_at: now,
    expires_at: now + (mode === 'token' ? TOKEN_TTL_MS : TTL_MS),
    user_agent: (req.get && req.get('user-agent')) || null,
    ip: req.ip || null,
  };
  dbApi.insertSession(row);
  if (mode !== 'token') res.cookie(SESSION_COOKIE, row.id, cookieOpts());
  return row;
}

function destroySession(req, res) {
  const found = readSessionId(req);
  if (found) dbApi.deleteSession(found.id);
  // Harmless for token clients (they have no cookie to clear).
  res.clearCookie(SESSION_COOKIE, { path: COOKIE_PATH });
}

// Middleware: resolves the cookie / Bearer token into req.user /
// req.session for every request, recording how it arrived in
// req.authVia. Expired sessions are deleted and treated as anon.
function loadSession(req, res, next) {
  const found = readSessionId(req);
  if (found) {
    const row = dbApi.findSession(found.id);
    if (row && row.expires_at > Date.now()) {
      req.session = row;
      req.authVia = found.via;
      req.user = {
        id: row.user_id,
        email: row.email,
        name: row.name || null,
        role: row.role || 'user',
        emailVerified: !!row.email_verified,
        onboarded: !!row.onboarded,
        suspended: !!row.suspended,
        suspendedAt: row.suspended_at || null,
        suspendedReason: row.suspended_reason || null,
      };
    } else if (row) {
      dbApi.deleteSession(found.id);
    }
  }
  next();
}

// Middleware: rejects unauthenticated requests. Exported for use
// on protected data endpoints.
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  // Soft-suspended accounts keep their session cookie but cannot use the app.
  // Admins stay through so they can unsuspend themselves if needed.
  if (req.user.suspended && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'account-suspended',
      reason: req.user.suspendedReason || null,
    });
  }
  next();
}

// Middleware: rejects authenticated-but-unverified users. Applied at
// the data + MFA mounts so the app is unusable until the email is
// confirmed. Anonymous requests get the same 401 as requireAuth, so
// it composes cleanly when used at a router mount.
function requireVerified(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  if (!req.user.emailVerified) return res.status(403).json({ error: 'email-unverified' });
  next();
}

// Middleware: admin-only. Role is set on the user row (seeded from
// ADMIN_EMAILS on boot, then managed via the admin API).
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
  next();
}

// Middleware: FiHaven Pro entitlement required. Lazy-requires billing
// so this module stays free of a hard cycle at load time.
function requirePro(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  const billing = require('./billing');
  const entitlement = billing.computeEntitlement(req.user.id);
  if (!entitlement.pro) return res.status(403).json({ error: 'pro-required' });
  req.entitlement = entitlement;
  next();
}

// Middleware: double-submit CSRF check for state-changing requests.
// The session's csrf_token must be echoed in the X-CSRF-Token header.
// Bearer-token clients are exempt: a CSRF attack relies on the browser
// auto-attaching an ambient credential (the cookie), which never
// happens for an Authorization header the app sets explicitly.
function requireCsrf(req, res, next) {
  if (!req.session) return res.status(401).json({ error: 'unauthenticated' });
  if (req.authVia === 'bearer') return next();
  const supplied = req.get('x-csrf-token');
  if (!supplied || supplied !== req.session.csrf_token) {
    return res.status(403).json({ error: 'bad-csrf-token' });
  }
  next();
}

module.exports = {
  SESSION_COOKIE,
  TTL_HOURS,
  createSession,
  destroySession,
  loadSession,
  requireAuth,
  requireVerified,
  requireAdmin,
  requirePro,
  requireCsrf,
};
