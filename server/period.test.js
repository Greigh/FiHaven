/* Parity + behaviour tests for the server's period port.

   server/period.js is a FOURTH copy of logic that already exists in
   client/js/period.js, Period.kt and Period.swift. The parity block below is
   what keeps this copy honest: it runs the server module and the web module
   over the same matrix of dates and configs and fails on any divergence, so a
   change to one is immediately a failing test on the other.

   (The Kotlin and Swift ports have no such guard — they can only be kept in
   step by hand. See the header comment in server/period.js.) */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as web from '../client/js/period.js';

const require = createRequire(import.meta.url);
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const srv = require(path.join(serverDir, 'period.js'));

/* ── The matrix ──────────────────────────────────────────────
   Deliberately includes month-length edges (28/29/30/31), year
   boundaries, the leap day, and both US DST transitions — rolling mode
   does raw millisecond arithmetic, which is exactly where a DST hour of
   drift could push the two implementations into different buckets. */
const DATES = [
  '2026-01-01', '2026-01-31', '2026-02-01', '2026-02-28',
  '2024-02-29',                                   // leap day
  '2026-03-07', '2026-03-08', '2026-03-09',       // spring forward (US)
  '2026-04-30', '2026-05-01', '2026-06-15',
  '2026-08-25', '2026-08-28', '2026-08-31',
  '2026-09-01', '2026-09-24', '2026-09-25',
  '2026-10-31', '2026-11-01', '2026-11-02',       // fall back (US)
  '2026-12-31', '2027-01-01',
];

const CONFIGS = [
  { mode: 'calendar' },
  { mode: 'startDay', startDay: 1 },
  { mode: 'startDay', startDay: 15 },
  { mode: 'startDay', startDay: 25 },
  { mode: 'startDay', startDay: 28 },
  { mode: 'rolling', length: 7 },
  { mode: 'rolling', length: 14 },
  { mode: 'rolling', length: 35 },
  { mode: 'rolling', length: 90 },
  { mode: 'rolling', length: 14, anchor: '2026-01-05' },
  { mode: 'rolling', length: 35, anchor: '2025-11-17' },
];

// Compare the shape both modules agree on, with dates as absolute instants.
function shape(b) {
  return b && {
    key: b.key, mode: b.mode,
    start: b.start.getTime(), end: b.end.getTime(),
  };
}

describe('period parity — server/period.js vs client/js/period.js', () => {
  it('periodBounds agrees on every date × config', () => {
    const mismatches = [];
    for (const cfg of CONFIGS) {
      // Both modules normalize before use in production; normalize once here
      // so the comparison isn't just testing default-filling.
      const c = srv.getPeriodConfig({
        periodMode: cfg.mode, periodStartDay: cfg.startDay,
        periodLength: cfg.length, periodAnchor: cfg.anchor,
      });
      for (const d of DATES) {
        const a = shape(srv.periodBounds(d, c));
        const b = shape(web.periodBounds(d, c));
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          mismatches.push({ date: d, cfg: c, server: a, web: b });
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('boundsForKey agrees on every key the other produced', () => {
    const mismatches = [];
    for (const cfg of CONFIGS) {
      const c = srv.getPeriodConfig({
        periodMode: cfg.mode, periodStartDay: cfg.startDay,
        periodLength: cfg.length, periodAnchor: cfg.anchor,
      });
      for (const d of DATES) {
        const key = srv.periodBounds(d, c).key;
        const a = shape(srv.boundsForKey(key, c));
        const b = shape(web.boundsForKey(key, c));
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          mismatches.push({ key, cfg: c, server: a, web: b });
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('getPeriodConfig agrees, including on out-of-range and junk values', () => {
    const settings = [
      undefined, {}, { periodMode: 'nonsense' },
      { periodMode: 'startDay' },
      { periodMode: 'startDay', periodStartDay: 0 },      // below range → clamps to 1
      { periodMode: 'startDay', periodStartDay: 31 },     // above range → clamps to 28
      { periodMode: 'startDay', periodStartDay: '25' },   // numeric string
      { periodMode: 'startDay', periodStartDay: 'abc' },  // unparseable → default
      { periodMode: 'rolling', periodLength: 1 },         // below range → clamps to 7
      { periodMode: 'rolling', periodLength: 400 },       // above range → clamps to 90
      { periodMode: 'rolling', periodLength: null },
      { periodMode: 'rolling', periodAnchor: '2026-01-05' },
      { periodMode: 'rolling', periodAnchor: 'not-a-date' },
      { periodMode: 'rolling', periodAnchor: '2026-1-5' },  // unpadded → rejected
    ];
    for (const s of settings) {
      expect(srv.getPeriodConfig(s), JSON.stringify(s)).toEqual(web.getPeriodConfig(s));
    }
  });

  it('paymentInBounds agrees, including on legacy date-less rows', () => {
    const payments = [
      { date: '2026-08-24' }, { date: '2026-08-25' }, { date: '2026-09-24' },
      { date: '2026-09-25' }, { date: '2026-09-01' },
      { monthKey: '2026-09' },                      // date-less: calendar only
      { monthKey: '2026-08' },
      { date: '', monthKey: '2026-09' },            // empty date falls back
    ];
    const mismatches = [];
    for (const cfg of CONFIGS) {
      const c = srv.getPeriodConfig({
        periodMode: cfg.mode, periodStartDay: cfg.startDay,
        periodLength: cfg.length, periodAnchor: cfg.anchor,
      });
      const bounds = srv.periodBounds('2026-09-01', c);
      for (const p of payments) {
        const a = srv.paymentInBounds(p, bounds);
        const b = web.paymentInBounds(p, bounds);
        if (a !== b) mismatches.push({ p, cfg: c, server: a, web: b });
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('monthsInBounds agrees on every date × config', () => {
    const mismatches = [];
    for (const cfg of CONFIGS) {
      const c = srv.getPeriodConfig({
        periodMode: cfg.mode, periodStartDay: cfg.startDay,
        periodLength: cfg.length, periodAnchor: cfg.anchor,
      });
      for (const d of DATES) {
        const bounds = srv.periodBounds(d, c);
        const a = srv.monthsInBounds(bounds);
        const b = web.monthsInBounds(bounds);
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          mismatches.push({ date: d, cfg: c, server: a, web: b });
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

/* Behaviour worth pinning independently of parity: a parity test passes just
   as happily when BOTH sides are wrong. */
describe('period — server behaviour', () => {
  it('calendar mode buckets by month with a YYYY-MM key', () => {
    const b = srv.periodBounds('2026-06-15', { mode: 'calendar' });
    expect(b.key).toBe('2026-06');
    expect(b.start.getMonth()).toBe(5);
    expect(b.end.getMonth()).toBe(6);
  });

  /* The exact case that motivated the port: with a start day of 25, Sept 1's
     period opens on Aug 25, so an Aug 28 payment is "this period". */
  it('startDay mode pulls an early-next-month due date into the prior period', () => {
    const cfg = { mode: 'startDay', startDay: 25, length: 35, anchor: null };
    const b = srv.periodBounds('2026-09-01', cfg);
    expect(b.key).toBe('2026-08-25');
    expect(srv.paymentInBounds({ date: '2026-08-28' }, b)).toBe(true);
    expect(srv.paymentInBounds({ date: '2026-08-24' }, b)).toBe(false);
    expect(srv.paymentInBounds({ date: '2026-09-25' }, b)).toBe(false);
  });

  it('a startDay period spanning two months reports both', () => {
    const cfg = { mode: 'startDay', startDay: 25, length: 35, anchor: null };
    expect(srv.monthsInBounds(srv.periodBounds('2026-09-01', cfg)))
      .toEqual(['2026-08', '2026-09']);
  });

  it('a date-less payment is unplaceable outside calendar mode', () => {
    const cfg = { mode: 'startDay', startDay: 25, length: 35, anchor: null };
    const b = srv.periodBounds('2026-09-01', cfg);
    expect(srv.paymentInBounds({ monthKey: '2026-08' }, b)).toBe(false);
    // ...but lands normally when the period IS the calendar month.
    const cal = srv.periodBounds('2026-08-01', { mode: 'calendar' });
    expect(srv.paymentInBounds({ monthKey: '2026-08' }, cal)).toBe(true);
  });

  it('returns null rather than guessing when the date is unparseable', () => {
    expect(srv.periodBounds('not-a-date', { mode: 'calendar' })).toBeNull();
    expect(srv.periodBounds(undefined, { mode: 'calendar' })).toBeNull();
  });

  /* The one intentional divergence from the web (see asDate in period.js), so
     it is pinned here rather than in the parity block. The web places a junk
     date at today; we place it nowhere. A corrupt payment date must never be
     able to silence a reminder — erring toward reminding is the safe
     direction. This matters because the naive parity check passes by accident
     whenever the period under test doesn't happen to contain the real
     current date. */
  it('never places a payment with an unparseable date', () => {
    const cfg = { mode: 'calendar', startDay: 1, length: 35, anchor: null };
    // The period containing today — where the web's today-fallback would
    // wrongly report a match.
    const now = new Date();
    const bounds = srv.periodBounds(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`,
      cfg,
    );
    for (const date of ['garbage', 'not-a-date', '', null, undefined]) {
      expect(srv.paymentInBounds({ date, type: 'bill' }, bounds), String(date)).toBe(false);
    }
  });
});
