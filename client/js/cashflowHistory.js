/* ═══════════════════════════════════════════════════════════
   cashflowHistory.js — monthly income vs. spending, merged from
   both outflow stores with card-payment deduplication.

   FiHaven records money leaving your pocket in TWO places:
     • transactions — purchases, typed by hand or imported from a
                      linked bank as source:'plaid'
     • payments     — bills and card payments marked paid

   Naively summing them double-counts. A CARD payment is a transfer
   between your own accounts, not an expenditure: the purchases it
   settles were already recorded as transactions on that card. So
   card payments never count as spending. Each month instead reports
   how much was held out (`cardPaymentsExcluded`) and whether any
   transaction coverage exists — a month with card payments and no
   transactions is BLIND, and the caller is expected to say so rather
   than draw a misleadingly low line.

   BILL payments ARE real outflows and are counted, minus any that
   duplicate a logged transaction (rent typed into Spending AND
   marked paid on the Bills tab). That match reuses reconcile.js's
   deliberately conservative looksSame.

   Income is NOT a recorded history: monthlyIncomeForMonth() projects
   today's configured income backwards over every month, varying only
   by incomeAdjustments. Rows carry `incomeProjected` so the UI can
   caption that honestly instead of implying it measured anything.

   Pure helpers — no storage imports, everything passed in, so the
   tests can drive it directly.
═══════════════════════════════════════════════════════════ */

import { looksSame } from './reconcile.js';
import { monthlyIncomeForMonth } from './income.js';
import { countsAsSpending } from './budgetRules.js';

const num = (v) => parseFloat(v) || 0;

// The "YYYY-MM" calendar bucket a dated record falls in. Falls back to a
// stored monthKey for date-less rows; a non-calendar period key ("YYYY-MM-DD")
// still slices down to the right calendar month.
export function monthKeyOf(rec) {
  const d = rec && rec.date;
  if (typeof d === 'string' && d.length >= 7) return d.slice(0, 7);
  const mk = rec && rec.monthKey;
  return typeof mk === 'string' && mk.length >= 7 ? mk.slice(0, 7) : '';
}

// A payment reshaped for reconcile.looksSame, which speaks {amount, merchant,
// date}. A payment's `name` ("Rent") plays the merchant role.
function matchable(p) {
  return { amount: num(p.amount), merchant: p.name || '', date: p.date || '' };
}

// Real (non-skipped) payment rows of one type. Skips are stored as payments
// with amount 0 and `skipped` set — they are not outflows.
function paymentsOfType(payments, type) {
  return (payments || []).filter((p) => p && !p.skipped && p.type === type);
}

/* Bill payments that duplicate an already-logged transaction. Each transaction
   backs at most one payment. Conservative by construction: looksSame requires a
   real name on BOTH sides (≥3 chars after normalizing) and a date within ±1 day,
   so an unnamed transaction never silently absorbs a bill. Returns
   `{ payment, transaction }` pairs. */
export function duplicateBillPayments(payments, transactions, dayTolerance) {
  const txs = transactions || [];
  const used = new Set();
  const dups = [];
  for (const p of paymentsOfType(payments, 'bill')) {
    const m = txs.find((t) => !used.has(t.id) && looksSame(matchable(p), t, dayTolerance));
    if (m) { used.add(m.id); dups.push({ payment: p, transaction: m }); }
  }
  return dups;
}

function emptyBucket() {
  return {
    spending: 0,
    fromTransactions: 0,
    fromBills: 0,
    cardPaymentsExcluded: 0,
    txCount: 0,
    blind: false,
  };
}

/* Per-calendar-month outflow, keyed "YYYY-MM". `spending` is the number to
   plot; the rest is provenance so the UI can explain the figure and flag where
   it can't be trusted. */
export function monthlySpending(payments, transactions, dayTolerance) {
  const out = {};
  const bucket = (mk) => (out[mk] = out[mk] || emptyBucket());

  (transactions || []).forEach((t) => {
    // A card payment is a transfer, not an outflow to plot — the purchases it
    // settles are already in this chart under their own months.
    if (!countsAsSpending(t)) return;
    const mk = monthKeyOf(t);
    if (!mk) return;
    const b = bucket(mk);
    b.fromTransactions += num(t.amount);
    b.txCount += 1;
  });

  const dupIds = new Set(
    duplicateBillPayments(payments, transactions, dayTolerance).map((d) => d.payment.id),
  );

  paymentsOfType(payments, 'bill').forEach((p) => {
    if (dupIds.has(p.id)) return;
    const mk = monthKeyOf(p);
    if (mk) bucket(mk).fromBills += num(p.amount);
  });

  // Transfers: recorded for disclosure, never added to spending.
  paymentsOfType(payments, 'card').forEach((p) => {
    const mk = monthKeyOf(p);
    if (mk) bucket(mk).cardPaymentsExcluded += num(p.amount);
  });

  Object.keys(out).forEach((mk) => {
    const b = out[mk];
    b.spending = b.fromTransactions + b.fromBills;
    // Card payments went out but nothing explains what was bought.
    b.blind = b.cardPaymentsExcluded > 0 && b.txCount === 0;
  });
  return out;
}

// Calendar month keys ending at `from` (default: this month), oldest first —
// chronological, the order a time series is read in.
export function monthKeysThrough(count, from) {
  const keys = [];
  const d = from ? new Date(from) : new Date();
  d.setDate(1);
  for (let i = 0; i < Math.max(0, count); i++) {
    keys.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    d.setMonth(d.getMonth() - 1);
  }
  return keys.reverse();
}

/* The chart's rows, oldest → newest.

   The window is CLAMPED to start at the first month with any outflow record.
   Income synthesizes arbitrarily far back, so an unclamped window would draw
   full income against zero spending for every month before the user started
   logging — an enormous fake surplus tapering into reality exactly where the
   real data begins.

   opts: { settings, payments, transactions, months = 18, from, dayTolerance } */
export function cashflowSeries(opts) {
  const o = opts || {};
  const byMonth = monthlySpending(o.payments, o.transactions, o.dayTolerance);
  const recorded = Object.keys(byMonth)
    .filter((mk) => byMonth[mk].spending > 0 || byMonth[mk].cardPaymentsExcluded > 0)
    .sort();

  if (recorded.length === 0) {
    return { rows: [], blindMonths: 0, incomeProjected: true, firstRecorded: '' };
  }

  const earliest = recorded[0];
  const keys = monthKeysThrough(Math.max(1, o.months || 18), o.from)
    .filter((mk) => mk >= earliest);

  const rows = keys.map((mk) => {
    const b = byMonth[mk];
    const income = monthlyIncomeForMonth(o.settings, mk);
    const spending = b ? b.spending : 0;
    return {
      mk,
      income,
      spending,
      net: income - spending,
      fromTransactions: b ? b.fromTransactions : 0,
      fromBills: b ? b.fromBills : 0,
      cardPaymentsExcluded: b ? b.cardPaymentsExcluded : 0,
      // No bucket at all inside the window is just as blind as card-payments-
      // with-no-transactions: a zero here would be a fabricated zero.
      blind: b ? b.blind : true,
    };
  });

  return {
    rows,
    blindMonths: rows.filter((r) => r.blind).length,
    // Always true today — income is derived from current settings, not stored
    // per month. Flip this when income gains real per-month history.
    incomeProjected: true,
    firstRecorded: earliest,
  };
}
