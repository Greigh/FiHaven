/* ═══════════════════════════════════════════════════════════
   period.js — defines the user's budgeting "period" and maps any
   date to the period that contains it. Three modes:

   - calendar : the calendar month. key "YYYY-MM". Default, and
                byte-identical to the legacy monthKey behavior.
   - startDay : a month-length period that begins on day N (e.g. the
                25th), so early-next-month bills fall into the period
                you'd plan for. key = the period's start date.
   - rolling  : fixed consecutive K-day buckets. By default anchored at
                a stable epoch; an optional periodAnchor ("YYYY-MM-DD")
                lets you choose which day the buckets begin on.
                key = the bucket's start date.

   Paid/owed is matched by whether a payment's `date` falls in the
   period's [start, end) — derived from the immutable payment date —
   so switching modes needs NO data migration. The stored calendar
   monthKey is only a fallback for date-less records.
═══════════════════════════════════════════════════════════ */

import { settings } from './storage.svelte.js';
import { today } from './tz.js';

const DAY = 864e5;
// Fixed anchor for rolling buckets (local midnight). Stable across
// devices so the same calendar day always lands in the same bucket.
const ROLL_EPOCH = new Date(2020, 0, 1);

function clampDay(v) { v = parseInt(v, 10); return v >= 1 && v <= 28 ? v : 1; }
function clampLen(v) { v = parseInt(v, 10); return v >= 7 && v <= 90 ? v : 35; }
// A valid "YYYY-MM-DD" rolling anchor, or null to fall back to ROLL_EPOCH.
function validAnchor(v) {
  return (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : null;
}

export function getPeriodConfig(s) {
  s = s || settings;
  const mode = s && s.periodMode;
  return {
    mode: mode === 'startDay' || mode === 'rolling' ? mode : 'calendar',
    startDay: clampDay(s && s.periodStartDay),
    length: clampLen(s && s.periodLength),
    anchor: validAnchor(s && s.periodAnchor),
  };
}

// Local-midnight anchor a rolling grid counts buckets from.
function rollAnchor(cfg) {
  const a = cfg && cfg.anchor && asDate(cfg.anchor);
  return (a && !isNaN(a)) ? a : ROLL_EPOCH;
}

function ymd(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function ym(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Parse a "YYYY-MM" / "YYYY-MM-DD" key or a Date into local midnight.
function asDate(v) {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'string' && v) {
    const [y, m, d] = v.split('-').map(Number);
    if (y && m) return new Date(y, m - 1, d || 1);
  }
  return today();
}

// Bounds { start, end, key, mode } for the period containing `date`.
export function periodBounds(date, cfg) {
  cfg = cfg || getPeriodConfig();
  const d = asDate(date || today());

  if (cfg.mode === 'startDay') {
    const n = cfg.startDay;
    let start = new Date(d.getFullYear(), d.getMonth(), n);
    if (d < start) start = new Date(d.getFullYear(), d.getMonth() - 1, n);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, n);
    return { start, end, key: ymd(start), mode: cfg.mode };
  }

  if (cfg.mode === 'rolling') {
    const len = cfg.length;
    const epoch = rollAnchor(cfg);
    const idx = Math.floor((d - epoch) / (len * DAY));
    const startMs = epoch.getTime() + idx * len * DAY;
    const s = new Date(startMs);
    const start = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const end = new Date(start.getTime() + len * DAY);
    return { start, end, key: ymd(start), mode: cfg.mode };
  }

  // calendar
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { start, end, key: ym(start), mode: 'calendar' };
}

// The period containing today.
export function currentPeriod(cfg) { return periodBounds(today(), cfg); }

// The current period's key string (the period-aware replacement for
// the legacy monthKey() as a "which period" identifier).
export function currentPeriodKey(cfg) { return currentPeriod(cfg).key; }

// Resolve the bounds for a period key (key === the period's start).
export function boundsForKey(key, cfg) {
  cfg = cfg || getPeriodConfig();
  if (cfg.mode === 'rolling' && typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const start = asDate(key);
    const end = new Date(start.getTime() + cfg.length * DAY);
    return { start, end, key: ymd(start), mode: cfg.mode };
  }
  return periodBounds(asDate(key), cfg);
}

// Shift a period by `offset` whole periods (prev/next navigation).
export function shiftPeriod(bounds, offset, cfg) {
  cfg = cfg || getPeriodConfig();
  if (!offset) return bounds;
  if (cfg.mode === 'startDay') {
    return periodBounds(new Date(bounds.start.getFullYear(), bounds.start.getMonth() + offset, cfg.startDay), cfg);
  }
  if (cfg.mode === 'rolling') {
    // Advance from the bucket midpoint: periodBounds snaps each bucket start
    // to local midnight, so DST hour-drift accumulated since the epoch can
    // leave `start + length·DAY` an hour short of the next boundary and floor
    // back into the same bucket. The half-bucket slack lands us solidly inside
    // the target bucket regardless of that drift.
    const mid = bounds.start.getTime() + (cfg.length * DAY) / 2;
    return periodBounds(new Date(mid + offset * cfg.length * DAY), cfg);
  }
  return periodBounds(new Date(bounds.start.getFullYear(), bounds.start.getMonth() + offset, 1), cfg);
}

// The "YYYY-MM" calendar months a period's [start, end) overlaps. A
// non-calendar period can span several months, so per-month bookkeeping
// (e.g. autopay's done-memory) must look across all of them.
export function monthsInBounds(bounds) {
  const out = [];
  if (!bounds) return out;
  const last = new Date(bounds.end.getTime() - DAY); // inclusive last day
  let y = bounds.start.getFullYear();
  let m = bounds.start.getMonth();
  const ey = last.getFullYear();
  const em = last.getMonth();
  while (y < ey || (y === ey && m <= em)) {
    out.push(y + '-' + String(m + 1).padStart(2, '0'));
    if (++m > 11) { m = 0; y++; }
  }
  return out;
}

// True if payment `p` falls within [bounds.start, bounds.end).
export function paymentInBounds(p, bounds) {
  if (!p || !bounds) return false;
  if (p.date) {
    const d = asDate(p.date);
    return d >= bounds.start && d < bounds.end;
  }
  // Date-less record: only calendar mode can place it, via monthKey.
  return bounds.mode === 'calendar' && p.monthKey === bounds.key;
}

// The period key a payment belongs to (used to group History).
export function periodKeyForPayment(p, cfg) {
  cfg = cfg || getPeriodConfig();
  if (p && p.date) return periodBounds(p.date, cfg).key;
  return (p && p.monthKey) || '';
}

// Human label for a period's bounds.
export function periodLabel(bounds, cfg) {
  cfg = cfg || getPeriodConfig();
  if (!bounds) return '';
  if (cfg.mode === 'calendar') {
    return bounds.start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  const last = new Date(bounds.end.getTime() - DAY);
  const startOpts = bounds.start.getFullYear() === last.getFullYear()
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' };
  return bounds.start.toLocaleDateString('en-US', startOpts) + ' – ' +
    last.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Label for a period key string (resolves bounds first).
export function periodKeyLabel(key, cfg) {
  return periodLabel(boundsForKey(key, cfg), cfg);
}
