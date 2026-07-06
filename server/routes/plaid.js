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
const { balanceUpdates, applyBalanceUpdates } = require('../plaidBalances');
const { requireAuth, requireCsrf } = require('../session');

const router = express.Router();

function sendError(res, code, error) {
  return res.status(code).json({ error });
}

/* ── Structured logging ──────────────────────────────────────────
   One-line JSON so Plaid issues are greppable. Crucially, failures log
   Plaid's `request_id` + `error_code`, which Plaid support needs to
   trace a request. */
function logPlaid(event, extra) {
  try { console.log(JSON.stringify({ at: 'plaid', event, ...(extra || {}) })); } catch (_) { /* never throw from logging */ }
}
function logPlaidErr(event, err) {
  const d = (err && err.response && err.response.data) || {};
  logPlaid(event + ':error', {
    message: err && err.message,
    error_code: d.error_code,
    error_type: d.error_type,
    request_id: d.request_id,
  });
}

/* ── Duplicate-item detection ────────────────────────────────────
   A "duplicate" is a new link to a bank the user already connected, with
   the same set of accounts. Plaid bills per Item, so we drop the new one
   and keep the existing connection. Fingerprint = sorted mask:subtype set
   (the stable signal we persist); requires a matching institution_id. */
function plaidAccountFingerprint(accounts) {
  return (accounts || [])
    .map((a) => `${a.mask || ''}:${a.subtype || ''}`)
    .filter((s) => s !== ':')
    .sort()
    .join('|');
}
function storedAccountFingerprint(itemId) {
  return dbApi.listPlaidAccountsByItem(itemId)
    .map((a) => {
      let d = null;
      if (a.enc) { try { d = JSON.parse(plaid.decryptToken(a.enc)); } catch (_) { d = null; } }
      const mask = (d && d.mask) || a.mask || '';
      const subtype = (d && d.subtype) || a.subtype || '';
      return `${mask}:${subtype}`;
    })
    .filter((s) => s !== ':')
    .sort()
    .join('|');
}
// The existing item this institution+accounts duplicates, or null.
function findDuplicateItem(userId, institutionId, accounts) {
  const fp = plaidAccountFingerprint(accounts);
  if (!fp) return null;
  return dbApi.listPlaidItems(userId).find(
    (it) => it.institution_id === institutionId && storedAccountFingerprint(it.id) === fp
  ) || null;
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

// Encrypt/decrypt a single string for at-rest storage, reusing the vetted
// AES-256-GCM helper used for access tokens. decField tolerates legacy
// plaintext (rows written before encryption) by returning it unchanged.
function encField(v) { return v == null ? null : plaid.encryptToken(String(v)); }
function decField(v) {
  if (v == null) return null;
  try { return plaid.decryptToken(v); } catch (_) { return v; }
}

// Persist the accounts + balance snapshot for an item. Every consumer field
// (names, masks, balances) is encrypted at rest as a single AES-256-GCM blob.
function saveAccounts(itemPk, accounts) {
  const now = Date.now();
  for (const a of accounts) {
    const bal = a.balances || {};
    const blob = JSON.stringify({
      name: a.name || null,
      official_name: a.official_name || null,
      mask: a.mask || null,
      type: a.type || null,
      subtype: a.subtype || null,
      current: bal.current ?? null,
      available: bal.available ?? null,
      limit: bal.limit ?? null,
      iso: bal.iso_currency_code || bal.unofficial_currency_code || null,
    });
    dbApi.upsertPlaidAccount({
      item_pk: itemPk,
      account_id: a.account_id,
      enc: plaid.encryptToken(blob),
      updated_at: now,
    });
  }
}

// Opt-in, non-destructive balance sync. By default FiHaven NEVER changes the
// balances the user typed — Plaid balances live only in the bank panel. When
// the user enables `settings.plaidUpdateBalances`, update a card's owed balance
// from a freshly-pulled Plaid account, but only on an unambiguous last-4 match
// (see plaidBalances.js). No-op otherwise, so a linked bank assists, never
// overrides.
function applyPlaidBalances(userId, accounts) {
  try {
    const data = dbApi.getUserData(userId);
    if (!data || !(data.settings && data.settings.plaidUpdateBalances)) return;
    const updates = balanceUpdates(data.cards || [], accounts || []);
    if (!updates.length) return;
    const { cards, changed } = applyBalanceUpdates(data.cards || [], updates);
    if (!changed) return;
    data.cards = cards;
    dbApi.upsertUserData(userId, data);
    logPlaid('balances-applied', { userId, updated: updates.length });
  } catch (e) {
    logPlaid('balances-apply:error', { userId, message: e && e.message });
  }
}

// Shape an item (+ its accounts) for the client. Never leaks the token, and
// decrypts the at-rest consumer fields (with a plaintext fallback for any
// rows written before encryption).
function serializeItem(item) {
  return {
    id: item.id,
    institutionName: decField(item.institution_name) || 'Bank',
    institutionId: item.institution_id || null,
    status: item.status,
    error: item.error || null,
    updatedAt: item.updated_at,
    accounts: dbApi.listPlaidAccountsByItem(item.id).map((a) => {
      let d = null;
      if (a.enc) { try { d = JSON.parse(plaid.decryptToken(a.enc)); } catch (_) { d = null; } }
      if (d) {
        return {
          accountId: a.account_id,
          name: d.name,
          mask: d.mask,
          type: d.type,
          subtype: d.subtype,
          currentBalance: d.current,
          availableBalance: d.available,
          isoCurrency: d.iso,
        };
      }
      return {
        accountId: a.account_id,
        name: a.name,
        mask: a.mask,
        type: a.type,
        subtype: a.subtype,
        currentBalance: a.current_balance,
        availableBalance: a.available_balance,
        isoCurrency: a.iso_currency,
      };
    }),
  };
}

/* ── Transaction persistence (manual-first, additive) ────────────
   FiHaven is manual-entry-first; Plaid transactions are a helper that
   catches what the user missed. Synced transactions are stored in the
   SAME `data.transactions` array the manual entries use, but tagged
   `source: 'plaid'` so they're additive and never collide with or
   overwrite manual rows. Only outflows (spending) are kept. */

// Map a Plaid personal_finance_category onto FiHaven's spend categories.
function mapPlaidCategory(pfc) {
  const primary = (pfc && pfc.primary) || '';
  const detailed = (pfc && pfc.detailed) || '';
  if (detailed.includes('GROCERIES')) return 'Groceries';
  switch (primary) {
    case 'FOOD_AND_DRINK': return 'Dining';
    case 'GENERAL_MERCHANDISE': return 'Shopping';
    case 'TRANSPORTATION': return 'Transport';
    case 'TRAVEL': return 'Transport';
    case 'ENTERTAINMENT': return 'Entertainment';
    case 'MEDICAL':
    case 'PERSONAL_CARE': return 'Health';
    case 'RENT_AND_UTILITIES':
    case 'LOAN_PAYMENTS':
    case 'BANK_FEES': return 'Bills';
    default: return 'Other';
  }
}

// Shape a Plaid transaction like a FiHaven SpendTransaction (+ bank tags).
function toLocalTx(t) {
  return {
    id: 'plaid-' + t.transaction_id,
    date: t.date || '',
    amount: Math.abs(t.amount) || 0,
    category: mapPlaidCategory(t.personal_finance_category),
    merchant: t.merchant_name || t.name || 'Bank transaction',
    note: '',
    source: 'plaid',
    plaidId: t.transaction_id,
    pending: !!t.pending,
  };
}

const MAX_PLAID_TX = 500; // bound stored bank rows; manual rows are never capped

// Merge a transactionsSync diff into the user's data blob. Additive: manual
// rows (no source:'plaid') are left untouched; bank rows are keyed by plaidId.
function mergePlaidTransactions(userId, sync) {
  if (!sync) return;
  const added = sync.added || [];
  const modified = sync.modified || [];
  const removed = sync.removed || [];
  if (!added.length && !modified.length && !removed.length) return;

  const data = dbApi.getUserData(userId);
  // Opt-in: import bank outflows into Spending only when the user turns it on.
  // FiHaven is manual-entry-first; off by default (parallel to plaidUpdateBalances).
  if (!(data.settings && data.settings.plaidUpdatePurchases)) return;
  const all = Array.isArray(data.transactions) ? data.transactions.slice() : [];

  // Index bank rows by plaidId; keep manual rows aside untouched.
  const manual = all.filter((t) => t.source !== 'plaid');
  const bank = new Map();
  all.filter((t) => t.source === 'plaid').forEach((t) => bank.set(t.plaidId || t.id, t));

  removed.forEach((r) => { const id = r.transaction_id || r; bank.delete(id); });
  [...added, ...modified].forEach((t) => {
    if ((t.amount || 0) <= 0) { bank.delete(t.transaction_id); return; } // outflows only
    bank.set(t.transaction_id, toLocalTx(t));
  });

  // Cap bank rows to the most recent MAX_PLAID_TX by date.
  let bankRows = Array.from(bank.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (bankRows.length > MAX_PLAID_TX) bankRows = bankRows.slice(0, MAX_PLAID_TX);

  data.transactions = manual.concat(bankRows);
  dbApi.upsertUserData(userId, data);
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
    // Optional itemId → update-mode token to re-auth an existing item.
    let accessToken = null;
    const itemId = parseInt((req.body || {}).itemId, 10);
    // Update mode with account selection — the NEW_ACCOUNTS_AVAILABLE flow that
    // lets the user add newly-available accounts to an existing Item.
    const accountSelection = !!(req.body || {}).accountSelection;
    if (itemId) {
      const item = dbApi.findPlaidItemById(itemId, req.user.id);
      if (!item) return sendError(res, 404, 'not-found');
      accessToken = plaid.decryptToken(item.access_token_enc);
    }
    const data = await plaid.createLinkToken(req.user, accessToken, { accountSelection });
    res.json({ linkToken: data.link_token, expiration: data.expiration, update: !!accessToken, accountSelection });
  } catch (err) {
    logPlaidErr('link/token', err);
    sendError(res, 502, 'link-token-failed');
  }
});

/* ── POST /api/plaid/item/:id/repaired ───────────────────────── */
// After a successful update-mode Link, mark the item active again (no
// public-token exchange happens in update mode) and refresh its data.
router.post('/item/:id/repaired', requireAuth, requireCsrf, requirePlaid, requirePro, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const item = dbApi.findPlaidItemById(id, req.user.id);
  if (!item) return sendError(res, 404, 'not-found');
  try {
    const accessToken = plaid.decryptToken(item.access_token_enc);
    const { accounts } = await plaid.getAccounts(accessToken);
    saveAccounts(item.id, accounts);
    applyPlaidBalances(req.user.id, accounts);
    try {
      const sync = await plaid.syncTransactions(accessToken, item.cursor);
      mergePlaidTransactions(req.user.id, sync);
      if (sync.cursor && sync.cursor !== item.cursor) dbApi.setPlaidItemCursor(item.id, sync.cursor);
    } catch (_) { /* transactions optional */ }
    dbApi.setPlaidItemStatus(item.id, 'active', null);
  } catch (err) {
    dbApi.setPlaidItemStatus(item.id, 'error', String(err?.response?.data?.error_code || err.message));
  }
  res.json({ item: serializeItem(dbApi.findPlaidItemById(id, req.user.id)) });
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

    // Don't store a second Item for a bank+accounts the user already linked.
    const dup = findDuplicateItem(req.user.id, institutionId, accounts);
    if (dup) {
      try { await plaid.removeItem(accessToken); } catch (_) { /* best-effort revoke */ }
      logPlaid('exchange:duplicate', { userId: req.user.id, institutionId, existingItem: dup.id });
      return sendError(res, 409, 'already-linked');
    }

    const inst = await plaid.getInstitution(institutionId);
    const institutionName = (inst && inst.name) || meta.name || 'Bank';

    const now = Date.now();
    const itemPk = dbApi.insertPlaidItem({
      user_id: req.user.id,
      item_id: itemId,
      access_token_enc: plaid.encryptToken(accessToken),
      institution_id: institutionId,
      institution_name: encField(institutionName),
      status: 'active',
      cursor: null,
      error: null,
      created_at: now,
      updated_at: now,
    });
    saveAccounts(itemPk, accounts);
    applyPlaidBalances(req.user.id, accounts);

    const stored = dbApi.findPlaidItemById(itemPk, req.user.id);
    logPlaid('item-linked', { userId: req.user.id, itemPk, institutionId, accounts: accounts.length });
    res.status(201).json({ item: serializeItem(stored) });
  } catch (err) {
    logPlaidErr('link/exchange', err);
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
      applyPlaidBalances(req.user.id, accounts);
      // Sync transactions and merge them (additively) into the user's data.
      try {
        const sync = await plaid.syncTransactions(accessToken, item.cursor);
        mergePlaidTransactions(req.user.id, sync);
        if (sync.cursor && sync.cursor !== item.cursor) {
          dbApi.setPlaidItemCursor(item.id, sync.cursor);
        }
      } catch (_) { /* transactions product may be unavailable; balances still refreshed */ }
      dbApi.setPlaidItemStatus(item.id, 'active', null);
    } catch (err) {
      const code = err?.response?.data?.error_code || err.message;
      dbApi.setPlaidItemStatus(item.id, 'error', String(code));
      logPlaidErr('refresh-item', err);
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
    logPlaidErr('item/remove', err);
  }
  dbApi.deletePlaidItem(id, req.user.id);
  res.json({ ok: true });
});

/* ── POST /api/plaid/webhook ─────────────────────────────────── */
// Plaid posts item / transactions notifications here. No user auth;
// we resolve the item by item_id. Always 200 so Plaid stops retrying.
// In production the signed `Plaid-Verification` JWT is verified first (see
// plaid.verifyWebhook); sandbox sends no signature so it's skipped there.
router.post('/webhook', async (req, res) => {
  // In production, verify Plaid's signed JWT before trusting the body.
  // Sandbox doesn't sign webhooks, so verification is skipped there.
  if (plaid.plaidEnv() === 'production') {
    const ok = await plaid.verifyWebhook(req.headers['plaid-verification'], req.rawBody);
    if (!ok) return sendError(res, 401, 'bad-signature');
  }
  const body = req.body || {};
  logPlaid('webhook', { type: body.webhook_type, code: body.webhook_code, item_id: body.item_id });
  try {
    const item = body.item_id ? dbApi.findPlaidItemByItemId(body.item_id) : null;
    if (item) {
      const type = body.webhook_type;
      const code = body.webhook_code;
      // Item needs the user to re-auth → flag for the cross-platform update-mode
      // (Reconnect) entry point. PENDING_DISCONNECT is Plaid's heads-up that an
      // Item is about to drop; treat it like ITEM_LOGIN_REQUIRED so the user can
      // repair it before it breaks.
      if (code === 'ITEM_LOGIN_REQUIRED' || code === 'PENDING_EXPIRATION' || code === 'PENDING_DISCONNECT') {
        dbApi.setPlaidItemStatus(item.id, 'login_required', code);
      } else if (code === 'LOGIN_REPAIRED') {
        // Re-auth completed out-of-band → clear the Reconnect prompt.
        dbApi.setPlaidItemStatus(item.id, 'active', null);
      } else if (code === 'NEW_ACCOUNTS_AVAILABLE') {
        // The bank exposed new accounts → flag so the UI can offer an "Add
        // accounts" update-mode flow (account selection). The Item still works,
        // so this is informational, not a hard error.
        dbApi.setPlaidItemStatus(item.id, 'new_accounts', code);
      } else if (type === 'ITEM' && code === 'ERROR') {
        dbApi.setPlaidItemStatus(item.id, 'error', (body.error && body.error.error_code) || 'ERROR');
      } else if (type === 'TRANSACTIONS' || code === 'DEFAULT_UPDATE' || code === 'SYNC_UPDATES_AVAILABLE') {
        // Fresh data available — refresh balances and merge new transactions.
        try {
          const accessToken = plaid.decryptToken(item.access_token_enc);
          const { accounts } = await plaid.getAccounts(accessToken);
          saveAccounts(item.id, accounts);
          applyPlaidBalances(item.user_id, accounts);
          try {
            const sync = await plaid.syncTransactions(accessToken, item.cursor);
            mergePlaidTransactions(item.user_id, sync);
            if (sync.cursor && sync.cursor !== item.cursor) dbApi.setPlaidItemCursor(item.id, sync.cursor);
          } catch (_) { /* transactions product may be unavailable */ }
          dbApi.setPlaidItemStatus(item.id, 'active', null);
        } catch (_) { /* leave status as-is on transient failure */ }
      }
    }
  } catch (err) {
    logPlaidErr('webhook', err);
  }
  res.json({ received: true });
});

module.exports = router;
