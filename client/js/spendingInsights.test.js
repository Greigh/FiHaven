import { describe, it, expect } from 'vitest';
import { computeSpendingInsights } from './spendingInsights.js';

describe('computeSpendingInsights', () => {
  const cur = { start: new Date(2026, 5, 1), end: new Date(2026, 6, 1) };
  const prev = { start: new Date(2026, 4, 1), end: new Date(2026, 5, 1) };

  it('returns category deltas vs the previous period', () => {
    const tx = [
      { date: '2026-05-10', category: 'Dining', amount: 100 },
      { date: '2026-06-10', category: 'Dining', amount: 150 },
      { date: '2026-06-12', category: 'Groceries', amount: 80 },
    ];
    const rows = computeSpendingInsights(tx, cur, prev);
    const dining = rows.find((r) => r.cat === 'Dining');
    expect(dining).toMatchObject({ now: 150, was: 100, delta: 50, pct: 50 });
  });
});
