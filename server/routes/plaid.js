/* ═══════════════════════════════════════════════════════════
   routes/plaid.js — optional, Pro-gated bank linking via Plaid.
   Mounted at /api/plaid.

     GET  /status            — is Plaid available + this user's items
     POST /link/token        — create a Link token (Pro)
     POST /link/exchange     — exchange public_token, store item (Pro)
     POST /refresh           — refresh balances for linked items (Pro)
     POST /item/:id/remove   — disconnect an item (Pro)
     POST /webhook           — Plaid item/transactions webhooks (no auth)

   Manual entry is always the default; everything here is a paid
   convenience overlay, so a dropped connection never breaks the
   core dashboard.
═════════════════════════════════════════════════════════════════ */

'use strict';

const express = require('express');

const dbApi = require('../db');
const plaid = require('../plaid');
const billing = require('../billing');
const { requireAuth, requireCsrf } = require('../session');

const router = express.Router();

function sendError(res, code, error) {
  return res.status(code).json({ error });
}

// Gate: bank linking is a Pro feature. 402 Payment Required lets the
// client show an upgrade prompt rather than a generic error.
function requirePro(req, res, next) {
  if (!billing.computeEntitlement(req.user.id).pro) {
    return sendError(res, 402, 'pro-required');
  }
  next();
}

// Gate: refuse before we ever touch the SDK if no credentials are set.
function requirePlaid(req, res, next) {
  if (!plaid.plaidConfigured()) return sendError(res, 503, 'plaid-not-configured');
  next();
}

/* ── helpers ─────────────────────────────────────────────────── */

// Persist the accounts + balance snapshot for an item.
function saveAccounts(itemPk, accounts) {
  const now = Date.now();
  for (const a of accounts) {
    const bal = a.balances || {};
    dbApi.upsertPlaidAccount({
      item_pk: itemPk,
      account_id: a.account_id,
      name: a.name || null,
      official_name: a.official_name || null,
      mask: a.mask || null,
      type: a.type || null,
      subtype: a.subtype || null,
      current_balance: bal.current ?? null,
      available_balance: bal.available ?? null,
      limit_balance: bal.limit ?? null,
      iso_currency: bal.iso_currency_code || bal.unofficial_currency_code || null,
      updated_at: now,
    });
  }
}

// Shape an item (+ its accounts) for the client. Never leaks the token.
function serializeItem(item) {
  return {
    id: item.id,
    institutionName: item.institution_name || 'Bank',
    institutionId: item.institution_id || null,
    status: item.status,
    error: item.error || null,
    updatedAt: item.updated_at,
    accounts: dbApi.listPlaidAccountsByItem(item.id).map((a) => ({
      accountId: a.account_id,
      name: a.name,
      mask: a.mask,
      type: a.type,
      subtype: a.subtype,
      currentBalance: a.current_balance,
      availableBalance: a.available_balance,
      isoCurrency: a.iso_currency,
    })),
  };
}

/* ── GET /api/plaid/status ───────────────────────────────────── */
// Not Pro-gated: the client needs to know whether to show the
// "Connect a bank" action or the upgrade prompt.
router.get('/status', requireAuth, (req, res) => {
  const pro = billing.computeEntitlement(req.user.id).pro;
  const configured = plaid.plaidConfigured();
  const items = configured && pro
    ? dbApi.listPlaidItems(req.user.id).map(serializeItem)
    : [];
  res.json({ configured, env: plaid.plaidEnv(), pro, items });
});

/* ── POST /api/plaid/link/token ──────────────────────────────── */
router.post('/link/token', requireAuth, requireCsrf, requirePlaid, requirePro, async (req, res) => {
  try {
    const data = await plaid.createLinkToken(req.user);
    res.json({ linkToken: data.link_token, expiration: data.expiration });
  } catch (err) {
    console.error('plaid link/token error:', err.message);
    sendError(res, 502, 'link-token-failed');
  }
});

/* ── POST /api/plaid/link/exchange ───────────────────────────── */
router.post('/link/exchange', requireAuth, requireCsrf, requirePlaid, requirePro, async (req, res) => {
  const publicToken = (req.body || {}).public_token;
  if (!publicToken) return sendError(res, 400, 'missing-public-token');
  // Institution metadata Link hands back (best-effort; refined below).
  const meta = (req.body || {}).institution || {};

  try {
    const { accessToken, itemId } = await plaid.exchangePublicToken(publicToken);

    // Pull accounts + balances now so the UI has something immediately.
    const { item, accounts } = await plaid.getAccounts(accessToken);
    const institutionId = (item && item.institution_id) || meta.institution_id || null;
    const inst = await plaid.getInstitution(institutionId);
    const institutionName = (inst && inst.name) || meta.name || 'Bank';

    const now = Date.now();
    const itemPk = dbApi.insertPlaidItem({
      user_id: req.user.id,
      item_id: itemId,
      access_token_enc: plaid.encryptToken(accessToken),
      institution_id: institutionId,
      institution_name: institutionName,
      status: 'active',
      cursor: null,
      error: null,
      created_at: now,
      updated_at: now,
    });
    saveAccounts(itemPk, accounts);

    const stored = dbApi.findPlaidItemById(itemPk, req.user.id);
    res.status(201).json({ item: serializeItem(stored) });
  } catch (err) {
    console.error('plaid link/exchange error:', err.message);
    sendError(res, 502, 'exchange-failed');
  }
});

/* ── POST /api/plaid/refresh ─────────────────────────────────── */
// Re-pull balances (and advance the transactions cursor) for every
// linked item. Per-item failures are recorded but don't fail the call.
router.post('/refresh', requireAuth, requireCsrf, requirePlaid, requirePro, async (req, res) => {
  const items = dbApi.listPlaidItems(req.user.id);
  for (const summary of items) {
    const item = dbApi.findPlaidItemById(summary.id, req.user.id);
    if (!item) continue;
    try {
      const accessToken = plaid.decryptToken(item.access_token_enc);
      const { accounts } = await plaid.getAccounts(accessToken);
      saveAccounts(item.id, accounts);
      // Advance the transactions cursor (pipeline hook; not persisted yet).
      try {
        const sync = await plaid.syncTransactions(accessToken, item.cursor);
        if (sync.cursor && sync.cursor !== item.cursor) {
          dbApi.setPlaidItemCursor(item.id, sync.cursor);
        }
      } catch (_) { /* transactions product may be unavailable; balances still refreshed */ }
      dbApi.setPlaidItemStatus(item.id, 'active', null);
    } catch (err) {
      const code = err?.response?.data?.error_code || err.message;
      dbApi.setPlaidItemStatus(item.id, 'error', String(code));
    }
  }
  res.json({ items: dbApi.listPlaidItems(req.user.id).map(serializeItem) });
});

/* ── POST /api/plaid/item/:id/remove ─────────────────────────── */
router.post('/item/:id/remove', requireAuth, requireCsrf, requirePlaid, requirePro, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const item = dbApi.findPlaidItemById(id, req.user.id);
  if (!item) return sendError(res, 404, 'not-found');
  // Best-effort revoke at Plaid; we delete locally regardless so the
  // user is never stuck with a row they can't remove.
  try {
    await plaid.removeItem(plaid.decryptToken(item.access_token_enc));
  } catch (err) {
    console.error('plaid item/remove (continuing):', err.message);
  }
  dbApi.deletePlaidItem(id, req.user.id);
  res.json({ ok: true });
});

/* ── POST /api/plaid/webhook ─────────────────────────────────── */
// Plaid posts item / transactions notifications here. No user auth;
// we resolve the item by item_id. Always 200 so Plaid stops retrying.
//
// PRODUCTION: verify the JWT in the `Plaid-Verification` header against
// Plaid's JWKS (/webhook_verification_key/get) before trusting the body.
// In sandbox there's no signature to verify.
router.post('/webhook', async (req, res) => {
  const body = req.body || {};
  try {
    const item = body.item_id ? dbApi.findPlaidItemByItemId(body.item_id) : null;
    if (item) {
      const type = body.webhook_type;
      const code = body.webhook_code;
      if (code === 'ITEM_LOGIN_REQUIRED' || code === 'PENDING_EXPIRATION') {
        dbApi.setPlaidItemStatus(item.id, 'login_required', code);
      } else if (type === 'ITEM' && code === 'ERROR') {
        dbApi.setPlaidItemStatus(item.id, 'error', (body.error && body.error.error_code) || 'ERROR');
      } else if (type === 'TRANSACTIONS' || code === 'DEFAULT_UPDATE' || code === 'SYNC_UPDATES_AVAILABLE') {
        // Fresh data available — refresh balances opportunistically.
        try {
          const accessToken = plaid.decryptToken(item.access_token_enc);
          const { accounts } = await plaid.getAccounts(accessToken);
          saveAccounts(item.id, accounts);
          dbApi.setPlaidItemStatus(item.id, 'active', null);
        } catch (_) { /* leave status as-is on transient failure */ }
      }
    }
  } catch (err) {
    console.error('plaid webhook error:', err.message);
  }
  res.json({ received: true });
});

module.exports = router;
