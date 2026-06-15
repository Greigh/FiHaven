import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  billDueOn,
  nextBillDueDate,
  daysUntilBillDue,
  billDueOnOrBeforeInPeriod,
  monthBoundsFromParts,
  atMidnight,
  ymd,
} = require('./billSchedule');

describe('server billSchedule — billDueOn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15));
  });
  afterEach(() => vi.useRealTimers());

  it('monthly bill is due on dueDay each month', () => {
    const bill = { dueDay: 20, frequency: 'Monthly' };
    expect(billDueOn(bill, new Date(2026, 5, 20))).toBe(true);
    expect(billDueOn(bill, new Date(2026, 5, 21))).toBe(false);
  });

  it('weekly bill recurs every 7 days from startDate', () => {
    const bill = { dueDay: 1, frequency: 'Weekly', startDate: '2026-06-01' };
    expect(billDueOn(bill, new Date(2026, 5, 15))).toBe(true);
    expect(billDueOn(bill, new Date(2026, 5, 16))).toBe(false);
  });

  it('respects bill active window via startDate/endDate', () => {
    const bill = { dueDay: 15, frequency: 'Monthly', endDate: '2026-06-10' };
    expect(billDueOn(bill, new Date(2026, 5, 15))).toBe(false);
    expect(billDueOn(bill, new Date(2026, 4, 15))).toBe(true);
  });

  it('handles bi-weekly, quarterly, and annual frequencies', () => {
    const biweekly = { dueDay: 1, frequency: 'Bi-weekly', startDate: '2026-06-01' };
    expect(billDueOn(biweekly, new Date(2026, 5, 29))).toBe(true);

    const quarterly = { dueDay: 15, frequency: 'Quarterly', startDate: '2026-01-15' };
    expect(billDueOn(quarterly, new Date(2026, 3, 15))).toBe(true);
    expect(billDueOn(quarterly, new Date(2026, 4, 15))).toBe(false);

    const annual = { dueDay: 10, frequency: 'Annually', startDate: '2025-06-10' };
    expect(billDueOn(annual, new Date(2026, 5, 10))).toBe(true);
    expect(billDueOn(annual, new Date(2026, 6, 10))).toBe(false);
  });
});

describe('server billSchedule — nextBillDueDate / daysUntilBillDue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15));
  });
  afterEach(() => vi.useRealTimers());

  it('nextBillDueDate finds the next occurrence', () => {
    const bill = { dueDay: 20, frequency: 'Monthly' };
    expect(nextBillDueDate(bill)?.getDate()).toBe(20);
  });

  it('daysUntilBillDue counts days until the next due date', () => {
    const bill = { dueDay: 20, frequency: 'Monthly' };
    expect(daysUntilBillDue(bill)).toBe(5);
  });

  it('returns a large sentinel when no due date exists', () => {
    expect(daysUntilBillDue({})).toBe(9999);
  });
});

describe('server billSchedule — billDueOnOrBeforeInPeriod', () => {
  it('returns the latest due date in the period on or before asOf', () => {
    const bill = { dueDay: 5, frequency: 'Monthly' };
    const bounds = monthBoundsFromParts({ y: 2026, m: 6, d: 20 });
    const asOf = atMidnight(new Date(2026, 5, 20));
    expect(billDueOnOrBeforeInPeriod(bill, bounds, asOf)?.getDate()).toBe(5);
  });

  it('returns null when nothing is due yet in the period', () => {
    const bill = { dueDay: 25, frequency: 'Monthly' };
    const bounds = monthBoundsFromParts({ y: 2026, m: 6, d: 10 });
    expect(billDueOnOrBeforeInPeriod(bill, bounds, atMidnight(new Date(2026, 5, 10)))).toBeNull();
  });
});

describe('server billSchedule — helpers', () => {
  it('monthBoundsFromParts builds calendar-month bounds', () => {
    const bounds = monthBoundsFromParts({ y: 2026, m: 6, d: 15 });
    expect(bounds.start).toEqual(new Date(2026, 5, 1));
    expect(bounds.end).toEqual(new Date(2026, 6, 1));
  });

  it('ymd formats a local date as YYYY-MM-DD', () => {
    expect(ymd(new Date(2026, 5, 7))).toBe('2026-06-07');
  });

  it('nextBillDueDate advances from startDate when fromDate is earlier', () => {
    const bill = { dueDay: 15, frequency: 'Monthly', startDate: '2026-06-15' };
    const from = atMidnight(new Date(2026, 5, 1));
    expect(nextBillDueDate(bill, from)?.getDate()).toBe(15);
  });

  it('billDueOnOrBeforeInPeriod returns null without valid bounds', () => {
    const bill = { dueDay: 5, frequency: 'Monthly' };
    expect(billDueOnOrBeforeInPeriod(bill, null, new Date())).toBeNull();
    expect(billDueOnOrBeforeInPeriod(bill, {}, new Date())).toBeNull();
  });

  it('nextBillDueDate returns null when the bill has no due metadata', () => {
    expect(nextBillDueDate({})).toBeNull();
  });
});
