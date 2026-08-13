/* ═══════════════════════════════════════════════════════════
   period.js — server port of client/js/period.js.

   Maps any date to the budgeting "period" that contains it, in the
   three modes the clients support:

   - calendar : the calendar month. key "YYYY-MM". The default.
   - startDay : a month-length period beginning on day N, so
                early-next-month bills fall into the period you'd
                plan for. key = the period's start date.
   - rolling  : fixed consecutive K-day buckets, anchored at a stable
                epoch unless periodAnchor names a day.
                key = the bucket's start date.

   ── Why this file exists ────────────────────────────────────
   The scheduler used to reason purely in calendar months. That is
   exact in `calendar` mode and WRONG in the other two: with
   periodStartDay = 25 the period holding Sept 1 runs Aug 25 → Sep 24,
   so a payment on Aug 28 is "this period" to every client and
   "last month" to the server. Reminders then fired for bills the app
   showed as paid, and autopay's once-per-period memory could mark an
   item twice across a period boundary.

   ── This is a FOURTH copy (period.js / Period.kt / Period.swift) ──
   Kept honest by server/period.test.js, which runs this module and
   client/js/period.js over the same matrix of dates and configs and
   fails on ANY divergence. If you change one, that test tells you to
   change the other — but the Kotlin and Swift ports have no such
   guard, so change all four together.

   Dates are naive local Date objects, exactly as on the clients: the
   server builds them from the USER's local Y/M/D parts (see
   localParts in scheduler.js), so the process timezone never enters
   the arithmetic.
═════════════════════════════════════════════════════════════ */

'use strict';

const DAY = 864e5;
// Fixed anchor for rolling buckets (local midnight). Stable across devices so
// the same calendar day always lands in the same bucket.
const ROLL_EPOCH = new Date(2020, 0, 1);

/* Out-of-range values are CLAMPED to the nearest valid one, not reset to the
   default — an absent/unparseable value is what falls back. All three clients
   clamp, so resetting here would make the same account compute a different
   period on the server than on the phone, moving every boundary and with it
   paid state and "due this period". */
function clampDay(v) {
  v = parseInt(v, 10);
  if (isNaN(v)) return 1;
  return Math.min(Math.max(v, 1), 28);
}

function clampLen(v) {
  v = parseInt(v, 10);
  if (isNaN(v)) return 35;
  return Math.min(Math.max(v, 7), 90);
}

// A valid "YYYY-MM-DD" rolling anchor, or null to fall back to ROLL_EPOCH.
function validAnchor(v) {
  return (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : null;
}

/** Normalize a user's settings blob into a period config. */
function getPeriodConfig(s) {
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

/* Parse a "YYYY-MM" / "YYYY-MM-DD" key or a Date into local midnight.

   Unlike the web's, this has NO ambient `today()` fallback — the server has no
   single "today" (every user has their own timezone), so an unparseable value
   must be the caller's problem rather than silently becoming the server's
   current date in the wrong zone.

   THIS IS THE ONE INTENTIONAL DIVERGENCE from client/js/period.js, and the
   parity matrix does not cover it. On junk input the web places the payment at
   today's date; we return null, which `paymentInBounds` reads as "not in this
   period" — so a corrupt date can never silence a reminder. That errs toward
   reminding, which is the safe direction. Pinned in server/period.test.js
   under "server behaviour". */
function asDate(v) {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'string' && v) {
    const [y, m, d] = v.split('-').map(Number);
    if (y && m) return new Date(y, m - 1, d || 1);
  }
  return null;
}

/** Bounds { start, end, key, mode } for the period containing `date`. */
function periodBounds(date, cfg) {
  const d = asDate(date);
  if (!d) return null;

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

/** Resolve the bounds for a period key (key === the period's start). */
function boundsForKey(key, cfg) {
  if (cfg.mode === 'rolling' && typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const start = asDate(key);
    const end = new Date(start.getTime() + cfg.length * DAY);
    return { start, end, key: ymd(start), mode: cfg.mode };
  }
  return periodBounds(asDate(key), cfg);
}

/* The "YYYY-MM" calendar months a period's [start, end) overlaps. A
   non-calendar period can span several months, so per-month bookkeeping
   (autopay's done-memory) must look across all of them. */
function monthsInBounds(bounds) {
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

/* True if payment `p` falls within [bounds.start, bounds.end).

   A payment is placed by its immutable `date`, which is why switching period
   modes needs no data migration. `monthKey` is only a fallback for legacy
   date-less records, and only calendar mode can place those. */
function paymentInBounds(p, bounds) {
  if (!p || !bounds) return false;
  if (p.date) {
    const d = asDate(p.date);
    if (!d) return false;
    return d >= bounds.start && d < bounds.end;
  }
  return bounds.mode === 'calendar' && p.monthKey === bounds.key;
}

module.exports = {
  getPeriodConfig,
  periodBounds,
  boundsForKey,
  monthsInBounds,
  paymentInBounds,
};
