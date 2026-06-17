import { describe, it, expect } from 'vitest';
import {
  periodBounds,
  paymentInBounds,
  getPeriodConfig,
  shiftPeriod,
  boundsForKey,
  periodKeyForPayment,
  periodLabel,
  periodKeyLabel,
} from './period.js';

describe('period — periodBounds', () => {
  it('calendar mode buckets by month with a YYYY-MM key', () => {
    const b = periodBounds('2026-06-15', { mode: 'calendar' });
    expect(b.key).toBe('2026-06');
    expect(b.start.getMonth()).toBe(5); // June (0-based)
    expect(b.end.getMonth()).toBe(6);   // July 1, exclusive
  });

  it('startDay mode anchors the period on the configured day', () => {
    // A date before the start day belongs to the previous month's period.
    const b = periodBounds('2026-06-10', { mode: 'startDay', startDay: 25 });
    expect(b.start.getDate()).toBe(25);
    expect(b.start.getMonth()).toBe(4); // May 25
    expect(b.key).toBe('2026-05-25');
  });

  it('rolling mode produces fixed-length buckets', () => {
    const b = periodBounds('2026-06-15', { mode: 'rolling', length: 30 });
    const days = Math.round((b.end - b.start) / 864e5);
    expect(days).toBe(30);
  });

  it('rolling mode honors a custom start anchor', () => {
    // Buckets begin on the anchor date; Jun 15 is in [Jun 10, Jul 10).
    const cfg = { mode: 'rolling', length: 30, anchor: '2026-06-10' };
    const b = periodBounds('2026-06-15', cfg);
    expect(b.key).toBe('2026-06-10');
    expect(b.start.getDate()).toBe(10);
    expect(b.start.getMonth()).toBe(5); // June
    // The day before the anchor falls in the previous bucket.
    const prev = periodBounds('2026-06-09', cfg);
    expect(prev.key).toBe('2026-05-11');
  });
});

describe('period — getPeriodConfig', () => {
  it('clamps invalid values to safe defaults', () => {
    const cfg = getPeriodConfig({ periodMode: 'rolling', periodStartDay: 99, periodLength: 3 });
    expect(cfg.mode).toBe('rolling');
    expect(cfg.startDay).toBe(1);  // 99 out of [1,28] → 1
    expect(cfg.length).toBe(35);   // 3 below the 7-day floor → default 35
  });

  it('defaults an unknown mode to calendar', () => {
    expect(getPeriodConfig({ periodMode: 'whatever' }).mode).toBe('calendar');
  });
});

describe('period — paymentInBounds', () => {
  const june = periodBounds('2026-06-15', { mode: 'calendar' });

  it('matches a payment whose date is inside [start, end)', () => {
    expect(paymentInBounds({ date: '2026-06-01' }, june)).toBe(true);
    expect(paymentInBounds({ date: '2026-06-30' }, june)).toBe(true);
  });

  it('rejects payments on or after the end, or before the start', () => {
    expect(paymentInBounds({ date: '2026-07-01' }, june)).toBe(false);
    expect(paymentInBounds({ date: '2026-05-31' }, june)).toBe(false);
  });

  it('is false without a payment or bounds', () => {
    expect(paymentInBounds(null, june)).toBe(false);
    expect(paymentInBounds({ date: '2026-06-10' }, null)).toBe(false);
  });

  it('places a date-less record by monthKey only in calendar mode', () => {
    expect(paymentInBounds({ monthKey: '2026-06' }, june)).toBe(true);
    expect(paymentInBounds({ monthKey: '2026-05' }, june)).toBe(false);
    // Non-calendar bounds can't place a date-less record.
    const roll = periodBounds('2026-06-15', { mode: 'rolling', length: 30 });
    expect(paymentInBounds({ monthKey: roll.key }, roll)).toBe(false);
  });
});

describe('period — shiftPeriod', () => {
  it('moves a calendar period forward and back by whole months', () => {
    const cfg = { mode: 'calendar' };
    const june = periodBounds('2026-06-15', cfg);
    expect(shiftPeriod(june, 1, cfg).key).toBe('2026-07');
    expect(shiftPeriod(june, -1, cfg).key).toBe('2026-05');
    expect(shiftPeriod(june, 0, cfg).key).toBe('2026-06');
  });

  it('shifts rolling buckets by their length', () => {
    const cfg = { mode: 'rolling', length: 30 };
    const b = periodBounds('2026-06-15', cfg);
    const next = shiftPeriod(b, 1, cfg);
    expect(Math.round((next.start - b.start) / 864e5)).toBe(30);
  });
});

describe('period — boundsForKey', () => {
  it('round-trips a startDay key back to the same period', () => {
    const cfg = { mode: 'startDay', startDay: 25 };
    const b = periodBounds('2026-06-10', cfg); // key 2026-05-25
    expect(boundsForKey(b.key, cfg).key).toBe(b.key);
  });

  it('round-trips a rolling key back to the same period', () => {
    const cfg = { mode: 'rolling', length: 30 };
    const b = periodBounds('2026-06-15', cfg);
    const roundTrip = boundsForKey(b.key, cfg);
    expect(roundTrip.key).toBe(b.key);
    expect(roundTrip.start.getTime()).toBe(b.start.getTime());
    expect(roundTrip.end.getTime()).toBe(b.end.getTime());
  });
});

describe('period — periodKeyForPayment', () => {
  const cfg = { mode: 'calendar' };
  it('uses the payment date when present', () => {
    expect(periodKeyForPayment({ date: '2026-06-15' }, cfg)).toBe('2026-06');
  });
  it('falls back to a dateless record’s stored monthKey', () => {
    expect(periodKeyForPayment({ monthKey: '2026-04' }, cfg)).toBe('2026-04');
    expect(periodKeyForPayment({}, cfg)).toBe('');
  });
});

describe('period — periodLabel', () => {
  it('renders a calendar month label', () => {
    const b = periodBounds('2026-06-15', { mode: 'calendar' });
    expect(periodLabel(b, { mode: 'calendar' })).toBe('June 2026');
  });
  it('returns empty for null bounds', () => {
    expect(periodLabel(null)).toBe('');
  });

  it('renders a non-calendar period as a start–end range', () => {
    const cfg = { mode: 'rolling', length: 30 };
    const b = periodBounds('2026-06-15', cfg);
    const label = periodLabel(b, cfg);
    expect(label).toContain('–');                 // a date range, not a single month
    expect(label).toMatch(/\d{4}/);               // includes the year
  });
});

describe('period — periodKeyLabel', () => {
  it('labels a calendar key', () => {
    expect(periodKeyLabel('2026-06', { mode: 'calendar' })).toBe('June 2026');
  });
  it('labels a rolling key as a range', () => {
    const cfg = { mode: 'rolling', length: 30 };
    const key = periodBounds('2026-06-15', cfg).key;
    expect(periodKeyLabel(key, cfg)).toContain('–');
  });
});
