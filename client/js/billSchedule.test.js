import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  billDueOn,
  nextBillDueDate,
  daysUntilBillDue,
  billDueInPeriod,
  billFrequencySpec,
} from './billSchedule.js';
import { boundsForKey } from './period.js';

describe('billSchedule — billFrequencySpec', () => {
  it('maps UI labels to interval specs', () => {
    expect(billFrequencySpec('Monthly')).toEqual({ unit: 'month', step: 1 });
    expect(billFrequencySpec('Quarterly')).toEqual({ unit: 'month', step: 3 });
    expect(billFrequencySpec('Weekly')).toEqual({ unit: 'day', step: 7 });
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
});
