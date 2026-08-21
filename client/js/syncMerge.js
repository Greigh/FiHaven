/* ═══════════════════════════════════════════════════════════
   syncMerge.js — reconcile this device's edits with the server's copy.

   `PUT /api/data` replaces the whole blob and the server keeps no version or
   updatedAt, so two devices that both edit produce a straight last-write-wins
   race: whoever saves second erases the other. The client's answer used to be
   to refuse — a device holding unsynced edits would not adopt the server's
   copy at all, which protects the edits but means it stops seeing anything
   anyone else does.

   It does not have to be a choice, because a THIRD state is available. The
   client already caches the server's copy every time it adopts one, so it can
   keep that as a baseline: the last state both sides are known to have agreed
   on. With a baseline, "local differs from server" splits into the two facts
   that actually matter — what THIS device changed (local vs base) and what
   changed elsewhere (server vs base) — and those compose instead of colliding.
   That is an ordinary three-way merge, the same shape as a git merge.

   Only a field both sides moved is a genuine conflict. For those the local
   value wins: it is the device the user is sitting at, and it is the edit they
   just made. Conflicts are reported rather than swallowed so the caller can
   say so.

   Pure: no DOM, no network, no storage. Everything here is plain JSON.
═════════════════════════════════════════════════════════════════ */

/** The id-keyed record lists in a dataset snapshot. */
export const LISTS = ['bills', 'cards', 'payments', 'accounts', 'goals', 'transactions'];

/* Settings keys the SERVER owns. The client never authors these — Plaid sync
   writes the proposal queues, the reminder scheduler writes autopayDone — so
   "local differs from base" here means our copy is merely stale, never edited.
   Taking the server's value unconditionally is both correct and necessary:
   `keepBalanceProposals` in routes/data.js exists because a client posting a
   pre-sync snapshot would otherwise wipe a queue it never meant to touch. */
export const SERVER_OWNED_SETTINGS = [
  'plaidBalanceProposals',
  'plaidAccountProposals',
  'autopayDone',
];

/* Settings keys holding id-keyed record lists — merged per record, exactly
   like a top-level list. `incomes` and `incomeAdjustments` are why: income
   lives inside settings, so without this a paycheck added here and a bonus
   added on another device could not both survive. */
export const SETTINGS_LISTS = ['incomes', 'incomeAdjustments'];

/* Append-only settings keys: entries are added and never edited in place, so
   the union of both sides is exactly right and a removal is never intended.
   Both record decisions the user has already made — bank rows they declined,
   balance proposals they answered — and re-asking a settled question is the
   one outcome worth ruling out. */
export const UNION_SETTINGS = ['plaidHidden', 'plaidBalanceResolved'];

/* ── Equality ────────────────────────────────────────────────
   Order-insensitive over object keys, so a record that only round-tripped
   through a different serializer does not read as an edit. */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

function has(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function indexById(list) {
  const out = new Map();
  (Array.isArray(list) ? list : []).forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const id = item.id;
    if (id == null || id === '') return;
    out.set(String(id), item);
  });
  return out;
}

/* ── Record merge ────────────────────────────────────────────
   Field by field. A field only one side moved takes that side's value, which
   is what makes "I renamed the bill here, my partner changed its amount there"
   keep both. A field both sides moved is the only real conflict. */
export function mergeRecord(base, local, server, onConflict) {
  const out = {};
  const keys = new Set([
    ...Object.keys(base || {}),
    ...Object.keys(local || {}),
    ...Object.keys(server || {}),
  ]);

  keys.forEach((key) => {
    const inBase = has(base, key);
    const bv = inBase ? base[key] : undefined;
    const lv = has(local, key) ? local[key] : undefined;
    const sv = has(server, key) ? server[key] : undefined;

    // A key present in base and gone from one side was deleted there; absence
    // is a value like any other, so it is compared the same way.
    const localChanged = has(local, key) !== inBase || !deepEqual(lv, bv);
    const serverChanged = has(server, key) !== inBase || !deepEqual(sv, bv);

    if (localChanged && serverChanged) {
      if (!deepEqual(lv, sv) && onConflict) onConflict(key);
      if (has(local, key)) out[key] = lv;   // local wins; a local delete sticks
      return;
    }
    if (localChanged) {
      if (has(local, key)) out[key] = lv;
      return;
    }
    if (serverChanged) {
      if (has(server, key)) out[key] = sv;
      return;
    }
    if (inBase) out[key] = bv;
  });

  return out;
}

/* ── List merge ──────────────────────────────────────────────
   Records are keyed by id, which is stable on every platform.

   A record deleted on one side is deleted, even if the other side edited it.
   The alternative — keep it, so no edit is ever lost — resurrects records the
   user deliberately removed, and "this bill keeps coming back" is a far worse
   experience than re-applying an edit. A delete is an explicit act; it is
   honoured. */
export function mergeList(base, local, server, onConflict) {
  const b = indexById(base);
  const l = indexById(local);
  const s = indexById(server);

  const merged = new Map();
  const ids = new Set([...b.keys(), ...l.keys(), ...s.keys()]);

  ids.forEach((id) => {
    const bv = b.get(id);
    const lv = l.get(id);
    const sv = s.get(id);

    if (!bv) {
      // New since the baseline. Added on one side, or (same id on both) added
      // on both, which merges cleanly with nothing to conflict against.
      if (lv && sv) merged.set(id, mergeRecord({}, lv, sv, onConflict));
      else merged.set(id, lv || sv);
      return;
    }
    if (!lv || !sv) return;                       // deleted somewhere → deleted
    if (deepEqual(lv, bv)) { merged.set(id, sv); return; }  // only server moved
    if (deepEqual(sv, bv)) { merged.set(id, lv); return; }  // only local moved
    merged.set(id, mergeRecord(bv, lv, sv, onConflict));
  });

  // Records with no usable id can't be matched across sides, so they are only
  // ever carried through from this device — dropping them would lose data and
  // taking both copies would duplicate them on every sync.
  const unkeyed = (Array.isArray(local) ? local : [])
    .filter((x) => !x || typeof x !== 'object' || x.id == null || x.id === '');

  // Local order first (it is the order the user is looking at), then whatever
  // arrived from elsewhere, in the server's order.
  const out = [];
  const taken = new Set();
  (Array.isArray(local) ? local : []).forEach((item) => {
    const id = item && item.id != null ? String(item.id) : null;
    if (!id || taken.has(id)) return;
    if (merged.has(id)) { out.push(merged.get(id)); taken.add(id); }
  });
  (Array.isArray(server) ? server : []).forEach((item) => {
    const id = item && item.id != null ? String(item.id) : null;
    if (!id || taken.has(id)) return;
    if (merged.has(id)) { out.push(merged.get(id)); taken.add(id); }
  });
  return out.concat(unkeyed);
}

/* ── Settings merge ──────────────────────────────────────────
   Mostly scalars, so field-level three-way like any record — with three
   exceptions that would each be wrong under a plain field compare. */
export function mergeSettings(base, local, server, onConflict) {
  base = base && typeof base === 'object' ? base : {};
  local = local && typeof local === 'object' ? local : {};
  server = server && typeof server === 'object' ? server : {};

  const special = new Set([...SERVER_OWNED_SETTINGS, ...SETTINGS_LISTS, ...UNION_SETTINGS]);
  const plain = (obj) => {
    const out = {};
    Object.keys(obj).forEach((k) => { if (!special.has(k)) out[k] = obj[k]; });
    return out;
  };

  const out = mergeRecord(plain(base), plain(local), plain(server), onConflict);

  SERVER_OWNED_SETTINGS.forEach((key) => {
    if (has(server, key)) out[key] = server[key];
    else if (has(local, key)) out[key] = local[key];
  });

  SETTINGS_LISTS.forEach((key) => {
    if (!has(base, key) && !has(local, key) && !has(server, key)) return;
    out[key] = mergeList(base[key], local[key], server[key], onConflict);
  });

  UNION_SETTINGS.forEach((key) => {
    if (!has(base, key) && !has(local, key) && !has(server, key)) return;
    out[key] = unionBy(local[key], server[key]);
  });

  return out;
}

/* Union of two append-only lists, first occurrence winning. Entries are either
   bare ids or `{ fingerprint }` records, so identity falls back to the whole
   value when neither is present. */
function unionBy(a, b) {
  const out = [];
  const seen = new Set();
  const key = (v) => {
    if (v && typeof v === 'object') return String(v.fingerprint != null ? v.fingerprint : JSON.stringify(v));
    return String(v);
  };
  [a, b].forEach((list) => {
    (Array.isArray(list) ? list : []).forEach((v) => {
      const k = key(v);
      if (seen.has(k)) return;
      seen.add(k);
      out.push(v);
    });
  });
  return out;
}

/**
 * Three-way merge a whole dataset.
 *
 * @param {object} base   the last state this device and the server agreed on
 * @param {object} local  this device's current state (base + our edits)
 * @param {object} server the server's current state (base + everyone else's)
 * @returns {{data: object, conflicts: string[]}} `conflicts` names the fields
 *   both sides moved to different values, where the local value was kept.
 */
export function mergeDataset(base, local, server) {
  base = base || {};
  local = local || {};
  server = server || {};

  const conflicts = [];
  const note = (where) => (key) => {
    const label = `${where}.${key}`;
    if (!conflicts.includes(label)) conflicts.push(label);
  };

  const data = {};
  LISTS.forEach((key) => {
    data[key] = mergeList(base[key], local[key], server[key], note(key));
  });
  data.settings = mergeSettings(base.settings, local.settings, server.settings, note('settings'));

  return { data, conflicts };
}
