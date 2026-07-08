/* ═══════════════════════════════════════════════════════════
   routes/data.js — per-user app data (bills, cards, payments,
   settings).  Mounted at /api/data.
     GET  — return the signed-in user's saved data
     PUT  — replace it (CSRF-protected, state-changing)
═════════════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');

const dbApi = require('../db');
const billing = require('../billing');
const { requireAuth, requireCsrf } = require('../session');

const router = express.Router();

/* ── GET /api/data ───────────────────────────────────────────── */

router.get('/', requireAuth, (req, res) => {
  const data = dbApi.getUserData(req.user.id);
  res.json({
    email: req.user.email,
    bills: data.bills,
    cards: data.cards,
    payments: data.payments,
    accounts: data.accounts,
    goals: data.goals,
    transactions: data.transactions,
    settings: data.settings,
    // Effective Pro entitlement so clients can gate features without a
    // second round-trip. Authoritative copy lives at /api/billing/status.
    entitlement: billing.computeEntitlement(req.user.id),
    // Whether the dev subscription override may be honored. Only the server
    // knows who is an admin, so the client never decides this for itself.
    admin: req.user.role === 'admin',
  });
});

/* ── PUT /api/data ───────────────────────────────────────────── */

router.put('/', requireAuth, requireCsrf, (req, res) => {
  const body = req.body || {};
  // Store a canonical shape — never trust the client's structure.
  const clean = {
    bills: Array.isArray(body.bills) ? body.bills : [],
    cards: Array.isArray(body.cards) ? body.cards : [],
    payments: Array.isArray(body.payments) ? body.payments : [],
    accounts: Array.isArray(body.accounts) ? body.accounts : [],
    goals: Array.isArray(body.goals) ? body.goals : [],
    transactions: Array.isArray(body.transactions) ? body.transactions : [],
    settings:
      body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)
        ? body.settings
        : {},
  };
  dbApi.upsertUserData(req.user.id, clean);
  res.json({ ok: true });
});

module.exports = router;
