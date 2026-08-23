/* ═══════════════════════════════════════════════════════════
   spendingInsights.js — period-over-period category deltas (Pro).
═══════════════════════════════════════════════════════════ */

// One implementation, in budgetRules.js — see the note there. Re-exported
// because this module is where callers (and the native mirror) look for it.
import { spentByCategory } from './budgetRules.js';

export { spentByCategory };

const CATS = ['Groceries', 'Dining', 'Shopping', 'Transport', 'Entertainment', 'Health', 'Bills', 'Other'];

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
