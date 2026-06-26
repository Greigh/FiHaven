/* ═══════════════════════════════════════════════════════════
   spendingInsights.js — period-over-period category deltas (Pro).
═══════════════════════════════════════════════════════════ */

import { transactionInPeriod } from './budgetRules.js';

const CATS = ['Groceries', 'Dining', 'Shopping', 'Transport', 'Entertainment', 'Health', 'Bills', 'Other'];

export function spentByCategory(transactions, periodBounds) {
  const m = {};
  (transactions || []).forEach((t) => {
    if (!transactionInPeriod(t, periodBounds)) return;
    const cat = t.category || 'Other';
    m[cat] = (m[cat] || 0) + (parseFloat(t.amount) || 0);
  });
  return m;
}

/**
 * Compare current vs previous period spending by category.
 * Returns rows sorted by absolute delta (largest swings first).
 */
export function computeSpendingInsights(transactions, currentBounds, prevBounds) {
  const cur = spentByCategory(transactions, currentBounds);
  const prev = spentByCategory(transactions, prevBounds);
  const cats = new Set([...CATS, ...Object.keys(cur), ...Object.keys(prev)]);

  const rows = [];
  cats.forEach((cat) => {
    const now = cur[cat] || 0;
    const was = prev[cat] || 0;
    if (now <= 0 && was <= 0) return;
    const delta = now - was;
    const pct = was > 0 ? Math.round((delta / was) * 100) : (now > 0 ? 100 : 0);
    rows.push({ cat, now, was, delta, pct });
  });

  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return rows;
}
