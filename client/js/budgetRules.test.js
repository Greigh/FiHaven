import { describe, it, expect } from 'vitest';
import {
  budgetRuleMode,
  budgetRuleSplits,
  billBucket,
  spendingBucket,
  computeBudgetLens,
  computeRatioWarnings,
  obligationsTotal,
  PRESET_SPLITS,
  DEFAULT_SPLITS,
  HOUSING_RATIO_LIMIT,
} from './budgetRules.js';

describe('budgetRuleMode', () => {
  it('defaults to off', () => {
    expect(budgetRuleMode({})).toBe('off');
  });
  it('recognizes presets and lenses', () => {
    expect(budgetRuleMode({ budgetRule: '50-30-20' })).toBe('50-30-20');
    expect(budgetRuleMode({ budgetRule: '80-20' })).toBe('80-20');
    expect(budgetRuleMode({ budgetRule: 'obligations-first' })).toBe('obligations-first');
    expect(budgetRuleMode({ budgetRule: 'debt-focus' })).toBe('debt-focus');
    expect(budgetRuleMode({ budgetRule: 'envelope' })).toBe('envelope');
  });
});

describe('budgetRuleSplits', () => {
  it('returns preset splits', () => {
    expect(budgetRuleSplits({ budgetRule: '80-20' })).toEqual(PRESET_SPLITS['80-20']);
    expect(budgetRuleSplits({ budgetRule: '50-30-20' })).toEqual(DEFAULT_SPLITS);
  });
  it('normalizes custom splits to 100', () => {
    const s = budgetRuleSplits({ budgetRule: 'custom', budgetRuleSplits: { needs: 40, wants: 40, save: 20 } });
    expect(s.needs + s.wants + s.save).toBe(100);
  });
});

describe('obligations-first lens', () => {
  const periodBounds = { start: new Date(2026, 5, 1), end: new Date(2026, 6, 1) };
  it('computes safe to spend', () => {
    const lens = computeBudgetLens({
      settings: { budgetRule: 'obligations-first' },
      income: 5000,
      bills: [{ id: 1, category: 'Housing', amount: 1500 }],
      cards: [{ id: 1, minPayment: 100 }],
      goals: [{ id: 'g1', target: 6000, saved: 0, targetDate: '2027-01-01' }],
      periodBounds,
      billDueInPeriod: () => true,
      mk: '2026-06',
    });
    expect(lens.headline.label).toBe('Safe to spend');
    expect(lens.headline.amount).toBeLessThan(5000 - 1600);
  });
});

describe('debt-focus lens', () => {
  it('includes extra debt payment from settings', () => {
    const lens = computeBudgetLens({
      settings: { budgetRule: 'debt-focus', debtFocusExtra: 200 },
      income: 4000,
      bills: [],
      cards: [{ id: 1, minPayment: 150 }],
      periodBounds: { start: new Date(2026, 5, 1), end: new Date(2026, 6, 1) },
      billDueInPeriod: () => true,
      mk: '2026-06',
    });
    const extra = lens.rows.find((r) => r.key === 'extra');
    expect(extra.actual).toBe(200);
    expect(lens.headline.amount).toBe(4000 - 150 - 200);
  });
});

describe('envelope lens', () => {
  it('locks without Pro', () => {
    const lens = computeBudgetLens({
      settings: { budgetRule: 'envelope', categoryBudgets: { Dining: 200 } },
      income: 3000,
      bills: [],
      cards: [],
      goals: [],
      isPro: false,
      periodBounds: { start: new Date(2026, 5, 1), end: new Date(2026, 6, 1) },
      billDueInPeriod: () => true,
      mk: '2026-06',
    });
    expect(lens.proLocked).toBe(true);
  });
  it('shows unassigned when Pro', () => {
    const lens = computeBudgetLens({
      settings: { budgetRule: 'envelope', categoryBudgets: { Dining: 200 } },
      income: 3000,
      bills: [{ id: 1, category: 'Utilities', amount: 100 }],
      cards: [],
      goals: [],
      isPro: true,
      periodBounds: { start: new Date(2026, 5, 1), end: new Date(2026, 6, 1) },
      billDueInPeriod: () => true,
      mk: '2026-06',
    });
    expect(lens.proLocked).toBe(false);
    expect(lens.headline.amount).toBe(3000 - 100 - 200);
  });
});

describe('ratio warnings', () => {
  it('flags housing over 30%', () => {
    const warnings = computeRatioWarnings({
      income: 3000,
      bills: [{ id: 1, category: 'Housing', amount: 1200 }],
      cards: [],
      periodBounds: { start: new Date(2026, 5, 1), end: new Date(2026, 6, 1) },
      billDueInPeriod: () => true,
      mk: '2026-06',
    });
    expect(warnings.find((w) => w.key === 'housing').over).toBe(true);
    expect(warnings.find((w) => w.key === 'housing').pct).toBeGreaterThan(HOUSING_RATIO_LIMIT);
  });
});

describe('split lens', () => {
  it('assigns bill and card amounts to buckets', () => {
    const lens = computeBudgetLens({
      settings: { budgetRule: '50-30-20' },
      income: 4000,
      bills: [{ id: 1, category: 'Utilities', amount: 200 }],
      cards: [{ id: 1, minPayment: 50 }],
      transactions: [{ date: '2026-06-05', category: 'Entertainment', amount: 75 }],
      periodBounds: { start: new Date(2026, 5, 1), end: new Date(2026, 6, 1) },
      billDueInPeriod: () => true,
      mk: '2026-06',
    });
    const needs = lens.rows.find((r) => r.key === 'needs');
    expect(needs.actual).toBe(250);
    expect(billBucket('Subscriptions')).toBe('wants');
    expect(spendingBucket('Dining')).toBe('wants');
  });
});

describe('obligationsTotal', () => {
  it('sums bills in period and card mins', () => {
    const total = obligationsTotal({
      bills: [{ id: 1, amount: 100 }, { id: 2, amount: 50 }],
      cards: [{ id: 1, minPayment: 25 }],
      billDueInPeriod: () => true,
      periodBounds: {},
      mk: '2026-06',
    });
    expect(total).toBe(175);
  });
});
