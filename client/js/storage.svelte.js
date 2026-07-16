/* ═══════════════════════════════════════════════════════════
   storage.svelte.js — shared data store with per-user backend sync.

   The four arrays/objects (bills, cards, payments, settings)
   are Svelte 5 `$state` proxies — any module that mutates them
   in place (push/splice/property assignment) automatically
   triggers reactivity in every Svelte component reading them.
   Full-array replacement goes through the setX helpers, which
   clear-and-refill in place so the proxy identity (and every
   importer's binding) stays stable.

   localStorage is kept as an offline cache; the server copy is
   authoritative and re-applied at bootstrap.

   The `.svelte.js` extension is required so Vite/Svelte runs
   the runes transform on this file.
═══════════════════════════════════════════════════════════ */

const SYNCED_KEYS = { fh_bills: 1, fh_cards: 1, fh_payments: 1, fh_accounts: 1, fh_goals: 1, fh_transactions: 1, fh_settings: 1 };
const SYNC_DEBOUNCE_MS = 800;

/* One-time migration of legacy keys (ct_*) to the FiHaven
   namespace (fh_*). Copies each only when the new key is absent, so it's
   safe on every load and never clobbers fresher data; then drops the old
   key. Lets returning users keep their offline cache across the rename. */
(function migrateLegacyKeys() {
  try {
    var map = {
      ct_bills:      'fh_bills',
      ct_cards:      'fh_cards',
      ct_payments:   'fh_payments',
      ct_settings:   'fh_settings',
      ct_data_owner: 'fh_data_owner',
      ct_snoozes:    'fh_snoozes',
      ct_theme:      'fh_theme',
    };
    Object.keys(map).forEach(function (oldKey) {
      var oldVal = localStorage.getItem(oldKey);
      if (oldVal === null) return;
      if (localStorage.getItem(map[oldKey]) === null) {
        localStorage.setItem(map[oldKey], oldVal);
      }
      localStorage.removeItem(oldKey);
    });
  } catch (e) {
    /* storage unavailable — nothing to migrate */
  }
})();

export function load(key, defaultVal) {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? JSON.parse(v) : defaultVal;
  } catch {
    return defaultVal;
  }
}

export function save(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    /* quota/full — server sync is still attempted below */
  }
  if (SYNCED_KEYS[key]) scheduleSync();
}

/* ── Shared state — Svelte 5 $state proxies ─────────────────
   Every module mutates these in place; Svelte tracks the
   property accesses automatically, so components re-render
   without any event bus or refresh trigger.
─────────────────────────────────────────────────────────────── */
export const bills    = $state([]);
export const cards    = $state([]);
export const payments = $state([]);  // { id, type, refId, name, amount, date, monthKey, note }
export const accounts = $state([]);  // assets: { id, name, type, balance, notes }
export const goals    = $state([]);  // savings goals: { id, name, target, saved, targetDate, notes }
export const transactions = $state([]); // spending: { id, date, amount, category, merchant, account, note }
export const settings = $state({ income: 0 });
// Effective Pro entitlement, server-derived (read-only on the client).
export const entitlement = $state({ pro: false, source: null, productId: null, plan: null, expiresAt: null });

export function setEntitlement(e) {
  const next = e && typeof e === 'object' ? e : {};
  entitlement.pro = !!next.pro;
  entitlement.source = next.source ?? null;
  entitlement.productId = next.productId ?? null;
  entitlement.plan = next.plan ?? null;
  entitlement.expiresAt = next.expiresAt ?? null;
}

/* ── Dev entitlement override (admins only) ─────────────────
   Lets an admin simulate every Pro state without a real purchase.
   The choice is persisted in localStorage, but localStorage is
   attacker-controlled: only the server can say who is an admin, so
   the override is applied solely through applyEntitlement() below,
   which honors it only when the server's payload says `admin: true`.
   For everyone else a stored value is ignored and erased. */
const DEV_ENT_KEY = 'fh_dev_entitlement';

export function getDevEntitlement() {
  try { return localStorage.getItem(DEV_ENT_KEY) || 'off'; } catch (e) { return 'off'; }
}

export function setDevEntitlement(state) {
  try {
    if (!state || state === 'off') localStorage.removeItem(DEV_ENT_KEY);
    else localStorage.setItem(DEV_ENT_KEY, state);
  } catch (e) { /* ignore */ }
  return refreshEntitlement();
}

function clearDevEntitlement() {
  try { localStorage.removeItem(DEV_ENT_KEY); } catch (e) { /* ignore */ }
}

// Synthetic entitlement for a simulated state, or null to use the server's.
function devEntitlement(state) {
  const now = Date.now();
  const DAY = 86400000;
  switch (state) {
    case 'free':     return { pro: false, source: 'dev', plan: null, expiresAt: null };
    case 'active':   return { pro: true, source: 'dev', plan: 'monthly', expiresAt: now + 30 * DAY };
    case 'expired':  return { pro: false, source: 'dev', plan: 'monthly', expiresAt: now - 2 * DAY };
    case 'grace':    return { pro: true, source: 'dev', plan: 'monthly', expiresAt: now - 1 * DAY };
    case 'canceled': return { pro: true, source: 'dev', plan: 'monthly', expiresAt: now + 10 * DAY };
    default:         return null;
  }
}

/* The single place a server payload becomes the live entitlement. Non-admins
   get exactly what the server sent; a leftover override is wiped so it can't
   resurface if the account is ever promoted. */
export function applyEntitlement(payload) {
  const isAdmin = !!(payload && payload.admin);
  if (!isAdmin) {
    clearDevEntitlement();
    setEntitlement(payload && payload.entitlement);
    return entitlement;
  }
  const override = devEntitlement(getDevEntitlement());
  setEntitlement(override || (payload && payload.entitlement));
  return entitlement;
}

// Re-fetch the authoritative entitlement (after a checkout return / redeem,
// or when the override changes). Always asks the server, because the server's
// answer is what decides whether an override is allowed at all. On a failed
// fetch the current entitlement stands — we never upgrade ourselves offline.
export function refreshEntitlement() {
  return fetch('/api/billing/status', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d ? applyEntitlement(d) : entitlement))
    .catch(() => entitlement);
}

/* Replace-helpers: mutate the existing proxy in place rather
   than reassigning the binding, so consumers keep the same
   reactive object reference. */
function replaceArray(target, src) {
  target.length = 0;
  if (Array.isArray(src)) target.push(...src);
}
function replaceObject(target, src) {
  for (const k of Object.keys(target)) delete target[k];
  if (src && typeof src === 'object' && !Array.isArray(src)) Object.assign(target, src);
}
/* Collision-proof id for new records. Legacy data used bare Date.now(),
   which duplicates when two items are created in the same millisecond —
   and Svelte's keyed {#each (item.id)} throws on duplicate keys. */
export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* Repair any missing or duplicated ids in place so keyed lists never
   collide (and edit/delete-by-id always hits the right row). Mutated
   ids persist on the next save/sync. */
function repairIds(arr) {
  if (!Array.isArray(arr)) return arr;
  const seen = new Set();
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const id = item.id;
    if (id == null || id === '' || seen.has(String(id))) item.id = genId();
    seen.add(String(item.id));
  }
  return arr;
}

export function setBills(arr)    { replaceArray(bills, repairIds(arr)); }
export function setCards(arr)    { replaceArray(cards, repairIds(arr)); }
export function setPayments(arr) { replaceArray(payments, repairIds(arr)); }
export function setAccounts(arr) { replaceArray(accounts, repairIds(arr)); }
export function setGoals(arr)    { replaceArray(goals, repairIds(arr)); }
export function setTransactions(arr) { replaceArray(transactions, repairIds(arr)); }
export function setSettings(obj) {
  replaceObject(settings, obj);
  // Restore the default income shape so reactive readers don't
  // crash on a freshly-cleared settings object.
  if (!('income' in settings)) settings.income = 0;
}

/* ── Sync status indicator ───────────────────────────────── */
export function setSyncStatus(state) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const labels = {
    saving: 'Saving…',
    saved: 'All changes saved',
    offline: 'Offline — saved on device',
  };
  // The pill's color comes from CSS via [data-state]; an empty
  // label (the idle state) hides the pill via :empty.
  el.textContent = labels[state] || '';
  el.dataset.state = state || 'idle';
}

/* ── Server sync ─────────────────────────────────────────── */
let syncTimer = null;

function withoutHouseholdShared(arr) {
  return (arr || []).filter((x) => !x || !x._householdShared);
}

function snapshot() {
  return {
    bills: withoutHouseholdShared(bills),
    cards: withoutHouseholdShared(cards),
    payments,
    accounts,
    goals: withoutHouseholdShared(goals),
    transactions,
    settings,
  };
}

// Mirror the in-memory state into the localStorage offline cache
// without triggering another sync.
function cacheLocally() {
  try {
    localStorage.setItem('fh_bills', JSON.stringify(bills));
    localStorage.setItem('fh_cards', JSON.stringify(cards));
    localStorage.setItem('fh_payments', JSON.stringify(payments));
    localStorage.setItem('fh_accounts', JSON.stringify(accounts));
    localStorage.setItem('fh_goals', JSON.stringify(goals));
    localStorage.setItem('fh_transactions', JSON.stringify(transactions));
    localStorage.setItem('fh_settings', JSON.stringify(settings));
  } catch (e) {
    /* ignore quota errors — the server copy is authoritative */
  }
}

function applyData(d) {
  d = d || {};
  setBills(d.bills);
  setCards(d.cards);
  setPayments(d.payments);
  setAccounts(d.accounts);
  setGoals(d.goals);
  setTransactions(d.transactions);
  setSettings(d.settings);
}

// Re-read the server copy and adopt it. Used after a bank sync, which merges
// new transactions server-side — without this the freshly imported rows sit in
// the database, invisible, until the next full page load.
//
// Only safe when there are no unsaved local edits (i.e. right after boot, or
// straight after a sync the user explicitly asked for): the server copy wins.
export function pullFromServer() {
  return fetch('/api/data', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : Promise.reject('http')))
    .then((server) => {
      applyEntitlement(server);
      applyData(server);
      cacheLocally();
      return server;
    })
    .catch(() => null);
}

// Push the full dataset to the server. `keepalive` is used when
// the page is unloading so a pending change still reaches the
// server.
function pushData(keepalive) {
  setSyncStatus('saving');
  const auth = window.AppAuth;

  function send(token) {
    return fetch('/api/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token || '',
      },
      credentials: 'same-origin',
      body: JSON.stringify(snapshot()),
      keepalive: keepalive === true,
    });
  }

  function done(r) {
    if (!r) return;
    if (r.status === 401) {
      window.location.replace('/login');
      return;
    }
    setSyncStatus(r.ok ? 'saved' : 'offline');
  }

  const token = auth && auth.getCsrfToken && auth.getCsrfToken();
  if (token || keepalive || !auth) {
    send(token).then(done).catch(() => setSyncStatus('offline'));
  } else {
    auth
      .me()
      .then(() => send(auth.getCsrfToken()))
      .then(done)
      .catch(() => setSyncStatus('offline'));
  }
}

export function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer);
  setSyncStatus('saving');
  syncTimer = setTimeout(() => {
    syncTimer = null;
    pushData(false);
  }, SYNC_DEBOUNCE_MS);
}

// Flush a pending sync immediately — used when the tab is hidden
// or closed so a debounced change is not lost.
export function flushSync() {
  if (!syncTimer) return;
  clearTimeout(syncTimer);
  syncTimer = null;
  pushData(true);
}

window.addEventListener('pagehide', flushSync);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSync();
});

/* ── Startup load ────────────────────────────────────────── */
// Resolves once bills/cards/payments/settings are populated.
// Server data wins; a pre-account localStorage dataset is
// migrated up on first login; offline falls back to this
// device's cache.
export function bootstrapData() {
  return fetch('/api/data', { credentials: 'same-origin' })
    .then((r) => {
      if (r.status === 401) {
        window.location.replace('/login');
        return Promise.reject('unauth');
      }
      if (r.status === 403) {
        return r.json().catch(() => ({})).then((d) => {
          if (d && d.error === 'account-suspended') {
            if (window.AppAuth && window.AppAuth.showSuspendedLock) {
              window.AppAuth.showSuspendedLock(d.reason || null);
            }
            return Promise.reject('suspended');
          }
          return Promise.reject('http');
        });
      }
      if (!r.ok) return Promise.reject('http');
      return r.json();
    })
    .then((server) => {
      applyEntitlement(server);
      const owner = server.email || '';
      const serverEmpty =
        !(server.bills && server.bills.length) &&
        !(server.cards && server.cards.length) &&
        !(server.payments && server.payments.length);

      if (!serverEmpty) {
        applyData(server);
        localStorage.setItem('fh_data_owner', owner);
        cacheLocally();
        import('./householdMerge.js').then((m) => m.initHouseholdMerge()).catch(() => {});
        return;
      }

      // Server has nothing yet. If this browser holds a genuine
      // pre-account dataset (no owner recorded), migrate it up.
      const prevOwner = localStorage.getItem('fh_data_owner');
      const localBills = load('fh_bills', []);
      const localCards = load('fh_cards', []);
      const hasLocal =
        (localBills && localBills.length) || (localCards && localCards.length);

      if (hasLocal && !prevOwner) {
        applyData({
          bills: localBills,
          cards: localCards,
          payments: load('fh_payments', []),
          settings: load('fh_settings', { income: 0 }),
        });
        localStorage.setItem('fh_data_owner', owner);
        scheduleSync(); // push the migrated data into the account
        return;
      }

      // Brand-new account — start clean (app.js may seed demo data).
      applyData({});
      localStorage.setItem('fh_data_owner', owner);
      cacheLocally();
      import('./householdMerge.js').then((m) => m.initHouseholdMerge()).catch(() => {});
    })
    .catch((err) => {
      if (err === 'unauth' || err === 'suspended') return Promise.reject(err);
      // Offline or server error — fall back to this device's cache.
      applyData({
        bills: load('fh_bills', []),
        cards: load('fh_cards', []),
        payments: load('fh_payments', []),
        accounts: load('fh_accounts', []),
        goals: load('fh_goals', []),
        transactions: load('fh_transactions', []),
        settings: load('fh_settings', { income: 0 }),
      });
      setSyncStatus('offline');
    });
}
