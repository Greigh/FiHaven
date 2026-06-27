/* ═══════════════════════════════════════════════════════════
   reconcile.js — bank-vs-manual transaction reconciliation.

   FiHaven is manual-first; a linked bank (Plaid) adds transactions
   tagged source:'plaid' ALONGSIDE the manual ones, never replacing
   them. That means the same purchase can appear twice — once typed
   by hand, once from the bank. This module finds those overlaps so
   the user can audit them, and surfaces bank rows that have no
   manual match ("the bank found these").

   Matching is deliberately conservative: same amount (to the cent),
   a similar merchant name, and a date within ±1 day (settlement vs.
   purchase date often differ by a day). It's a SUGGESTION — the user
   decides what to keep; nothing is auto-deleted.

   Pure helpers, mirrored by Reconcile.swift / Reconcile.kt — change
   all three together.
═══════════════════════════════════════════════════════════ */

import { today } from './tz.js';

const DAY = 864e5;

// Normalize a merchant for fuzzy matching: lowercase, alphanumerics only.
function normMerchant(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseYmd(s) {
  if (!s) return null;
  const p = String(s).slice(0, 10).split('-').map(Number);
  if (p.length < 3 || !p[0] || !p[1] || !p[2]) return null;
  return new Date(p[0], p[1] - 1, p[2]);
}

// Do two transactions look like the SAME purchase? Same amount (to the cent),
// merchant names that contain one another (after normalizing), and dates within
// `dayTolerance` days (default 1 — a settlement/purchase off-by-one).
export function looksSame(a, b, dayTolerance) {
  const tol = dayTolerance == null ? 1 : dayTolerance;
  if (Math.abs((Number(a.amount) || 0) - (Number(b.amount) || 0)) > 0.01) return false;
  const am = normMerchant(a.merchant);
  const bm = normMerchant(b.merchant);
  // Require a real merchant on both sides; one name must contain the other.
  if (am.length < 3 || bm.length < 3) return false;
  if (!am.includes(bm) && !bm.includes(am)) return false;
  const da = parseYmd(a.date);
  const db = parseYmd(b.date);
  if (!da || !db) return false;
  return Math.abs(Math.round((da - db) / DAY)) <= tol;
}

// Pairs where a bank (plaid) transaction duplicates a manual one — the audit
// queue. Each manual and each bank row is paired at most once. Newest bank
// row first. `{ manual, bank }`.
export function duplicatePairs(transactions, dayTolerance) {
  const list = transactions || [];
  const manual = list.filter((t) => t.source !== 'plaid');
  const bank = list.filter((t) => t.source === 'plaid')
    .slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const usedManual = new Set();
  const pairs = [];
  for (const b of bank) {
    const m = manual.find((x) => !usedManual.has(x.id) && looksSame(x, b, dayTolerance));
    if (m) { usedManual.add(m.id); pairs.push({ manual: m, bank: b }); }
  }
  return pairs;
}

// Bank transactions with NO manual counterpart — purchases the bank caught that
// you never logged. Newest first. (These are already in the list; this just
// lets the UI call them out for review.)
export function unmatchedBank(transactions, dayTolerance) {
  const dupBankIds = new Set(duplicatePairs(transactions, dayTolerance).map((p) => p.bank.id));
  return (transactions || [])
    .filter((t) => t.source === 'plaid' && !dupBankIds.has(t.id))
    .slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// Manual transactions the linked bank did NOT corroborate within `staleDays`
// (default 35) of today — i.e. ones the bank "seems to be missing". Recent
// enough that the bank should have reported them by now; useful to spot a
// fat-fingered entry or a transaction on an unlinked account. Newest first.
export function unconfirmedManual(transactions, staleDays, date) {
  const stale = staleDays == null ? 35 : staleDays;
  const now = date || today();
  const cutoff = new Date(now.getTime() - stale * DAY);
  const list = transactions || [];
  const bank = list.filter((t) => t.source === 'plaid');
  return list
    .filter((t) => {
      if (t.source === 'plaid') return false;
      const d = parseYmd(t.date);
      if (!d || d < cutoff || d > now) return false;     // only recent manual rows
      return !bank.some((b) => looksSame(t, b));          // no bank corroboration
    })
    .slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
