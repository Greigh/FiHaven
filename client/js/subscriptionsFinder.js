/* ═══════════════════════════════════════════════════════════
   subscriptionsFinder.js — pure logic for the Subscriptions
   panel: flagged bills plus recurring transaction merchants.
═══════════════════════════════════════════════════════════ */

import { billEnded, nextBillDueDate } from './utils.js';

export const STALE_DAYS = 60;

export function monthlyOfBill(b) {
  const a = parseFloat(b.amount) || 0;
  switch (b.frequency) {
    case 'Weekly': return (a * 52) / 12;
    case 'Bi-weekly': return (a * 26) / 12;
    case 'Quarterly': return a / 3;
    case 'Annually': return a / 12;
    default: return a;
  }
}

export function daysSince(iso, now = Date.now()) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return Math.floor((now - new Date(y, m - 1, d)) / 864e5);
}

export function buildSubscriptionItems(bills, transactions, now = Date.now()) {
  const out = [];

  bills.forEach((b) => {
    if (billEnded(b)) return;
    if (b.category === 'Subscriptions') {
      out.push({
        key: 'bill-' + b.id,
        name: b.name || 'Subscription',
        monthly: monthlyOfBill(b),
        amount: parseFloat(b.amount) || 0,
        source: 'bill',
        stale: false,
        priceUp: null,
        nextDue: nextBillDueDate(b),
      });
    }
  });

  const byMerchant = {};
  transactions.forEach((t) => {
    const k = (t.merchant || '').trim().toLowerCase();
    if (!k) return;
    (byMerchant[k] = byMerchant[k] || []).push(t);
  });

  Object.values(byMerchant).forEach((list) => {
    const months = new Set(list.map((t) => (t.date || '').slice(0, 7)));
    if (months.size < 2) return;

    const sorted = list.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const latest = sorted[sorted.length - 1];
    const amts = list.map((t) => parseFloat(t.amount) || 0);
    const latestAmt = parseFloat(latest.amount) || 0;
    const minAmt = Math.min(...amts);
    const since = daysSince(latest.date, now);

    out.push({
      key: 'tx-' + (latest.merchant || ''),
      name: latest.merchant,
      monthly: latestAmt,
      amount: latestAmt,
      source: 'tx',
      lastDate: latest.date,
      stale: since !== null && since > STALE_DAYS,
      priceUp: latestAmt > minAmt + 0.005 ? minAmt : null,
    });
  });

  out.sort((a, b) => b.monthly - a.monthly);
  return out;
}

export function totalMonthlySubs(items) {
  return items.reduce((sum, item) => sum + item.monthly, 0);
}
