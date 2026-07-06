import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  billDueOn,
  nextBillDueDate,
  daysUntilBillDue,
  billDueInPeriod,
  billDueOnOrBeforeInPeriod,
  billFrequencySpec,
  billPeriodNoun,
  parseBillYmd,
  billAnchor,
} from './billSchedule.js';
import { boundsForKey } from './period.js';

describe('billSchedule — billFrequencySpec', () => {
  it('maps UI labels to interval specs', () => {
    expect(billFrequencySpec('Monthly')).toEqual({ unit: 'month', step: 1 });
    expect(billFrequencySpec('Quarterly')).toEqual({ unit: 'month', step: 3 });
    expect(billFrequencySpec('Weekly')).toEqual({ unit: 'day', step: 7 });
    expect(billFrequencySpec('Bi-weekly')).toEqual({ unit: 'day', step: 14 });
    expect(billFrequencySpec('Annually')).toEqual({ unit: 'month', step: 12 });
    expect(billFrequencySpec(undefined)).toEqual({ unit: 'month', step: 1 });
  });
});

describe('billSchedule — billPeriodNoun', () => {
  it('maps each frequency to its billing-cycle noun', () => {
    expect(billPeriodNoun('Monthly')).toBe('month');
    expect(billPeriodNoun('Quarterly')).toBe('quarter');
    expect(billPeriodNoun('Annually')).toBe('year');
    expect(billPeriodNoun('Weekly')).toBe('week');
    expect(billPeriodNoun('Bi-weekly')).toBe('cycle');
  });

  it('falls back to "month" for unknown or missing frequency', () => {
    expect(billPeriodNoun(undefined)).toBe('month');
    expect(billPeriodNoun('')).toBe('month');
    expect(billPeriodNoun('Fortnightly')).toBe('month');
  });
});

describe('billSchedule — parseBillYmd / billAnchor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15));
  });
  afterEach(() => vi.useRealTimers());

  it('parseBillYmd accepts YYYY-MM-DD and rejects junk', () => {
    expect(parseBillYmd('2026-06-15')?.getDate()).toBe(15);
    expect(parseBillYmd('')).toBeNull();
    expect(parseBillYmd('2026-06')).toBeNull();
    expect(parseBillYmd('2026-00-15')).toBeNull();
  });

  it('billAnchor prefers startDate, otherwise dueDay in January', () => {
    expect(billAnchor({ startDate: '2026-03-10' }).getDate()).toBe(10);
    expect(billAnchor({ dueDay: 20 }).getMonth()).toBe(0);
    expect(billAnchor({ dueDay: 20 }).getDate()).toBe(20);
  });
});

describe('billSchedule — recurrence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15)); // Jun 15 2026 local
  });
  afterEach(() => vi.useRealTimers());

  it('monthly bill is due every month on dueDay', () => {
    const bill = { dueDay: 20, frequency: 'Monthly' };
    expect(billDueOn(bill, new Date(2026, 5, 20))).toBe(true);
    expect(billDueOn(bill, new Date(2026, 6, 20))).toBe(true);
    expect(billDueOn(bill, new Date(2026, 5, 21))).toBe(false);
  });

  it('quarterly bill is due every 3 months from anchor month', () => {
    const bill = { dueDay: 15, frequency: 'Quarterly', startDate: '2026-01-15' };
    expect(billDueOn(bill, new Date(2026, 0, 15))).toBe(true);
    expect(billDueOn(bill, new Date(2026, 3, 15))).toBe(true);
    expect(billDueOn(bill, new Date(2026, 6, 15))).toBe(true);
    expect(billDueOn(bill, new Date(2026, 5, 15))).toBe(false);
    expect(billDueOn(bill, new Date(2026, 1, 15))).toBe(false);
  });

  it('weekly bill recurs every 7 days from startDate', () => {
    const bill = { dueDay: 1, frequency: 'Weekly', startDate: '2026-06-01' };
    expect(billDueOn(bill, new Date(2026, 5, 15))).toBe(true);
    expect(billDueOn(bill, new Date(2026, 5, 16))).toBe(false);
    expect(nextBillDueDate(bill)?.getDate()).toBe(15);
  });

  it('daysUntilBillDue looks forward to the next occurrence', () => {
    const bill = { dueDay: 20, frequency: 'Monthly' };
    expect(daysUntilBillDue(bill)).toBe(5);
  });

  it('billDueInPeriod is false when no due date falls in the period', () => {
    const bill = { dueDay: 5, frequency: 'Quarterly', startDate: '2026-01-05' };
    const jul = boundsForKey('2026-07', { mode: 'calendar', startDay: 1, length: 35 });
    expect(billDueInPeriod(bill, jul)).toBe(true);
    const feb = boundsForKey('2026-02', { mode: 'calendar', startDay: 1, length: 35 });
    expect(billDueInPeriod(bill, feb)).toBe(false);
  });

  it('bi-weekly and annual bills follow their step intervals', () => {
    const biweekly = { dueDay: 1, frequency: 'Bi-weekly', startDate: '2026-06-01' };
    expect(billDueOn(biweekly, new Date(2026, 5, 15))).toBe(true);
    expect(billDueOn(biweekly, new Date(2026, 5, 29))).toBe(true);
    expect(billDueOn(biweekly, new Date(2026, 5, 16))).toBe(false);

    const annual = { dueDay: 10, frequency: 'Annually', startDate: '2025-06-10' };
    expect(billDueOn(annual, new Date(2026, 5, 10))).toBe(true);
    expect(billDueOn(annual, new Date(2027, 5, 10))).toBe(true);
    expect(billDueOn(annual, new Date(2026, 6, 10))).toBe(false);
  });

  it('billDueOnOrBeforeInPeriod returns the latest due date on or before asOf', () => {
    const bill = { dueDay: 5, frequency: 'Monthly' };
    const bounds = boundsForKey('2026-06', { mode: 'calendar', startDay: 1, length: 35 });
    const asOf = new Date(2026, 5, 20);
    expect(billDueOnOrBeforeInPeriod(bill, bounds, asOf)?.getDate()).toBe(5);
  });

  it('billDueInPeriod falls back to today when bounds are missing', () => {
    expect(billDueInPeriod({ dueDay: 15, frequency: 'Monthly' }, null)).toBe(true);
    expect(billDueInPeriod({
      dueDay: 1,
      frequency: 'Weekly',
      startDate: '2026-06-02',
    }, null)).toBe(false);
  });

  it('nextBillDueDate returns null when no due metadata exists', () => {
    expect(nextBillDueDate({})).toBeNull();
  });
});
