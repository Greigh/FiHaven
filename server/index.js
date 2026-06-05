/* ═══════════════════════════════════════════════════════════
   index.js — Express entry point.
   Serves the FiHaven static site and the /api auth endpoints
   as a single deployable unit.
═════════════════════════════════════════════════════════════════ */

'use strict';

/* Env loading order (later calls do NOT overwrite already-set vars,
   so the first match wins per variable):
     1. process.env (already set, e.g. by the deploy environment)
     2. .env.<mode>.local  — host-specific overrides for this mode
     3. .env.local         — host-specific overrides, any mode
     4. .env.<mode>        — committed defaults for this mode
                             (.env.development holds the hCaptcha
                             test keys so `npm run dev` works clean)
     5. .env               — local catch-all
*/
const _mode = process.env.NODE_ENV || 'development';
const _dotenv = require('dotenv');
for (const file of [
  `.env.${_mode}.local`,
  '.env.local',
  `.env.${_mode}`,
  '.env',
]) {
  _dotenv.config({ path: file, quiet: true });
}

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const dbApi = require('./db');
const { loadSession } = require('./session');
const authRouter = require('./routes/auth');
const dataRouter = require('./routes/data');
const accountRouter = require('./routes/account');
const calendarRouter = require('./routes/calendar');
const mfaRouter = require('./routes/mfa');
const billingRouter = require('./routes/billing');
const adminRouter = require('./routes/admin');

/* ── config validation ──────────────────────────────────────── */

for (const key of ['TURNSTILE_SECRET', 'TURNSTILE_SITEKEY']) {
  if (!process.env[key]) {
    console.error(
      `Missing required env var ${key}. Copy .env.example to .env and fill it in.`
    );
    process.exit(1);
  }
}

const PORT = process.env.PORT || 5222;
// Source files live in client/ during dev; production serves the
// Vite build output from dist/.
const CLIENT_DIR =
  process.env.NODE_ENV === 'production'
    ? path.join(__dirname, '..', 'dist')
    : path.join(__dirname, '..', 'client');

// Subpath the whole app lives under. Must match Vite's `base:` in
// vite.config.js and the BASE constant in client/js/base.js.
const BASE = '';  // FiHaven serves at its own domain root (fihaven.app)

/* ── app ────────────────────────────────────────────────────── */

const app = express();
app.set('trust proxy', 1);

// 256kb comfortably holds a full bill/card/payment dataset. Capture the
// raw bytes too so the Stripe webhook can verify its signature.
app.use(express.json({
  limit: '256kb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(cookieParser());
app.use(loadSession);

// Everything FiHaven serves lives on a sub-app mounted at BASE.
// Routes inside `sub` are written as if at root and get the prefix
// for free; redirects out of it use `${BASE}/...` explicitly.
const sub = express.Router({ mergeParams: true });

// API routes.
sub.use('/api/auth', authRouter);
sub.use('/api/data', dataRouter);
sub.use('/api/account', accountRouter);
sub.use('/api/account/mfa', mfaRouter);
sub.use('/api/billing', billingRouter);
sub.use('/api/admin', adminRouter);
// Public iCal subscription feed; auth is via the token in the URL.
sub.use('/api/calendar', calendarRouter);

// Old .html URLs (and the renamed /home) redirect to the clean URL.
const LEGACY = {
  '/index.html':     '/dashboard',
  '/index':          '/dashboard',
  '/dashboard.html': '/dashboard',
  '/account.html':   '/settings',
  '/account':        '/settings',
  '/settings.html':  '/settings',
  '/home':           '/',
  '/home.html':      '/',
  '/login.html':     '/login',
  '/terms.html':     '/terms',
  '/privacy.html':   '/privacy',
};
sub.get(Object.keys(LEGACY), (req, res) =>
  res.redirect(301, BASE + LEGACY[req.path])
);

// Server-side gate for the private pages — works even with JS
// disabled. Anonymous visitors get sent to the marketing landing.
sub.get(['/dashboard', '/settings'], (req, res, next) => {
  if (req.user) return next();
  return res.redirect(BASE + '/');
});

// In production CLIENT_DIR is dist/ (Vite has already merged the
// contents of client/public/ to the root). In dev we serve the
// public/ folder as a secondary static directory so robots.txt,
// sitemap.xml, the web manifest, icon, and OG image are reachable
// at the /fihaven/ prefix.
if (process.env.NODE_ENV !== 'production') {
  sub.use(
    express.static(path.join(CLIENT_DIR, 'public'), {
      index: false,
      dotfiles: 'ignore',
    })
  );
}

// Static site. extensions:['html'] lets /fihaven/home resolve to
// home.html, /fihaven/dashboard to dashboard.html, etc.
sub.use(
  express.static(CLIENT_DIR, {
    extensions: ['html'],
    index: false,
    dotfiles: 'ignore',
  })
);

// Base root IS the marketing landing — no redirect.
sub.get('/', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'home.html')));

// 404 inside the sub-app — JSON for the API, styled 404 page otherwise.
sub.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'not-found' });
  }
  res.status(404).sendFile(path.join(CLIENT_DIR, '404.html'));
});

// 500 inside the sub-app. Express 5 requires four parameters.
// eslint-disable-next-line no-unused-vars
sub.use((err, req, res, next) => {
  console.error('unhandled error:', err);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'server-error' });
  }
  res.status(500).sendFile(path.join(CLIENT_DIR, '500.html'));
});

app.use(BASE || '/', sub);

/* ── session housekeeping ───────────────────────────────────── */

function pruneSessions() {
  const removed = dbApi.deleteExpiredSessions();
  if (removed) console.log(`pruned ${removed} expired session(s)`);
}
pruneSessions();
setInterval(pruneSessions, 60 * 60 * 1000).unref();

/* ── Dev convenience account ─────────────────────────────────
   If DEV_USER_EMAIL + DEV_USER_PASSWORD are set (typically via
   .env.development), seed that user on startup so it can be
   logged into immediately. No-op in production. */
function ensureDevUser() {
  if (process.env.NODE_ENV === 'production') return;
  const email = (process.env.DEV_USER_EMAIL || '').trim().toLowerCase();
  const password = process.env.DEV_USER_PASSWORD;
  if (!email || !password) return;
  if (dbApi.findUserByEmail(email)) return;

  const bcrypt = require('bcrypt');
  const { BCRYPT_COST } = require('./util');
  const hash = bcrypt.hashSync(password, BCRYPT_COST);
  dbApi.createUser(email, hash);
  console.log(`seeded dev user ${email}`);
}
ensureDevUser();

/* ── Seed admin roles from ADMIN_EMAILS ──────────────────────
   Bootstrap path: anyone listed here is promoted to 'admin' on every
   boot, so there's always a way back in even if roles get edited via
   the admin UI. Further admins are then managed in-app. */
function ensureAdmins() {
  const emails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length) dbApi.seedAdminEmails(emails);
}
ensureAdmins();

app.listen(PORT, () => {
  console.log(`FiHaven server listening on http://localhost:${PORT}`);
  console.log(`database: ${dbApi.DB_PATH}`);
});
