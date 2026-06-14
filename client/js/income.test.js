import { describe, it, expect } from 'vitest';
import {
  perMonthFor,
  monthlyOfSource,
  monthlyIncomeFromSettings,
  normalizeAdjustment,
  adjustmentAppliesTo,
  adjustmentsTotalForMonth,
  monthlyIncomeForMonth,
} from './income.js';

describe('income — perMonthFor', () => {
  it('maps every known frequency to its per-month factor', () => {
    expect(perMonthFor('weekly')).toBeCloseTo(52 / 12);
    expect(perMonthFor('biweekly')).toBeCloseTo(26 / 12);
    expect(perMonthFor('semimonthly')).toBe(2);
    expect(perMonthFor('monthly')).toBe(1);
    expect(perMonthFor('annual')).toBeCloseTo(1 / 12);
  });

  it('falls back to monthly for unknown/missing frequencies', () => {
    expect(perMonthFor('nonsense')).toBe(1);
    expect(perMonthFor(undefined)).toBe(1);
  });
});

describe('income — monthlyOfSource', () => {
  it('multiplies amount by the per-month factor', () => {
    expect(monthlyOfSource({ amount: '100', frequency: 'monthly' })).toBe(100);
    expect(monthlyOfSource({ amount: 1200, frequency: 'annual' })).toBeCloseTo(100);
    expect(monthlyOfSource({ amount: 100, frequency: 'biweekly' })).toBeCloseTo((100 * 26) / 12);
  });

  it('treats a non-numeric amount as 0', () => {
    expect(monthlyOfSource({ amount: 'x', frequency: 'weekly' })).toBe(0);
  });
});

describe('income — monthlyIncomeFromSettings', () => {
  it('sums recurring sources when settings.incomes is present', () => {
    const settings = {
      incomes: [
        { amount: 2000, frequency: 'monthly' },
        { amount: 1200, frequency: 'annual' },
      ],
    };
    expect(monthlyIncomeFromSettings(settings)).toBeCloseTo(2100);
  });

  it('falls back to the legacy single income field', () => {
    expect(monthlyIncomeFromSettings({ income: '3000' })).toBe(3000);
  });

  it('returns 0 for empty or missing settings', () => {
    expect(monthlyIncomeFromSettings({})).toBe(0);
    expect(monthlyIncomeFromSettings(null)).toBe(0);
  });
});

describe('income — adjustments', () => {
  it('normalizeAdjustment fills defaults and coerces kind', () => {
    const a = normalizeAdjustment({ amount: '50.5', kind: 'recurring' });
    expect(a.amount).toBe(50.5);
    expect(a.kind).toBe('recurring');
    expect(typeof a.id).toBe('string');
    expect(normalizeAdjustment({}).kind).toBe('once');
    expect(normalizeAdjustment({ kind: 'weird' }).kind).toBe('once');
  });

  it('adjustmentAppliesTo matches a one-time adjustment to its month only', () => {
    const once = { kind: 'once', monthKey: '2026-06' };
    expect(adjustmentAppliesTo(once, '2026-06')).toBe(true);
    expect(adjustmentAppliesTo(once, '2026-07')).toBe(false);
    expect(adjustmentAppliesTo(once, '')).toBe(false);
  });

  it('adjustmentAppliesTo respects a recurring start/end window', () => {
    const rec = { kind: 'recurring', startMonth: '2026-03', endMonth: '2026-08' };
    expect(adjustmentAppliesTo(rec, '2026-05')).toBe(true);
    expect(adjustmentAppliesTo(rec, '2026-02')).toBe(false); // before start
    expect(adjustmentAppliesTo(rec, '2026-09')).toBe(false); // after end
    // open-ended (no endMonth) keeps applying
    expect(adjustmentAppliesTo({ kind: 'recurring', startMonth: '2026-01' }, '2030-12')).toBe(true);
  });

  it('totals and effective income include only the applicable adjustments', () => {
    const settings = {
      income: 2000,
      incomeAdjustments: [
        { kind: 'once', monthKey: '2026-06', amount: 500 },         // applies
        { kind: 'once', monthKey: '2026-07', amount: 999 },         // wrong month
        { kind: 'recurring', startMonth: '2026-01', amount: -100 }, // applies (ongoing)
      ],
    };
    expect(adjustmentsTotalForMonth(settings, '2026-06')).toBe(400);   // 500 − 100
    expect(monthlyIncomeForMonth(settings, '2026-06')).toBe(2400);     // 2000 + 400
  });
});
