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

import { DATA_CACHE_KEYS } from './localCache.js';
import { markPending, clearPending, hasPendingFor } from './pendingSync.js';
import { mergeDataset, LISTS } from './syncMerge.js';

// Derived from the one list, so what we cache and what sign-out clears can
// never drift apart again (they did: three keys were left behind).
const SYNCED_KEYS = Object.fromEntries(DATA_CACHE_KEYS.map((k) => [k, 1]));
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
  // These two live INSIDE settings, so they never passed through the
  // repairIds() that guards every top-level array — and the Income tab
  // renders both as keyed {#each}. Repairing here also heals the shared
  // blob for iOS and Android, which have no repair pass of their own.
  repairIds(settings.incomes);
  repairIds(settings.incomeAdjustments);
}

/* ── Sync status indicator ───────────────────────────────── */
export function setSyncStatus(state) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const labels = {
    saving: 'Saving…',
    saved: 'All changes saved',
    offline: 'Offline — saved on device',
    // Not "offline": the server answered, and refused. Retrying cannot fix it,
    // so say so rather than leaving a red dot that looks like a bad connection.
    rejected: 'Not saved — this device is out of sync',
  };
  // The pill's color comes from CSS via [data-state]; an empty
  // label (the idle state) hides the pill via :empty.
  el.textContent = labels[state] || '';
  el.dataset.state = state || 'idle';
}

/* ── The sync baseline ───────────────────────────────────────
   The last dataset this device and the server are known to have agreed on.
   Kept because `PUT /api/data` is whole-blob last-write-wins with no version
   or updatedAt: given only "mine" and "theirs" there is no way to tell an edit
   from a staleness, and any reconciliation is a guess. With a baseline the two
   diffs are separable and a real three-way merge becomes possible — see
   syncMerge.js. Written at exactly the two moments the two sides agree: when
   we adopt the server's copy, and when the server accepts ours. */
const SYNC_BASE_KEY = 'fh_sync_base';

// Just the synced dataset — never `email`/`entitlement`/`admin`, which ride
// along on GET /api/data and are not ours to merge.
function datasetOf(d) {
  const out = {};
  LISTS.forEach((k) => { out[k] = Array.isArray(d && d[k]) ? d[k] : []; });
  out.settings = d && d.settings && typeof d.settings === 'object' && !Array.isArray(d.settings)
    ? d.settings : {};
  return out;
}

function rememberBase(json) {
  try {
    localStorage.setItem(SYNC_BASE_KEY, json);
  } catch (e) {
    // Out of quota. The merge degrades to the conservative path (refuse to
    // adopt over local edits) rather than to a wrong answer.
  }
}

function readBase() {
  try {
    const raw = localStorage.getItem(SYNC_BASE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/* ── Server sync ─────────────────────────────────────────── */
let syncTimer = null;
/* Fields the last merge had to pick a side on, for a caller that wants to say
   so. Empty after a clean adopt or a conflict-free merge. */
let lastConflicts = [];
/* Whether that merge had no baseline and could only union the two sides. */
let lastConservative = false;
/* The tail of the write chain, so pushes never overlap. Starts resolved. */
let inFlight = Promise.resolve();

/* Set when the server refused the last write outright (not a network failure).
   Retrying cannot clear it; only a different, smaller payload can. */
let writeRejected = false;
/* Size in bytes of that refused write, so the refusal can be explained. */
let rejectedBytes = 0;
/* The account the loaded data belongs to. Kept so a pending write can be
   tied to an owner and never replayed into somebody else's account. */
let dataOwner = '';

/* Whether this page has actually loaded a dataset into the state above.
   False until applyData() runs, which is every terminating path of
   bootstrapData() and pullFromServer().

   It exists because the arrays start EMPTY and `PUT /api/data` treats a sent
   `[]` as "clear this list". Any page that imports this module inherits the
   pagehide/visibilitychange/online listeners below, and a page that never
   bootstraps — /settings is one — would answer those with a snapshot of
   nothing and wipe the account. The pending marker is left set, so the edits
   are still replayed from the cache by the next page that does bootstrap. */
let hydrated = false;

function currentOwner() {
  if (dataOwner) return dataOwner;
  try {
    return localStorage.getItem('fh_data_owner') || '';
  } catch (e) {
    return '';
  }
}

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

/* Everything this device has cached, in the shape applyData wants. */
function cachedData() {
  return {
    bills: load('fh_bills', []),
    cards: load('fh_cards', []),
    payments: load('fh_payments', []),
    accounts: load('fh_accounts', []),
    goals: load('fh_goals', []),
    transactions: load('fh_transactions', []),
    settings: load('fh_settings', { income: 0 }),
  };
}

function applyData(d) {
  d = d || {};
  hydrated = true;
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
/* Adopting is wholesale — every list and the settings object are replaced — so
   a plain adopt is only safe once this device has no edits the server hasn't
   taken. We flush first to try to reach that state.

   When the flush doesn't land, this device is holding edits the server's copy
   does not contain, and the two have to be RECONCILED rather than one of them
   chosen. That is what the baseline is for: mergeDataset separates what we
   changed from what changed elsewhere and keeps both, so a bank sync's imported
   transactions and an unpushed paycheck now survive each other instead of one
   erasing the other. The merge is pushed straight back, so the server converges
   too. Returns null only when the pull failed, or when there is no baseline to
   merge against — in which case we still refuse to overwrite local work. */
export function pullFromServer() {
  return flushLocalWrites().then(() => {
    const holdingEdits = hasPendingFor(currentOwner());
    return fetch('/api/data', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject('http')))
      .then((server) => {
        applyEntitlement(server);
        if (!holdingEdits) {
          applyData(server);
          rememberBase(JSON.stringify(datasetOf(server)));
          cacheLocally();
          lastConflicts = [];
          lastConservative = false;
          return server;
        }
        return reconcile(server);
      })
      .catch(() => null);
  });
}

/* This device's edits as seen from a page that never loaded the account. Read
   from the offline cache, which is where pendingSync says unsynced edits live.

   The subtlety is what an ABSENT cache key means. It is not an empty list — it
   is no information, and the two are opposite to a merge: an empty list says
   "the user deleted these", no information says "nothing changed here". So a
   missing key falls back to the BASELINE, which is exactly "unchanged", and the
   merge then takes the server's side for it. With no cache at all this makes
   local identical to base, so the merge degrades cleanly into a plain adopt —
   no special case needed. */
function cachedDatasetAgainst(base) {
  const pick = (key, fallback) => {
    try {
      const v = localStorage.getItem('fh_' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  };
  const out = {};
  LISTS.forEach((k) => {
    out[k] = pick(k, Array.isArray(base && base[k]) ? base[k] : []);
  });
  out.settings = pick('settings', (base && base.settings) || {});
  return out;
}

/* Fold the server's copy together with the edits this device still owes it.
   Returns the merged payload, or null when it cannot be done safely. */
function reconcile(server) {
  /* Where this device's unsynced edits actually are: normally the live state,
     but a page that never loaded the account — /settings is one, and it calls
     pullFromServer — holds seven empty lists while its edits sit in the offline
     cache. Merging the empty state would read every record the user owns as a
     deliberate deletion; reading the cache reconciles it properly instead. */
  /* No baseline — the first sync after this shipped, or storage was full when
     we tried to write one. Rather than refuse the pull outright, merge against
     an EMPTY baseline: every record on either side then reads as an addition,
     so the result is the union and nothing is dropped.

     The one thing an empty baseline cannot express is a deletion — a record the
     user removed here but the server still has is indistinguishable from one
     added there, so it comes back. That is worth saying out loud (hence the
     flag), and it is much the lesser harm: the alternative was adopting nothing
     at all and showing stale data indefinitely. It is also self-clearing, since
     the very next accepted push writes a real baseline. */
  const base = readBase();
  const local = datasetOf(hydrated ? snapshot() : cachedDatasetAgainst(base));

  let merged;
  try {
    merged = mergeDataset(base || {}, local, datasetOf(server));
  } catch (e) {
    return null;
  }

  applyData(merged.data);
  cacheLocally();
  lastConflicts = merged.conflicts;
  lastConservative = !base;
  // The merge exists only here until it is pushed. The pending marker is still
  // set (nothing has cleared it), so this both sends the reconciled blob and
  // keeps the device marked as owing a write until the server takes it.
  scheduleSync();
  return Object.assign({}, server, merged.data);
}

/* The fields the last reconcile had to choose a side on — both devices moved
   them, and the local value was kept. Empty when nothing collided. */
export function lastSyncConflicts() {
  return lastConflicts.slice();
}

/* Whether the last reconcile ran without a baseline, and so could only take the
   union of both sides — meaning a record deleted on this device may have come
   back. False for an ordinary merge. */
export function lastSyncConservative() {
  return lastConservative;
}

// Push the full dataset to the server. `keepalive` is used when
// the page is unloading so a pending change still reaches the
// server.
// Resolves once the write has been attempted (and `done` has run), whatever
// the outcome — callers wait on it to know the queue has drained, not that it
// succeeded. Success is read off the pending marker, which only a 2xx clears.
function pushData(keepalive) {
  // Nothing has been loaded into the state, so a snapshot of it describes no
  // account — it is seven empty lists, which the server would store verbatim.
  // Whatever the caller was reacting to (a hidden tab, an `online` event, a
  // pending marker left by another page) is not worth an account for.
  if (!hydrated) return Promise.resolve();
  setSyncStatus('saving');
  const auth = window.AppAuth;
  // Serialized once, so a CSRF retry resends the same bytes — and so the
  // baseline recorded on success is exactly what the server was given.
  const body = JSON.stringify(snapshot());

  function send(token) {
    return fetch('/api/data', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token || '',
      },
      credentials: 'same-origin',
      body,
      keepalive: keepalive === true,
    });
  }

  function done(r) {
    if (!r) return;
    if (r.status === 401) {
      window.location.replace('/login');
      return;
    }
    // Only a write the server actually accepted retires the pending marker.
    // A 5xx leaves it set, so the edits are replayed on the next load or the
    // next time the connection comes back.
    if (r.ok) {
      clearPending();
      writeRejected = false;
      // The server now holds exactly this. That makes it the state both sides
      // agree on, and so the baseline any future merge is measured against.
      rememberBase(body);
      rejectedBytes = 0;
      setSyncStatus('saved');
      return;
    }
    // A 4xx the server will give again for the same body — 413 (the blob is
    // over the 256kb cap) is the one that actually happens. Retrying is
    // pointless, so stop pretending it's a connection blip: the marker stays
    // (the edits are still real and still cached), but the pill says the
    // device is out of sync so this doesn't fail silently forever.
    writeRejected = r.status >= 400 && r.status < 500 && r.status !== 429;
    // How big the refused write was. A 413 is the only rejection that really
    // happens, and "too large" is not actionable without a number — the user
    // needs to know whether they are a little over or far over.
    rejectedBytes = writeRejected ? body.length : 0;
    setSyncStatus(writeRejected ? 'rejected' : 'offline');
  }

  const token = auth && auth.getCsrfToken && auth.getCsrfToken();
  const canRetry = !keepalive && auth && auth.me && auth.getCsrfToken;

  function sendAndHandle(t) {
    return send(t).then((r) => {
      // A rotated CSRF token is not a network fault, and resending the same
      // stale token 403s forever — which used to leave this device unable to
      // save (and, with the pull guard below, unable to pull) until a reload.
      // Re-read the token once and try again.
      if (r.status === 403 && canRetry && !csrfRetried) {
        csrfRetried = true;
        return auth.me().then(() => send(auth.getCsrfToken())).then(done);
      }
      return done(r);
    });
  }

  let csrfRetried = false;
  if (token || keepalive || !auth) {
    return sendAndHandle(token).catch(() => setSyncStatus('offline'));
  }
  return auth
    .me()
    .then(() => sendAndHandle(auth.getCsrfToken()))
    .catch(() => setSyncStatus('offline'));
}

export function scheduleSync() {
  // A deliberate write through this module — the caller is asserting that what
  // is in the state now is the account, so it is safe to send even if nothing
  // was ever loaded (clearing everything is a real edit).
  hydrated = true;
  // Marked before the debounce, not after the request: the window where an
  // edit exists only in memory is exactly the window a crash or a closed tab
  // would lose it in.
  markPending(currentOwner());
  if (syncTimer) clearTimeout(syncTimer);
  setSyncStatus('saving');
  syncTimer = setTimeout(() => {
    syncTimer = null;
    queuePush(false);
  }, SYNC_DEBOUNCE_MS);
}

/* Send the outbound write now instead of waiting out the debounce.

   Covers TWO cases, and the second is the one that matters. A previous push
   that failed leaves the pending marker set with NO timer armed — nothing is
   scheduled to try again. Flushing only when a timer happened to be running
   meant such a device never retried on its own, and since pullFromServer
   refuses to adopt over unsynced edits, it also stopped pulling: wedged, and
   silently, until the user happened to type something or the `online` event
   fired. So an owed write is retried here whether or not a timer is armed.

   Resolves when the attempt is over, whatever the outcome. */
function flushNow(keepalive) {
  const armed = !!syncTimer;
  if (armed) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (!armed) {
    if (!hasPendingFor(currentOwner())) return inFlight;   // nothing owed
    // Owed, but a push is already on the wire — and pushData serializes the
    // whole current state when it runs, so that request already carries this
    // data. An armed timer is precisely the signal that something changed
    // since; without one there is nothing a second write would add.
    if (pushesQueued > 0) return inFlight;
  }
  return queuePush(keepalive);
}

/* One write on the wire at a time. Two overlapping PUTs would let
   last-write-wins be settled by which response came back first rather than by
   which snapshot was newer — and every push sends the whole current state, so
   the later one is always the one we want. Retrying an owed write from a pull
   is exactly what makes that overlap likely, hence the queue.

   An idle queue starts its push SYNCHRONOUSLY: the debounce timer and the
   unload flush both rely on the request being made before the caller yields,
   and a keepalive push in particular has to be issued inside the pagehide
   handler to count. pushData never rejects, so this chain cannot break. */
let pushesQueued = 0;
function queuePush(keepalive) {
  const run = () => pushData(keepalive).then(() => { pushesQueued -= 1; });
  inFlight = pushesQueued++ === 0 ? run() : inFlight.then(run);
  return inFlight;
}

// Flush a pending sync immediately — used when the tab is hidden
// or closed so a debounced change is not lost. `keepalive` keeps the request
// alive past unload; it caps the body at 64KB, which is why it is NOT used for
// the ordinary in-page flush below.
export function flushSync() {
  return flushNow(true);
}

// Drain the outbound queue as a normal request, for anything that is about to
// act on the server's copy of this data — a bank sync merges into the stored
// blob, so a local edit that hasn't been pushed yet would be merged into a
// stale base and then lost when the merged copy comes back.
export function flushLocalWrites() {
  return flushNow(false);
}

// Whether this device is still holding edits the server has not accepted.
export function hasUnsyncedEdits() {
  return hasPendingFor(currentOwner());
}

/* Why adopting the server's copy would be refused right now, or null if it
   wouldn't be. Callers that sync on the user's say-so use this to explain
   themselves instead of reporting a success that didn't happen.

   'pending'  — the write hasn't landed yet, but it is being retried and this
                clears itself as soon as one succeeds.
   'rejected' — the server answered and refused (a 413: the dataset is over the
                256kb cap). Retrying cannot fix it; the user has to remove some
                data. Until then this device keeps its own copy and declines to
                overwrite it with the server's, which is the safe half — but it
                has to SAY so, or it just looks broken. */
/* The size of the write the server refused, and the cap it exceeded, so a
   caller can tell the user how far over they are instead of just "too large".
   Zero when nothing has been refused. */
export const SYNC_SIZE_LIMIT = 256 * 1024;   // express.json({ limit: '256kb' })
export function rejectedWriteBytes() {
  return rejectedBytes;
}

export function syncBlockedReason() {
  if (!hasPendingFor(currentOwner())) return null;
  return writeRejected ? 'rejected' : 'pending';
}

window.addEventListener('pagehide', flushSync);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSync();
});

/* Coming back online is the moment a write that failed while disconnected can
   finally land. Without this the edits sit in the cache until the user happens
   to reload or make another change. */
window.addEventListener('online', () => {
  if (hasPendingFor(currentOwner())) pushData(false);
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
      dataOwner = owner;

      // This device is holding edits the server never accepted — made while
      // offline, or lost when the tab closed mid-save. They are strictly newer
      // than anything the server can hand back, and `PUT /api/data` replaces
      // the blob wholesale, so adopting the server copy here would silently
      // destroy them. Keep what's cached and push it up instead.
      // NB: the baseline is deliberately untouched here. The server's copy is
      // not something this device has agreed to — the stored base is still the
      // true common ancestor, and overwriting it would make the local edits
      // below look like they had already been accepted.
      if (hasPendingFor(owner)) {
        applyData(cachedData());
        try { localStorage.setItem('fh_data_owner', owner); } catch (e) { /* ignore */ }
        scheduleSync();
        import('./householdMerge.js').then((m) => m.initHouseholdMerge()).catch(() => {});
        return;
      }

      const serverEmpty =
        !(server.bills && server.bills.length) &&
        !(server.cards && server.cards.length) &&
        !(server.payments && server.payments.length);

      if (!serverEmpty) {
        applyData(server);
        localStorage.setItem('fh_data_owner', owner);
        rememberBase(JSON.stringify(datasetOf(server)));
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
      rememberBase(JSON.stringify(datasetOf({})));
      cacheLocally();
      import('./householdMerge.js').then((m) => m.initHouseholdMerge()).catch(() => {});
    })
    .catch((err) => {
      if (err === 'unauth' || err === 'suspended') return Promise.reject(err);
      // Offline or server error — fall back to this device's cache. Any
      // pending marker is deliberately left in place: the edits behind it
      // still haven't reached the server, and the `online` listener (or the
      // next successful boot) is what finally pushes them.
      dataOwner = currentOwner();
      applyData(cachedData());
      setSyncStatus('offline');
    });
}
