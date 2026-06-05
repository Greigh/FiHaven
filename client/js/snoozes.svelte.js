/* ═══════════════════════════════════════════════════════════
   snoozes.svelte.js — per-device "snooze until tomorrow"
   for dashboard rows. Stored only in localStorage (not synced
   to the server) so each device manages its own queue.
═══════════════════════════════════════════════════════════ */

const KEY = 'fh_snoozes';

function loadInitial() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export const snoozes = $state(loadInitial());

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...snoozes }));
  } catch {
    /* ignore quota errors */
  }
}

function keyFor(type, refId) {
  return type + ':' + refId;
}

export function isSnoozed(type, refId) {
  const ts = snoozes[keyFor(type, refId)];
  return !!ts && Date.now() < ts;
}

export function snoozeUntilTomorrow(type, refId) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  snoozes[keyFor(type, refId)] = d.getTime();
  persist();
}

export function unsnooze(type, refId) {
  delete snoozes[keyFor(type, refId)];
  persist();
}

// Drop any expired snooze keys so the proxy stays tidy.
export function pruneExpiredSnoozes() {
  const now = Date.now();
  let changed = false;
  for (const k of Object.keys(snoozes)) {
    if (snoozes[k] <= now) {
      delete snoozes[k];
      changed = true;
    }
  }
  if (changed) persist();
}
