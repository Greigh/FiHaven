/* ═══════════════════════════════════════════════════════════
   routes/admin.js — admin-only user & entitlement management.
   Mounted at /api/admin; every route requires an admin session.
     GET    /users                    — list/search users (+ Pro / suspended)
     POST   /users/:id/role           — set 'admin' | 'user'
     POST   /users/:id/pro            — grant/revoke a comp Pro entitlement
     POST   /users/:id/suspend        — soft-suspend / unsuspend login
     POST   /users/:id/reset-password — email a password-reset link
     POST   /users/:id/logout         — kill all sessions
     POST   /users/:id/delete         — permanently delete (confirm email)
     GET    /promo                    — list active promo codes
     POST   /promo                    — create a free_sub promo code
     POST   /promo/:code/deactivate   — soft-disable a promo code
     GET    /releases                 — current iOS/Android store build numbers
     POST   /releases                 — set iOS build / Android versionCode in repo
═════════════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');

const dbApi = require('../db');
const billing = require('../billing');
const plaid = require('../plaid');
const tokens = require('../tokens');
const emails = require('../emails');
const nativeVersions = require('../../scripts/native-versions');
const { requireAuth, requireAdmin, requireCsrf } = require('../session');

const router = express.Router();

const COMP_PLANS = Object.keys(billing.COMP_DEFAULT_DAYS || {
  trial: 14, monthly: 31, three_month: 92, yearly: 366, family: 366, lifetime: null,
});

function sendError(res, code, error) { return res.status(code).json({ error }); }

// Gate the whole router behind an authenticated admin.
router.use(requireAuth, requireAdmin);

function serializeUser(u) {
  const ent = billing.computeEntitlement(u.id);
  return {
    id: u.id,
    email: u.email,
    name: u.name || null,
    role: u.role,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at || null,
    // Last time their synced app data changed (bills/cards/settings save).
    lastUsedAt: u.data_updated_at || null,
    pro: ent.pro,
    proSource: ent.source,
    proPlan: ent.plan,
    proExpiresAt: ent.expiresAt,
    suspended: !!u.suspended,
    suspendedAt: u.suspended_at || null,
    suspendedReason: u.suspended_reason || null,
  };
}

function serializeReleases() {
  const v = nativeVersions.readVersions();
  return {
    ios: { version: v.ios.version, build: v.ios.build },
    android: { versionName: v.android.versionName, versionCode: v.android.versionCode },
  };
}

/* ── GET /api/admin/users?q=&limit= ──────────────────────────── */
router.get('/users', (req, res) => {
  const q = String(req.query.q || '').slice(0, 100);
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  res.json({ users: dbApi.listUsers(q, limit).map(serializeUser), plans: COMP_PLANS });
});

/* ── POST /api/admin/users/:id/role  { role } ────────────────── */
router.post('/users/:id/role', requireCsrf, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return sendError(res, 400, 'bad-user');
  const role = (req.body || {}).role === 'admin' ? 'admin' : 'user';
  // Block self-demotion so an admin can't accidentally lock everyone out.
  if (id === req.user.id && role !== 'admin') return sendError(res, 400, 'cannot-demote-self');
  if (!dbApi.findUserById(id)) return sendError(res, 404, 'not-found');
  dbApi.setUserRole(id, role);
  res.json({ ok: true, id, role });
});

/* ── POST /api/admin/users/:id/pro  { grant, plan?, days? } ──── */
// Grants/revokes a "comp" Pro entitlement (a non-store subscription row
// computeEntitlement honors). Does not touch real store subscriptions.
//
// body.plan: trial|monthly|three_month|yearly|family|lifetime
// body.days: optional length override (ignored for lifetime; required for trial if you want a custom window)
router.post('/users/:id/pro', requireCsrf, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return sendError(res, 400, 'bad-user');
  if (!dbApi.findUserById(id)) return sendError(res, 404, 'not-found');
  const body = req.body || {};
  if (body.grant) {
    const plan = String(body.plan || 'monthly');
    if (!COMP_PLANS.includes(plan)) return sendError(res, 400, 'bad-plan');
    let days = body.days != null && body.days !== '' ? Number(body.days) : billing.compDefaultDays(plan);
    if (plan === 'lifetime') days = null;
    else if (!Number.isFinite(days) || days <= 0) return sendError(res, 400, 'bad-days');
    const now = Date.now();
    dbApi.upsertSubscription({
      user_id: id,
      platform: 'comp',
      product_id: 'comp:' + plan,
      txn_id: 'comp:' + id,
      status: 'active',
      expires_at: days == null ? null : now + days * 24 * 60 * 60 * 1000,
      environment: 'Admin',
      auto_renew: 0,
      raw: JSON.stringify({
        grantedBy: req.user.email,
        at: now,
        plan,
        days,
      }),
      created_at: now,
      updated_at: now,
    });
  } else {
    dbApi.deleteCompSubscription(id);
  }
  res.json({ ok: true, entitlement: billing.computeEntitlement(id) });
});

/* ── POST /api/admin/users/:id/suspend  { suspend, reason? } ─── */
router.post('/users/:id/suspend', requireCsrf, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return sendError(res, 400, 'bad-user');
  if (id === req.user.id) return sendError(res, 400, 'cannot-suspend-self');
  if (!dbApi.findUserById(id)) return sendError(res, 404, 'not-found');
  const body = req.body || {};
  const suspend = !!body.suspend;
  const reason = String(body.reason || '').slice(0, 500) || null;
  dbApi.setUserSuspended(id, suspend, reason);
  // Leave sessions intact so an already-open client can show the
  // suspended lock screen via /me. Use Force logout to wipe them.
  res.json({ ok: true, suspended: suspend });
});

/* ── POST /api/admin/users/:id/reset-password ───────────────────
   Emails a password-reset link (same token flow as /api/auth/forgot). */
router.post('/users/:id/reset-password', requireCsrf, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return sendError(res, 400, 'bad-user');
  const user = dbApi.findUserById(id);
  if (!user) return sendError(res, 404, 'not-found');
  try {
    const raw = tokens.issue(user.id, 'password-reset');
    await emails.sendPasswordReset(user.email, raw);
    res.json({ ok: true });
  } catch (err) {
    console.error('admin password-reset email failed:', err && err.message);
    sendError(res, 500, 'mail-send-failed');
  }
});

/* ── POST /api/admin/users/:id/logout ────────────────────────── */
router.post('/users/:id/logout', requireCsrf, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return sendError(res, 400, 'bad-user');
  if (!dbApi.findUserById(id)) return sendError(res, 404, 'not-found');
  const n = dbApi.deleteUserSessions(id);
  res.json({ ok: true, sessionsCleared: n });
});

/* ── POST /api/admin/users/:id/delete  { confirmEmail } ──────── */
router.post('/users/:id/delete', requireCsrf, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return sendError(res, 400, 'bad-user');
  if (id === req.user.id) return sendError(res, 400, 'cannot-delete-self');
  const user = dbApi.findUserById(id);
  if (!user) return sendError(res, 404, 'not-found');
  const confirm = String((req.body || {}).confirmEmail || '').trim().toLowerCase();
  if (!confirm || confirm !== String(user.email || '').toLowerCase()) {
    return sendError(res, 400, 'confirm-email-mismatch');
  }

  // Best-effort revoke of linked banks at Plaid before the cascade wipe.
  if (plaid.plaidConfigured && plaid.plaidConfigured()) {
    for (const item of dbApi.listPlaidItems(id) || []) {
      try {
        if (item.access_token_enc) {
          await plaid.removeItem(plaid.decryptToken(item.access_token_enc));
        }
      } catch (_) { /* never unblocked by Plaid */ }
      try { dbApi.deletePlaidItem(item.id, id); } catch (_) { /* cascade will finish */ }
    }
  }

  dbApi.deleteUser(id);
  res.json({ ok: true, deleted: id });
});

/* ── GET /api/admin/promo ─────────────────────────────────────── */
function serializePromo(p) {
  const now = Date.now();
  const expired = !!(p.expires_at && p.expires_at < now);
  const exhausted = p.max_redemptions != null && p.redeemed_count >= p.max_redemptions;
  return {
    code: p.code,
    kind: p.kind,
    grantDays: p.grant_days,
    maxRedemptions: p.max_redemptions,
    redeemedCount: p.redeemed_count || 0,
    expiresAt: p.expires_at || null,
    note: p.note || null,
    createdAt: p.created_at,
    active: !!p.active,
    redeemable: !!p.active && !expired && !exhausted,
    expired,
    exhausted,
  };
}

router.get('/promo', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const rows = (dbApi.listPromoCodes(limit) || []).map(serializePromo);
  // Prefer still-redeemable codes first; keep exhausted/expired visible until deactivated.
  rows.sort((a, b) => Number(b.redeemable) - Number(a.redeemable) || (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ promos: rows });
});

/* ── POST /api/admin/promo  { code?, grantDays, note?, maxRedemptions? } ─ */
// Thin wrapper around billing.createPromoCode so admins can mint free_sub
// codes from the overlay without hitting /api/billing/promo directly.
router.post('/promo', requireCsrf, (req, res) => {
  const body = req.body || {};
  const grantDays = Number(body.grantDays);
  if (!Number.isFinite(grantDays) || grantDays <= 0) return sendError(res, 400, 'bad-days');
  try {
    const code = String(body.code || '').trim()
      || ('FH-' + Math.random().toString(36).slice(2, 8).toUpperCase());
    const promo = billing.createPromoCode({
      code,
      kind: 'free_sub',
      grantDays,
      note: body.note || `Created by ${req.user.email}`,
      maxRedemptions: body.maxRedemptions != null ? Number(body.maxRedemptions) : null,
      expiresAt: body.expiresAt || null,
    });
    res.status(201).json({ ok: true, promo: serializePromo(dbApi.findPromoCode(promo.code) || promo) });
  } catch (err) {
    sendError(res, 400, (err && err.message) || 'promo-failed');
  }
});

/* ── POST /api/admin/promo/:code/deactivate ───────────────────── */
router.post('/promo/:code/deactivate', requireCsrf, (req, res) => {
  const code = String(req.params.code || '').trim();
  if (!code) return sendError(res, 400, 'missing-code');
  const row = dbApi.findPromoCode(code);
  if (!row) return sendError(res, 404, 'not-found');
  dbApi.setPromoActive(code, false);
  res.json({ ok: true, code });
});

/* ── GET /api/admin/releases ────────────────────────────────────
   Current iOS CFBundleVersion / Android versionCode from the repo
   source-of-truth files (project.yml / build.gradle.kts). */
router.get('/releases', (req, res) => {
  try {
    res.json(serializeReleases());
  } catch (err) {
    console.error('admin releases read failed:', err && err.message);
    sendError(res, 500, 'releases-read-failed');
  }
});

/* ── POST /api/admin/releases  { iosBuild?, androidVersionCode? } ─
   Writes the chosen build numbers into the repo. Does not upload to
   TestFlight / Play — run bun run deploy:ios / deploy:android after. */
router.post('/releases', requireCsrf, (req, res) => {
  const body = req.body || {};
  const out = {};
  try {
    if (body.iosBuild != null && body.iosBuild !== '') {
      out.ios = nativeVersions.setIosBuild(body.iosBuild);
    }
    if (body.androidVersionCode != null && body.androidVersionCode !== '') {
      out.android = nativeVersions.setAndroidVersionCode(body.androidVersionCode);
    }
    if (!out.ios && !out.android) return sendError(res, 400, 'nothing-to-set');
    res.json({ ok: true, updated: out, current: serializeReleases() });
  } catch (err) {
    const msg = (err && err.message) || '';
    if (msg.startsWith('bad-build')) return sendError(res, 400, 'bad-build');
    console.error('admin releases write failed:', err && err.message);
    sendError(res, 500, 'releases-write-failed');
  }
});

module.exports = router;
