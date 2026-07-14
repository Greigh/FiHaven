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

const LISTS = ['bills', 'cards', 'payments', 'accounts', 'goals', 'transactions'];

router.put('/', requireAuth, requireCsrf, (req, res) => {
  const body = req.body || {};
  const current = dbApi.getUserData(req.user.id) || {};

  // Store a canonical shape — never trust the client's structure.
  //
  // An ABSENT key means "leave this list alone"; only a key the client actually
  // sent is written. Coercing a missing key to [] silently destroyed data: the
  // Settings page saves a partial snapshot (bills/cards/payments/settings) when
  // you change the currency, the timezone, or a bank-import toggle, which wiped
  // transactions, net-worth accounts, and savings goals.
  //
  // An explicitly-sent [] still clears the list, so deleting everything works.
  const clean = {};
  for (const key of LISTS) {
    if (Array.isArray(body[key])) clean[key] = body[key];
    else if (Array.isArray(current[key])) clean[key] = current[key];
    else clean[key] = [];
  }
  clean.settings =
    body.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)
      ? body.settings
      : (current.settings || {});

  const before = current.settings || {};
  dbApi.upsertUserData(req.user.id, clean);
  res.json({ ok: true });

  // Opting into bank import is what makes a linked bank actually *do* something.
  // Backfill right here rather than making every client remember to — the sync
  // cursor is still null while the gate is off, so this pulls the full history.
  // Fire-and-forget: the save above already succeeded and must not depend on it.
  backfillOnOptIn(req.user.id, before, clean.settings);
});

const OPT_IN_KEYS = ['plaidUpdatePurchases', 'plaidUpdateBalances'];

function backfillOnOptIn(userId, before, after) {
  const turnedOn = OPT_IN_KEYS.some((k) => !before[k] && after[k]);
  if (!turnedOn) return;
  try {
    const plaidRoutes = require('./plaid');
    if (typeof plaidRoutes.syncAllItems !== 'function') return;
    Promise.resolve(plaidRoutes.syncAllItems(userId, { force: true }))
      .catch((err) => console.error('plaid opt-in backfill failed:', err && err.message));
  } catch (err) {
    console.error('plaid opt-in backfill unavailable:', err && err.message);
  }
}

module.exports = router;
