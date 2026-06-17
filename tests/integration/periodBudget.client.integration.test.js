import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  periodBounds,
  shiftPeriod,
  paymentInBounds,
  getPeriodConfig,
} from '../../client/js/period.js';
import {
  periodIncome,
  adjustmentsTotalForPeriod,
} from '../../client/js/income.js';
import {
  setBills,
  setCards,
  setPayments,
  setSettings,
} from '../../client/js/storage.svelte.js';
import {
  isPaid,
  paidAmount,
  goalAmountFor,
  periodObligationItems,
  buildUpcomingItems,
} from '../../client/js/utils.js';
import { billDueInPeriod } from '../../client/js/billSchedule.js';
import * as tz from '../../client/js/tz.js';

describe('integration — rolling period budget flow', () => {
  beforeEach(() => {
    vi.spyOn(tz, 'today').mockReturnValue(new Date(2026, 5, 15)); // Jun 15 2026
    setSettings({
      periodMode: 'rolling',
      periodLength: 30,
      periodStartDay: 1,
      income: 6000,
      paidGoal: 'minimum',
    });
    setBills([
      { id: 'B1', name: 'Rent', amount: 1500, dueDay: 20, frequency: 'Monthly' },
      { id: 'B2', name: 'Quarterly', amount: 300, dueDay: 15, frequency: 'Quarterly', startDate: '2026-01-15' },
    ]);
    setCards([
      { id: 'C1', name: 'Visa', balance: 800, minPayment: 35, dueDay: 25 },
    ]);
    setPayments([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks payments against a rolling bucket instead of calendar monthKey', () => {
    const cfg = getPeriodConfig();
    const bounds = periodBounds('2026-06-15', cfg);

    setPayments([
      { id: 'p1', type: 'bill', refId: 'B1', amount: 1500, date: '2026-06-18', monthKey: '2026-01' },
      { id: 'p2', type: 'card', refId: 'C1', amount: 35, date: '2026-06-10', monthKey: '2026-01' },
    ]);

    expect(paymentInBounds({ date: '2026-06-18' }, bounds)).toBe(true);
    // monthKey is ignored when a payment date is present — rolling bucket wins.
    expect(isPaid('bill', 'B1')).toBe(true);
    expect(isPaid('card', 'C1')).toBe(true);
    expect(paidAmount('bill', 'B1')).toBe(1500);
    expect(paidAmount('card', 'C1')).toBe(35);
  });

  it('shifts rolling periods without collapsing bucket boundaries', () => {
    const cfg = getPeriodConfig();
    const current = periodBounds('2026-06-15', cfg);
    const next = shiftPeriod(current, 1, cfg);
    const prev = shiftPeriod(current, -1, cfg);

    expect(Math.round((next.start - current.start) / 864e5)).toBe(30);
    expect(Math.round((current.start - prev.start) / 864e5)).toBe(30);
    expect(next.key).not.toBe(current.key);
  });

  it('prorates income and counts obligations for the active rolling window', () => {
    const cfg = getPeriodConfig();
    const bounds = periodBounds('2026-06-15', cfg);

    const income = periodIncome(
      {
        income: 6000,
        incomeAdjustments: [{ kind: 'once', monthKey: '2026-06', amount: 300 }],
      },
      bounds,
    );
    const base = 6000 * (30 / (365 / 12));
    const adj = adjustmentsTotalForPeriod(
      { incomeAdjustments: [{ kind: 'once', monthKey: '2026-06', amount: 300 }] },
      bounds,
    );

    expect(income).toBeCloseTo(base + adj, 0);
    expect(adj).toBeGreaterThan(0);
    expect(adj).toBeLessThan(300);

    expect(billDueInPeriod({ dueDay: 20, frequency: 'Monthly' }, bounds)).toBe(true);
    expect(goalAmountFor('card', 'C1')).toBe(35);

    const obligations = periodObligationItems([
      { type: 'card', refId: 'C1' },
      { type: 'bill', refId: 'B1' },
      { type: 'bill', refId: 'B2' },
    ], bounds);
    expect(obligations.map((o) => o.refId)).toContain('C1');
    expect(obligations.map((o) => o.refId)).toContain('B1');

    const upcoming = buildUpcomingItems();
    expect(upcoming.some((u) => u.name === 'Rent')).toBe(true);
    expect(upcoming.some((u) => u.name.includes('Visa'))).toBe(true);
  });
});

describe('integration — startDay period across month boundary', () => {
  beforeEach(() => {
    vi.spyOn(tz, 'today').mockReturnValue(new Date(2026, 5, 10)); // Jun 10
    setSettings({ periodMode: 'startDay', periodStartDay: 25, paidGoal: 'minimum' });
    setBills([{ id: 'B1', name: 'Rent', amount: 1500, dueDay: 1, frequency: 'Monthly' }]);
    setCards([]);
    setPayments([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('places a June 1 payment in the May-25 startDay period only', () => {
    const cfg = getPeriodConfig();
    const startDayBounds = periodBounds('2026-06-10', cfg);
    expect(startDayBounds.key).toBe('2026-05-25');

    setPayments([
      { id: 'p1', type: 'bill', refId: 'B1', amount: 1500, date: '2026-06-01', monthKey: '2026-06' },
    ]);

    expect(isPaid('bill', 'B1')).toBe(true);

    const nextPeriod = shiftPeriod(startDayBounds, 1, cfg);
    expect(isPaid('bill', 'B1', nextPeriod.key)).toBe(false);
  });
});

describe('integration — rolling period with a custom start anchor', () => {
  beforeEach(() => {
    vi.spyOn(tz, 'today').mockReturnValue(new Date(2026, 5, 15)); // Jun 15
    setSettings({
      periodMode: 'rolling',
      periodLength: 30,
      periodAnchor: '2026-06-10',
      paidGoal: 'minimum',
    });
    setBills([{ id: 'B1', name: 'Rent', amount: 1500, dueDay: 12, frequency: 'Monthly' }]);
    setCards([]);
    setPayments([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('anchors the active window to the chosen date, not the fixed epoch', () => {
    const cfg = getPeriodConfig();
    expect(cfg.anchor).toBe('2026-06-10');

    const bounds = periodBounds('2026-06-15', cfg);
    expect(bounds.key).toBe('2026-06-10');
    expect(bounds.start.getDate()).toBe(10);
    expect(Math.round((bounds.end - bounds.start) / 864e5)).toBe(30); // [Jun 10, Jul 10)
  });

  it('matches paid/owed against the anchored window, not the calendar month', () => {
    const cfg = getPeriodConfig();
    const bounds = periodBounds('2026-06-15', cfg);

    // A payment after the anchor (Jun 12) lands in the active window — even
    // though its stored monthKey is nonsense, the date wins.
    setPayments([
      { id: 'p1', type: 'bill', refId: 'B1', amount: 1500, date: '2026-06-12', monthKey: '2099-01' },
    ]);
    expect(paymentInBounds({ date: '2026-06-12' }, bounds)).toBe(true);
    expect(isPaid('bill', 'B1')).toBe(true);

    // A payment before the anchor (Jun 9) belongs to the previous window.
    setPayments([
      { id: 'p2', type: 'bill', refId: 'B1', amount: 1500, date: '2026-06-09', monthKey: '2099-01' },
    ]);
    expect(paymentInBounds({ date: '2026-06-09' }, bounds)).toBe(false);
    expect(isPaid('bill', 'B1')).toBe(false);
  });
});
