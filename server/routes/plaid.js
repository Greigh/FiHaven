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
const {
  balanceProposals, matchCardToAccount, cardOptedOut,
  accountBalanceProposals, matchAccountToPlaid, accountOptedOut, isAssetAccount,
} = require('../plaidBalances');
const { mergeTransactions } = require('../plaidMerge');
const { requireAuth, requireVerified, requireCsrf } = require('../session');

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

/* Whether POST /webhook must carry a valid Plaid-Verification JWT.
   Exported for tests and for the boot-time warning in securityConfig. */
function webhookSignatureRequired() {
  // Real bank data — never negotiable, opt-out or not.
  if (plaid.plaidEnv() === 'production') return true;
  if (process.env.PLAID_ALLOW_UNSIGNED_WEBHOOKS === '1') return false;
  // A deployed server is reachable even when it is talking to sandbox.
  return process.env.NODE_ENV === 'production';
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
  // Forget accounts this item no longer reports. A de-selected or closed
  // account would otherwise keep its last-seen balance and go on proposing it.
  dbApi.prunePlaidAccounts(itemPk, accounts.map((a) => a.account_id));
}

// The decrypted, Plaid-shaped form of a stored plaid_accounts row, so matching
// code can treat what we cached exactly like a fresh API response. Falls back to
// the legacy plaintext columns for rows written before the enc blob existed.
function storedAccount(a) {
  let d = null;
  if (a.enc) { try { d = JSON.parse(plaid.decryptToken(a.enc)); } catch (_) { d = null; } }
  if (!d) {
    d = {
      name: a.name, official_name: a.official_name, mask: a.mask,
      type: a.type, subtype: a.subtype,
      current: a.current_balance, available: a.available_balance,
      limit: a.limit_balance, iso: a.iso_currency,
    };
  }
  return {
    account_id: a.account_id,
    name: d.name,
    official_name: d.official_name,
    mask: d.mask,
    type: d.type,
    subtype: d.subtype,
    balances: { current: d.current, available: d.available, limit: d.limit },
    iso: d.iso,
  };
}

// Every linked account the user still has, grouped by bank, plus the flat set
// of their ids. A card pinned to an id that isn't in that set is pinned to a
// bank they disconnected (or relinked, which mints new ids).
function linkedAccounts(userId) {
  const byItem = dbApi.listPlaidItems(userId).map((item) => ({
    institutionName: decField(item.institution_name) || '',
    accounts: dbApi.listPlaidAccountsByItem(item.id).map(storedAccount),
  }));
  const knownAccountIds = new Set(
    byItem.flatMap((it) => it.accounts.map((a) => String(a.account_id)))
  );
  return { byItem, knownAccountIds };
}

/* Write a confident match down on the card as `plaidAccountId`.

   Matching by digits or issuer+name already ran on every sync, but it was
   ephemeral, and only a *pinned* card is any use downstream: spending
   attribution resolves a bank charge to a card by account id alone
   (cardForTransaction), so an auto-matched card showed balance proposals while
   its purchases stayed unattributed. A pin is also the only form of the match
   the user can see — and correct — in the card editor.

   An explicit pin the user made always wins; "Match automatically" now means
   "match me and remember it". A pin to an account that no longer exists is
   repaired here rather than left to block the card forever. */
function autoLinkCards(userId) {
  try {
    const data = dbApi.getUserData(userId);
    if (!data || !Array.isArray(data.cards) || !data.cards.length) return;
    const { byItem, knownAccountIds } = linkedAccounts(userId);
    // Same objects as data.cards, so pinning one is visible to the next pass:
    // a card claimed at bank A can't also be claimed at bank B.
    const cards = data.cards.filter((c) => c && !c.archived);
    let linked = 0;
    for (const { institutionName, accounts } of byItem) {
      for (const a of accounts) {
        const type = String(a.type || '').toLowerCase();
        if (type !== 'credit' && type !== 'loan') continue;
        const card = matchCardToAccount(cards, a, institutionName, knownAccountIds);
        // No match, already pinned here, or the user said don't — nothing to
        // write. (matchCardToAccount already withholds an opted-out card; the
        // guard is here too so this can never be the thing that overrides a no.)
        if (!card || cardOptedOut(card)) continue;
        if (String(card.plaidAccountId || '') === String(a.account_id)) continue;
        card.plaidAccountId = String(a.account_id);
        linked += 1;
      }
    }
    if (!linked) return;
    dbApi.upsertUserData(userId, data);
    logPlaid('cards-auto-linked', { userId, linked });
  } catch (e) {
    logPlaid('cards-auto-link:error', { userId, message: e && e.message });
  }
}

/* The Balances-tab counterpart to autoLinkCards: pin a confident match onto
   `account.plaidAccountId` so the Balances tab can show which bank account a
   row is following, and so the pin (not a re-guess) drives later syncs. */
function autoLinkAssetAccounts(userId) {
  try {
    const data = dbApi.getUserData(userId);
    if (!data || !Array.isArray(data.accounts) || !data.accounts.length) return;
    const { byItem, knownAccountIds } = linkedAccounts(userId);
    const accts = data.accounts.filter(Boolean);
    let linked = 0;
    for (const { institutionName, accounts } of byItem) {
      for (const a of accounts) {
        if (!isAssetAccount(a)) continue;
        const acct = matchAccountToPlaid(accts, a, institutionName, knownAccountIds);
        if (!acct || accountOptedOut(acct)) continue;
        if (String(acct.plaidAccountId || '') === String(a.account_id)) continue;
        acct.plaidAccountId = String(a.account_id);
        linked += 1;
      }
    }
    if (!linked) return;
    dbApi.upsertUserData(userId, data);
    logPlaid('accounts-auto-linked', { userId, linked });
  } catch (e) {
    logPlaid('accounts-auto-link:error', { userId, message: e && e.message });
  }
}

// Opt-in balance *suggestions*. By default FiHaven NEVER changes the balances
// the user typed — Plaid balances live only in the bank panel. When the user
// enables `settings.plaidUpdateBalances`, sync stores proposals for Current
// Balance (never Statement Balance). The client Accepts/Declines; resolved
// fingerprints are not re-proposed until the bank figure changes.
//
// The queue is rebuilt from EVERY linked bank, not just the one that happened to
// sync: the list is a single settings key, so proposing per item used to leave
// only the last-synced bank's cards with an Accept button. Reading the accounts
// back out of the DB is equivalent to using the just-fetched ones — saveAccounts
// runs first — and it costs nothing to include the banks that were throttled.
function refreshBalanceProposals(userId) {
  try {
    const data = dbApi.getUserData(userId);
    if (!data) return;
    if (!(data.settings && data.settings.plaidUpdateBalances)) {
      const hasCard = data.settings && Array.isArray(data.settings.plaidBalanceProposals)
        && data.settings.plaidBalanceProposals.length;
      const hasAcct = data.settings && Array.isArray(data.settings.plaidAccountProposals)
        && data.settings.plaidAccountProposals.length;
      if (hasCard || hasAcct) {
        data.settings.plaidBalanceProposals = [];
        data.settings.plaidAccountProposals = [];
        dbApi.upsertUserData(userId, data);
      }
      return;
    }
    if (!data.settings || typeof data.settings !== 'object') data.settings = {};
    const resolved = Array.isArray(data.settings.plaidBalanceResolved)
      ? data.settings.plaidBalanceResolved.map((r) => (r && r.fingerprint) || r).filter(Boolean)
      : [];
    const cards = data.cards || [];
    const { byItem, knownAccountIds } = linkedAccounts(userId);
    const proposals = [];
    const claimed = new Set();   // one proposal per card, first bank wins
    for (const { institutionName, accounts } of byItem) {
      balanceProposals(cards, accounts, resolved, { institutionName, knownAccountIds }).forEach((p) => {
        const key = String(p.id);
        if (claimed.has(key)) return;
        claimed.add(key);
        proposals.push(p);
      });
    }
    // Asset accounts (the Balances tab) run the same queue against
    // data.accounts, kept under its own settings key so a client that only
    // knows about card proposals never sees a proposal naming a row it can't
    // find — and quietly declines it.
    const acctProposals = [];
    const claimedAccts = new Set();
    for (const { institutionName, accounts } of byItem) {
      accountBalanceProposals(data.accounts || [], accounts, resolved,
        { institutionName, knownAccountIds }).forEach((p) => {
        const key = String(p.id);
        if (claimedAccts.has(key)) return;
        claimedAccts.add(key);
        acctProposals.push(p);
      });
    }

    const prev = JSON.stringify(data.settings.plaidBalanceProposals || []);
    const next = JSON.stringify(proposals);
    const prevAcct = JSON.stringify(data.settings.plaidAccountProposals || []);
    const nextAcct = JSON.stringify(acctProposals);
    if (prev === next && prevAcct === nextAcct) return;
    data.settings.plaidBalanceProposals = proposals;
    data.settings.plaidAccountProposals = acctProposals;
    dbApi.upsertUserData(userId, data);
    logPlaid('balances-proposed', {
      userId, proposed: proposals.length, accountsProposed: acctProposals.length,
    });
  } catch (e) {
    logPlaid('balances-propose:error', { userId, message: e && e.message });
  }
}

// Everything that has to happen once an item's accounts are on disk. Pinning
// runs first: proposals are built from the cards it just linked.
function afterAccountsSaved(userId) {
  autoLinkCards(userId);
  autoLinkAssetAccounts(userId);
  refreshBalanceProposals(userId);
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
    accounts: dbApi.listPlaidAccountsByItem(item.id).map((row) => {
      const a = storedAccount(row);
      return {
        accountId: a.account_id,
        name: a.name,
        mask: a.mask,
        type: a.type,
        subtype: a.subtype,
        currentBalance: a.balances.current,
        availableBalance: a.balances.available,
        isoCurrency: a.iso,
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
  afterAccountsSaved(userId);

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
router.get('/status', requireAuth, requireVerified, (req, res) => {
  const pro = billing.computeEntitlement(req.user.id).pro;
  const configured = plaid.plaidConfigured();
  const items = configured && pro
    ? dbApi.listPlaidItems(req.user.id).map(serializeItem)
    : [];
  res.json({ configured, env: plaid.plaidEnv(), pro, items });
});

/* ── POST /api/plaid/link/token ──────────────────────────────── */
router.post('/link/token', requireAuth, requireVerified, requireCsrf, requirePlaid, requirePro, async (req, res) => {
  try {
    // Optional itemId → update-mode token to re-auth an existing item.
    let accessToken = null;
    const itemId = parseInt((req.body || {}).itemId, 10);
    // Update mode with account selection — the NEW_ACCOUNTS_AVAILABLE flow that
    // lets the user add newly-available accounts to an existing Item.
    const accountSelection = !!(req.body || {}).accountSelection;
    const platform = String((req.body || {}).platform || 'web').toLowerCase();
    if (itemId) {
      const item = dbApi.findPlaidItemById(itemId, req.user.id);
      if (!item) return sendError(res, 404, 'not-found');
      accessToken = plaid.decryptToken(item.access_token_enc);
    }
    const data = await plaid.createLinkToken(req.user, accessToken, { accountSelection, platform });
    res.json({ linkToken: data.link_token, expiration: data.expiration, update: !!accessToken, accountSelection });
  } catch (err) {
    logPlaidErr('link/token', err);
    sendError(res, 502, 'link-token-failed');
  }
});

/* ── POST /api/plaid/item/:id/repaired ───────────────────────── */
// After a successful update-mode Link, mark the item active again (no
// public-token exchange happens in update mode) and refresh its data.
router.post('/item/:id/repaired', requireAuth, requireVerified, requireCsrf, requirePlaid, requirePro, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const item = dbApi.findPlaidItemById(id, req.user.id);
  if (!item) return sendError(res, 404, 'not-found');
  try {
    const accessToken = plaid.decryptToken(item.access_token_enc);
    const { accounts } = await plaid.getAccounts(accessToken);
    saveAccounts(item.id, accounts);
    afterAccountsSaved(req.user.id);
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
router.post('/link/exchange', requireAuth, requireVerified, requireCsrf, requirePlaid, requirePro, async (req, res) => {
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
    afterAccountsSaved(req.user.id);

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
router.post('/refresh', requireAuth, requireVerified, requireCsrf, requirePlaid, requirePro, async (req, res) => {
  const force = !!(req.body || {}).force;
  await syncAllItems(req.user.id, { force });
  res.json({ items: dbApi.listPlaidItems(req.user.id).map(serializeItem) });
});

/* ── POST /api/plaid/item/:id/remove ─────────────────────────── */
router.post('/item/:id/remove', requireAuth, requireVerified, requireCsrf, requirePlaid, requirePro, async (req, res) => {
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
  /* Verify Plaid's signed JWT before trusting the body.
     Gating this on plaidEnv() alone was too narrow: a deployed server pointed
     at Plaid sandbox is still reachable from the internet, and this endpoint
     drives billable Plaid calls (syncItem) and item status for any item_id a
     caller names. So the signature is required whenever the server itself is
     in production, not only when Plaid is.
     Plaid genuinely does not sign sandbox webhooks, so local development needs
     a way through — PLAID_ALLOW_UNSIGNED_WEBHOOKS=1. It is ignored outright
     when Plaid is in production, where the payloads concern real bank data. */
  if (webhookSignatureRequired()) {
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
// Exposed for tests: the review queue spans every linked bank, so syncing one
// must not drop the proposals belonging to another.
module.exports.refreshBalanceProposals = refreshBalanceProposals;
// Exposed for tests + the boot-time warning: whether an unsigned webhook is
// accepted is a security decision worth asserting on directly.
module.exports.webhookSignatureRequired = webhookSignatureRequired;
// Exposed for tests: a confident digits/issuer match is written onto the card,
// which is what makes spending attribution and the editor's picker agree.
module.exports.autoLinkCards = autoLinkCards;
// Exposed for tests: the Balances-tab counterpart — a confident match is pinned
// onto the asset account so later syncs (and the account editor's picker)
// agree on which bank account a row follows.
module.exports.autoLinkAssetAccounts = autoLinkAssetAccounts;
