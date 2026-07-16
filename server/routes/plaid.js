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
const { mergeTransactions } = require('../plaidMerge');
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
    // A local (db/crypto) failure carries no Plaid response, and its message
    // alone rarely says where it came from — keep the stack for those.
    stack: d.error_code ? undefined : (err && err.stack),
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
// the user enables `settings.plaidUpdateBalances`, update a card's owed
// balance (and credit limit when Plaid reports one) from a freshly-pulled
// Plaid account, but only on an unambiguous last-digits match via
// card.lastDigits (name as fallback — see plaidBalances.js). No-op
// otherwise, so a linked bank assists, never overrides.
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
    lastSyncAt: item.last_sync_at || null,
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

/* Merge a transactionsSync diff into the user's data blob. The merge itself is
   pure and lives in ../plaidMerge; this just wraps it in the database I/O.

   Returns false when nothing was imported because the user hasn't opted in —
   the caller must then leave the sync cursor alone. See plaidMerge.js. */
function mergePlaidTransactions(userId, sync) {
  const data = dbApi.getUserData(userId);
  const { transactions, merged } = mergeTransactions(data.settings, data.transactions, sync);
  if (transactions) {
    data.transactions = transactions;
    dbApi.upsertUserData(userId, data);
  }
  return merged;
}

// How long a synced item stays "fresh". An app-open sync inside this window is a
// no-op, so launching the app repeatedly can't hammer Plaid (or our bill).
const SYNC_TTL_MS = 60 * 60 * 1000;   // 1 hour

/* Pull one item from Plaid: accounts/balances always, transactions only when
   the user has opted in. Shared by link/exchange, refresh, and the webhook so
   all three behave identically.

   The cursor is advanced ONLY when the merge actually happened. Plaid's sync
   cursor is destructive — advancing it past transactions we chose not to import
   would lose them for good, leaving a later opt-in with an empty Spending tab. */
async function syncItem(item, userId) {
  const accessToken = plaid.decryptToken(item.access_token_enc);
  const { accounts } = await plaid.getAccounts(accessToken);
  saveAccounts(item.id, accounts);
  applyPlaidBalances(userId, accounts);

  try {
    const sync = await plaid.syncTransactions(accessToken, item.cursor);
    const merged = mergePlaidTransactions(userId, sync);
    if (merged && sync.cursor && sync.cursor !== item.cursor) {
      dbApi.setPlaidItemCursor(item.id, sync.cursor);
    }
  } catch (_) {
    // Transactions product may be unavailable; balances are still refreshed.
  }

  dbApi.setPlaidItemStatus(item.id, 'active', null);
  dbApi.setPlaidItemSynced(item.id, Date.now());
}

/* Sync every linked item for a user. `force` skips the freshness throttle
   (the Settings "Refresh" button, and the backfill right after opting in).
   Per-item failures are recorded but never fail the whole call. */
async function syncAllItems(userId, { force = false } = {}) {
  const items = dbApi.listPlaidItems(userId);
  const now = Date.now();
  for (const summary of items) {
    if (!force && summary.last_sync_at && now - summary.last_sync_at < SYNC_TTL_MS) continue;
    const item = dbApi.findPlaidItemById(summary.id, userId);
    if (!item) continue;
    try {
      await syncItem(item, userId);
    } catch (err) {
      const code = err?.response?.data?.error_code || err.message;
      dbApi.setPlaidItemStatus(item.id, 'error', String(code));
      logPlaidErr('sync-item', err);
    }
  }
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

  // Phase 1 — talk to Plaid. A failure here is genuinely upstream (502).
  let accessToken;
  let itemId;
  let accounts;
  let institutionId;
  let institutionName;
  try {
    ({ accessToken, itemId } = await plaid.exchangePublicToken(publicToken));

    // Pull accounts + balances now so the UI has something immediately.
    const got = await plaid.getAccounts(accessToken);
    accounts = got.accounts;
    institutionId = (got.item && got.item.institution_id) || meta.institution_id || null;

    const inst = await plaid.getInstitution(institutionId);
    institutionName = (inst && inst.name) || meta.name || 'Bank';
  } catch (err) {
    logPlaidErr('link/exchange', err);
    return sendError(res, 502, 'exchange-failed');
  }

  // Don't store a second Item for a bank+accounts the user already linked.
  const dup = findDuplicateItem(req.user.id, institutionId, accounts);
  if (dup) {
    try { await plaid.removeItem(accessToken); } catch (_) { /* best-effort revoke */ }
    logPlaid('exchange:duplicate', { userId: req.user.id, institutionId, existingItem: dup.id });
    return sendError(res, 409, 'already-linked');
  }

  // Phase 2 — persist locally. Nothing below touches Plaid, so a failure is
  // ours (500), not a bad gateway. Revoke the Item we just created rather than
  // leave an orphan we'd be billed for but have no access token for.
  try {
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

    // Backfill straight away, so a bank that's linked while the user has
    // already opted in shows its history immediately instead of sitting empty
    // until something else happens to trigger a sync. If they haven't opted in
    // yet, this is a no-op that leaves the cursor null — the opt-in prompt's
    // backfill then pulls the full history rather than nothing.
    const fresh = dbApi.findPlaidItemById(itemPk, req.user.id);
    try {
      await syncItem(fresh, req.user.id);
    } catch (err) {
      logPlaidErr('link/exchange:initial-sync', err);   // never fail the link
    }

    const stored = dbApi.findPlaidItemById(itemPk, req.user.id);
    logPlaid('item-linked', { userId: req.user.id, itemPk, institutionId, accounts: accounts.length });
    res.status(201).json({ item: serializeItem(stored) });
  } catch (err) {
    logPlaidErr('link/exchange:persist', err);
    try { await plaid.removeItem(accessToken); } catch (_) { /* best-effort revoke */ }
    sendError(res, 500, 'save-failed');
  }
});

/* ── POST /api/plaid/refresh ─────────────────────────────────── */
// Pull balances + (opted-in) transactions for every linked item.
//
// Clients call this on app open, so it's throttled: an item synced within the
// last hour is skipped. `{force:true}` overrides — used by the Settings
// "Refresh" button and the backfill right after a user opts in.
router.post('/refresh', requireAuth, requireCsrf, requirePlaid, requirePro, async (req, res) => {
  const force = !!(req.body || {}).force;
  await syncAllItems(req.user.id, { force });
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
          await syncItem(item, item.user_id);
        } catch (_) { /* leave status as-is on transient failure */ }
      }
    }
  } catch (err) {
    logPlaidErr('webhook', err);
  }
  res.json({ received: true });
});

module.exports = router;
// Exposed so PUT /api/data can backfill the moment a user opts into bank
// import — the cursor is still null at that point, so this pulls their whole
// history rather than leaving Spending empty until new activity arrives.
module.exports.syncAllItems = syncAllItems;
// Exposed for tests: its return value is what stops the sync cursor advancing
// past transactions we chose not to import.
module.exports.mergePlaidTransactions = mergePlaidTransactions;
