/* ═══════════════════════════════════════════════════════════
   subscriptionsFinder.js — pure logic for the Subscriptions
   panel: flagged bills plus recurring transaction merchants.
═══════════════════════════════════════════════════════════ */

import { billEnded, nextBillDueDate } from './utils.js';
import {
  normalizeMerchantKey,
  subscriptionManageUrl,
  trialDaysLeft,
  trialEndingSoon,
} from './subscriptionLinks.js';

export const STALE_DAYS = 60;
export const TRIAL_REMINDER_DAYS = 3;
/** Amounts within this relative band count as “similar” for recurrence. */
export const AMOUNT_SIMILARITY = 0.15;

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

/** True when amounts are within AMOUNT_SIMILARITY of each other (relative to max). */
export function amountsSimilar(amts) {
  const nums = (amts || []).map((a) => Math.abs(parseFloat(a) || 0));
  if (nums.length < 2) return true;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (max < 0.005) return true;
  return (max - min) / max <= AMOUNT_SIMILARITY;
}

/** Group subscription items that look like the same service. */
export function findDuplicateGroups(items) {
  const byKey = {};
  items.forEach((item) => {
    const key = normalizeMerchantKey(item.name);
    if (!key) return;
    (byKey[key] = byKey[key] || []).push(item);
  });
  return Object.values(byKey).filter((g) => g.length > 1);
}

export function duplicateKeys(items) {
  const dupes = new Set();
  findDuplicateGroups(items).forEach((g) => g.forEach((i) => dupes.add(i.key)));
  return dupes;
}

/**
 * @param {object[]} bills
 * @param {object[]} transactions
 * @param {number} [now]
 * @param {{ declined?: string[] }} [opts] — normalized merchant keys to hide
 */
export function buildSubscriptionItems(bills, transactions, now = Date.now(), opts = {}) {
  const declined = new Set(
    (opts.declined || [])
      .map((k) => normalizeMerchantKey(k) || String(k || '').toLowerCase())
      .filter(Boolean)
  );
  const out = [];
  const trackedMerchantKeys = new Set();

  bills.forEach((b) => {
    if (b.archived) return;
    if (billEnded(b)) return;
    if (b.category === 'Subscriptions') {
      const trialEnds = b.trialEnds || null;
      const name = b.name || 'Subscription';
      const mk = normalizeMerchantKey(name);
      if (mk) trackedMerchantKeys.add(mk);
      out.push({
        key: 'bill-' + b.id,
        billId: b.id,
        merchantKey: mk,
        name,
        monthly: monthlyOfBill(b),
        amount: parseFloat(b.amount) || 0,
        source: 'bill',
        stale: false,
        priceUp: null,
        nextDue: nextBillDueDate(b),
        manageUrl: subscriptionManageUrl(b),
        trialEnds,
        trialDaysLeft: trialDaysLeft(trialEnds, now),
        trialSoon: trialEndingSoon(trialEnds, TRIAL_REMINDER_DAYS, now),
        duplicate: false,
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
    // Tighten false positives: ≥3 months, OR ≥2 months with similar amounts
    // and at least 2 charges.
    if (months.size < 2) return;
    if (list.length < 2) return;
    if (months.size < 3 && !amountsSimilar(list.map((t) => t.amount))) return;

    const sorted = list.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const latest = sorted[sorted.length - 1];
    const amts = list.map((t) => parseFloat(t.amount) || 0);
    const latestAmt = parseFloat(latest.amount) || 0;
    const minAmt = Math.min(...amts);
    const since = daysSince(latest.date, now);
    const name = latest.merchant;
    const mk = normalizeMerchantKey(name);
    if (mk && declined.has(mk)) return;
    if (mk && trackedMerchantKeys.has(mk)) return;

    out.push({
      key: 'tx-' + name,
      billId: null,
      merchantKey: mk,
      name,
      monthly: latestAmt,
      amount: latestAmt,
      source: 'tx',
      lastDate: latest.date,
      stale: since !== null && since > STALE_DAYS,
      priceUp: latestAmt > minAmt + 0.005 ? minAmt : null,
      manageUrl: subscriptionManageUrl({ name, business: name, notes: '' }),
      trialEnds: null,
      trialDaysLeft: null,
      trialSoon: false,
      duplicate: false,
    });
  });

  const dupes = duplicateKeys(out);
  out.forEach((item) => { item.duplicate = dupes.has(item.key); });

  out.sort((a, b) => b.monthly - a.monthly);
  return out;
}

export function trackedSubs(items) {
  return (items || []).filter((i) => i.source === 'bill');
}

export function candidateSubs(items) {
  return (items || []).filter((i) => i.source === 'tx');
}

export function totalMonthlySubs(items) {
  return items.reduce((sum, item) => sum + item.monthly, 0);
}

export function trialsEndingSoon(items, leadDays = TRIAL_REMINDER_DAYS) {
  return items.filter((i) => i.trialSoon || (i.trialDaysLeft !== null && i.trialDaysLeft >= 0 && i.trialDaysLeft <= leadDays));
}
