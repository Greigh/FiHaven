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
const mfa = require('./mfa');
const householdEvents = require('./householdEvents');
const { loadSession, requireVerified } = require('./session');
const { assertProductionSafe } = require('./securityConfig');
const { markdownForAgents, agentLinkHeaders } = require('./agentWeb');
const authRouter = require('./routes/auth');
const dataRouter = require('./routes/data');
const accountRouter = require('./routes/account');
const calendarRouter = require('./routes/calendar');
const mfaRouter = require('./routes/mfa');
const billingRouter = require('./routes/billing');
const plaidRouter = require('./routes/plaid');
const adminRouter = require('./routes/admin');
const householdRouter = require('./routes/household');
const pushRouter = require('./routes/push');
const feedbackRouter = require('./routes/feedback');
const unsubscribeRouter = require('./routes/unsubscribe');
const { privatePageGate } = require('./pageGate');
const { securityHeaders } = require('./securityHeaders');
const scheduler = require('./scheduler');
const mail = require('./mail');
const { healthHandler } = require('./health');

/* ── config validation ──────────────────────────────────────── */

try {
  assertProductionSafe();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

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

// Static assets from client/public/ (dev: client/public; prod: dist root).
const PUBLIC_ASSET_DIR =
  process.env.NODE_ENV === 'production'
    ? CLIENT_DIR
    : path.join(CLIENT_DIR, 'public');

/* ── app ────────────────────────────────────────────────────── */

const app = express();
app.set('trust proxy', 1);

// 256kb comfortably holds a full bill/card/payment dataset. Capture the
// raw bytes too so the Paddle webhook can verify its signature.
app.use(express.json({
  limit: '256kb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(cookieParser());
// Before every route so error pages and static assets are covered too.
app.use(securityHeaders());
app.use(loadSession);

// Everything FiHaven serves lives on a sub-app mounted at BASE.
// Routes inside `sub` are written as if at root and get the prefix
// for free; redirects out of it use `${BASE}/...` explicitly.
const sub = express.Router({ mergeParams: true });

// ── Anti-DDoS: per-IP rate limits ───────────────────────────────
// A broad global cap blunts floods across everything; tighter caps
// guard the API and the unauthenticated auth surface. Backed by
// express-rate-limit (in-memory, single process — front with a CDN/WAF
// for volumetric attacks). Disabled under test so the suite isn't throttled.
const { rateLimit } = require('express-rate-limit');
function ipLimiter({ windowMs, limit, name }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: true,
    handler: (req, res) => {
      const reset = req.rateLimit && req.rateLimit.resetTime;
      const retryAfter = reset
        ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000))
        : Math.ceil(windowMs / 1000);
      res.set('Retry-After', String(retryAfter));
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`rate-limit[${name}]: ${req.ip} blocked`);
      }
      res.status(429).json({ error: 'rate-limited', retryAfter });
    },
  });
}
if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_RATE_LIMIT !== '1') {
  sub.use(ipLimiter({ windowMs: 60 * 1000, limit: 600, name: 'global' }));
  sub.use('/api', ipLimiter({ windowMs: 60 * 1000, limit: 240, name: 'api' }));
  sub.use('/api/auth', ipLimiter({ windowMs: 60 * 1000, limit: 40, name: 'auth' }));
  // Unauthenticated and it writes settings — keep the token-guessing
  // surface small (a legitimate opt-out is one or two requests).
  sub.use('/unsubscribe', ipLimiter({ windowMs: 60 * 1000, limit: 30, name: 'unsubscribe' }));
}

// API routes. The data + MFA mounts are gated behind requireVerified:
// an authenticated-but-unverified session gets 403 'email-unverified',
// which makes the dashboard non-functional until the email is confirmed.
// (Billing is left open here because its Paddle webhook is unauthenticated.)
sub.use('/api/auth', authRouter);
sub.use('/api/data', requireVerified, dataRouter);
sub.use('/api/household', requireVerified, householdRouter);
sub.use('/api/push', requireVerified, pushRouter);
sub.use('/api/feedback', requireVerified, feedbackRouter);
sub.use('/api/account', accountRouter);
sub.use('/api/account/mfa', requireVerified, mfaRouter);
sub.use('/api/billing', billingRouter);
sub.use('/api/plaid', plaidRouter);
sub.use('/api/admin', adminRouter);
// Public rewards catalog (used by web ranking; admin edits via /api/admin/card-presets).
sub.get('/api/card-presets', (req, res) => {
  res.json({ presets: dbApi.allCardPresets() });
});
// Public iCal subscription feed; auth is via the token in the URL.
sub.use('/api/calendar', calendarRouter);

// Email opt-out. Public by design — the signed token in the link is the
// only credential, so it works straight from the inbox (and from the
// mail client's own one-click List-Unsubscribe button). Must be mounted
// before the static handler so /unsubscribe isn't served as a bare file.
sub.use('/unsubscribe', unsubscribeRouter(CLIENT_DIR));

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
  '/faq.html':       '/faq',
  '/pricing.html':   '/pricing',
  '/security.html':  '/security',
  '/refunds.html':   '/refunds',
  '/delete-account.html': '/delete-account',
  '/pay.html':       '/pay',
  '/contact.html':   '/contact',
};
sub.get(Object.keys(LEGACY), (req, res) =>
  res.redirect(301, BASE + LEGACY[req.path])
);

// ── Machine-readable web ──────────────────────────────────────
// Point agents at llms.txt / sitemap / api-catalog on the public pages, and
// hand them Markdown instead of our layout when they ask for it. Both are
// scoped to the marketing and legal pages; neither touches /api/ or the
// signed-in app. Mounted after the legacy redirects so /pricing.html has
// already been normalized to /pricing.
sub.use(agentLinkHeaders());
sub.use(markdownForAgents(CLIENT_DIR));

// RFC 9727 API catalog. Extensionless like the Apple association file, so it
// needs an explicit content type — application/linkset+json — before the
// static .well-known mount can guess wrong.
sub.get('/.well-known/api-catalog', (req, res) => {
  res.type('application/linkset+json').sendFile(
    path.join(PUBLIC_ASSET_DIR, '.well-known', 'api-catalog'),
    { dotfiles: 'allow' }
  );
});

// Apple App Site Association (passkeys / universal links). The file has no
// extension, so static serving would mislabel it; Apple requires valid JSON
// over HTTPS. Serve it explicitly with application/json before the static mount.
//
// `dotfiles: 'allow'` is load-bearing, not decoration: res.sendFile refuses any
// path containing a dot-segment by default, and `.well-known` is one — so
// without it this route 500s and takes iOS Universal Links and passkey
// webcredentials down with it. It did, in production, until 2026-08-23. The
// static mount below carries the same option for the same reason.
sub.get('/.well-known/apple-app-site-association', (req, res) => {
  res.type('application/json').sendFile(
    path.join(PUBLIC_ASSET_DIR, '.well-known', 'apple-app-site-association'),
    { dotfiles: 'allow' }
  );
});

// Android OAuth App Link landing (`/oauth/apple|google?code=…`). When App
// Links verification fails (or Custom Tab keeps the navigation), this page
// package-locks an Intent into the Play-signed app. Must be before static.
sub.get(['/oauth/apple', '/oauth/google'], (req, res) => {
  res.type('html').sendFile(path.join(PUBLIC_ASSET_DIR, 'oauth-return.html'));
});

// iOS Plaid Universal Link target (`https://fihaven.app/plaid`). When the
// association opens the app, LinkKit resumes; this page is only a fallback
// if the browser stays put.
sub.get('/plaid', (req, res) => {
  res.type('html').sendFile(path.join(PUBLIC_ASSET_DIR, 'plaid.html'));
});

// RFC 9116 security.txt + assetlinks.json (Android passkeys) — express.static
// ignores dot-directories by default.
sub.use(
  '/.well-known',
  express.static(path.join(PUBLIC_ASSET_DIR, '.well-known'), {
    index: false,
    dotfiles: 'allow',
  })
);

// IndexNow key file (dev fallback when dist/ key file is absent).
if (process.env.INDEXNOW_KEY && /^[a-f0-9]{8,128}$/i.test(process.env.INDEXNOW_KEY)) {
  const indexNowKey = process.env.INDEXNOW_KEY;
  sub.get(`/${indexNowKey}.txt`, (req, res) => {
    res.type('text/plain; charset=utf-8').send(indexNowKey);
  });
}

// Server-side gate for the private pages — works even with JS
// disabled. Anonymous visitors get the marketing landing; signed-in
// but unverified users get the verify-email page until they confirm.
sub.get(['/dashboard', '/settings', '/plaid-oauth'], privatePageGate(BASE));

// The welcome (onboarding) page: signed-in + verified users who haven't
// finished onboarding. Everyone else is bounced to where they belong.
sub.get('/welcome', (req, res, next) => {
  if (!req.user) return res.redirect(BASE + '/login');
  if (!req.user.emailVerified) return res.redirect(BASE + '/verify-email');
  if (req.user.onboarded) return res.redirect(BASE + '/dashboard');
  return next();
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

// Liveness probe — mounted on the root app so deploy/uptime checks are
// not subject to the /api rate-limit tiers on `sub`. It still carries its own
// lenient per-IP limiter so the DB ping can't be turned into a DoS flood
// (CodeQL js/missing-rate-limiting); 120/min is ample for monitors + deploys.
app.get('/health', ipLimiter({ windowMs: 60 * 1000, limit: 120, name: 'health' }), healthHandler(dbApi));

app.use(BASE || '/', sub);

/* ── session housekeeping ───────────────────────────────────── */

/* Back the login throttle with SQLite so failed-attempt counters survive a
   restart. Attached here rather than inside rateLimit.js so that module stays
   database-free and directly unit-testable. */
require('./rateLimit').attachStore({
  load: () => dbApi.allLoginThrottle(),
  save: (key, count, windowStart) => dbApi.upsertLoginThrottle(key, count, windowStart),
  remove: (key) => dbApi.deleteLoginThrottle(key),
  prune: (before) => dbApi.pruneLoginThrottle(before),
});

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
  const { ACTIVE_BCRYPT_COST } = require('./util');
  const hash = bcrypt.hashSync(password, ACTIVE_BCRYPT_COST);
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
  if (emails.length) {
    dbApi.seedAdminEmails(emails);
    // Admins are trusted bootstrap accounts — keep them verified so the
    // required-verification gate can never lock the operator out.
    dbApi.seedVerifiedEmails(emails);
  }
}
ensureAdmins();

// Email reminders + monthly summaries. Off by default in dev so it can
// never send real mail from a laptop; set ENABLE_SCHEDULER=1 to test.
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_SCHEDULER === '1') {
  scheduler.start();
}

app.listen(PORT, () => {
  console.log(`FiHaven server listening on http://localhost:${PORT}`);
  console.log(`database: ${dbApi.DB_PATH}`);
  mfa.warnIfProductionFileKey();
  // Live household sync degrades silently under PM2 cluster mode — see the
  // header of server/householdEvents.js.
  householdEvents.warnIfMultiProcess();
  // Non-fatal SMTP health probe so "emails aren't working" is visible in the
  // boot logs instead of only surfacing as swallowed per-send errors.
  mail.verify()
    .then(() => console.log(`mail: SMTP OK (${process.env.SMTP_HOST || 'localhost'}:${process.env.SMTP_PORT || '25'})`))
    .catch((e) => console.error(
      `mail: SMTP NOT reachable (${process.env.SMTP_HOST || 'localhost'}:${process.env.SMTP_PORT || '25'}) — ${e && e.message}. ` +
      'Run `node scripts/mail-check.js you@example.com` to diagnose.'
    ));
});
