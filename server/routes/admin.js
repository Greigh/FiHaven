/* ═══════════════════════════════════════════════════════════
   routes/admin.js — admin-only user & entitlement management.
   Mounted at /api/admin; every route requires an admin session.
     GET  /users                 — list/search users (+ Pro status)
     POST /users/:id/role        — set 'admin' | 'user'
     POST /users/:id/pro         — grant/revoke a comp Pro entitlement
═════════════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');

const dbApi = require('../db');
const billing = require('../billing');
const { requireAuth, requireAdmin, requireCsrf } = require('../session');

const router = express.Router();

function sendError(res, code, error) { return res.status(code).json({ error }); }

// Gate the whole router behind an authenticated admin.
router.use(requireAuth, requireAdmin);

/* ── GET /api/admin/users?q=&limit= ──────────────────────────── */
router.get('/users', (req, res) => {
  const q = String(req.query.q || '').slice(0, 100);
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const users = dbApi.listUsers(q, limit).map((u) => {
    const ent = billing.computeEntitlement(u.id);
    return {
      id: u.id,
      email: u.email,
      name: u.name || null,
      role: u.role,
      createdAt: u.created_at,
      lastLoginAt: u.last_login_at || null,
      pro: ent.pro,
      proSource: ent.source,
      proExpiresAt: ent.expiresAt,
    };
  });
  res.json({ users });
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

/* ── POST /api/admin/users/:id/pro  { grant, days? } ─────────── */
// Grants/revokes a "comp" Pro entitlement (a non-store subscription row
// computeEntitlement honors). Does not touch real store subscriptions.
router.post('/users/:id/pro', requireCsrf, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return sendError(res, 400, 'bad-user');
  if (!dbApi.findUserById(id)) return sendError(res, 404, 'not-found');
  const body = req.body || {};
  if (body.grant) {
    const days = body.days != null ? Number(body.days) : null;
    const now = Date.now();
    dbApi.upsertSubscription({
      user_id: id,
      platform: 'comp',
      product_id: 'comp',
      txn_id: 'comp:' + id,
      status: 'active',
      expires_at: days && days > 0 ? now + days * 24 * 60 * 60 * 1000 : null,
      environment: 'Admin',
      auto_renew: 0,
      raw: JSON.stringify({ grantedBy: req.user.email, at: now }),
      created_at: now,
      updated_at: now,
    });
  } else {
    dbApi.deleteCompSubscription(id);
  }
  res.json({ ok: true, entitlement: billing.computeEntitlement(id) });
});

module.exports = router;
