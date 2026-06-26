/* ═══════════════════════════════════════════════════════════
   householdMerge.js — merge shared household entities into the
   main app store for bills, cards, and goals (read-only overlay).

   Shared items are tagged `_householdShared` so they are excluded
   from personal data sync back to /api/data.
═══════════════════════════════════════════════════════════ */

import { bills, cards, goals } from './storage.svelte.js';

const KIND_MAP = {
  bill: { coll: bills, key: 'bills' },
  card: { coll: cards, key: 'cards' },
  goal: { coll: goals, key: 'goals' },
};

let stream = null;

function stripShared(arr) {
  if (!Array.isArray(arr)) return;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] && arr[i]._householdShared) arr.splice(i, 1);
  }
}

function tagEntity(entity) {
  const item = { ...(entity.data || {}), id: entity.id };
  item._householdShared = true;
  item._householdOwner = entity.ownerUserId;
  item._householdKind = entity.kind;
  return item;
}

function upsertShared(entity) {
  const def = KIND_MAP[entity.kind];
  if (!def || entity.deleted) return;
  const item = tagEntity(entity);
  const idx = def.coll.findIndex((x) => x._householdShared && String(x.id) === String(item.id));
  if (idx >= 0) def.coll[idx] = item;
  else def.coll.push(item);
}

function removeShared(kind, id) {
  const def = KIND_MAP[kind];
  if (!def) return;
  const idx = def.coll.findIndex((x) => x._householdShared && String(x.id) === String(id));
  if (idx >= 0) def.coll.splice(idx, 1);
}

export function applyHouseholdEntities(entities) {
  stripShared(bills);
  stripShared(cards);
  stripShared(goals);
  (entities || []).forEach((e) => {
    if (!e || e.deleted) return;
    upsertShared(e);
  });
}

function closeStream() {
  if (stream) {
    try { stream.close(); } catch (_) { /* noop */ }
    stream = null;
  }
}

export function initHouseholdMerge() {
  return fetch('/api/household/', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || !d.household) return null;
      return fetch('/api/household/data', { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null));
    })
    .then((snap) => {
      if (!snap) return;
      applyHouseholdEntities(snap.entities || []);
      openHouseholdStream(snap.seq || 0);
    })
    .catch(() => {});
}

function openHouseholdStream(since) {
  closeStream();
  if (typeof EventSource === 'undefined') return;
  try {
    stream = new EventSource('/api/household/stream?since=' + (since || 0));
    stream.addEventListener('entity', (ev) => {
      try {
        const d = JSON.parse(ev.data);
        const e = d && d.entity;
        if (!e) return;
        if (e.deleted) removeShared(e.kind, e.id);
        else upsertShared(e);
      } catch (_) { /* ignore */ }
    });
  } catch (_) {
    stream = null;
  }
}

export function teardownHouseholdMerge() {
  closeStream();
}
