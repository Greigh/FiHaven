import { describe, it, expect } from 'vitest';
import {
  monthKeyOf,
  duplicateBillPayments,
  monthlySpending,
  monthKeysThrough,
  cashflowSeries,
} from './cashflowHistory.js';

const tx = (o) => ({
  id: o.id, date: o.date, amount: o.amount,
  merchant: o.merchant || '', category: o.category || 'Other',
  source: o.source || 'manual',
});
const pay = (o) => ({
  id: o.id, type: o.type, refId: o.refId || 'R1', name: o.name || '',
  amount: o.amount, date: o.date, monthKey: o.monthKey || (o.date || '').slice(0, 7),
  skipped: !!o.skipped,
});

describe('cashflowHistory — monthKeyOf', () => {
  it('buckets by the date, and falls back to monthKey when date-less', () => {
    expect(monthKeyOf({ date: '2026-06-15' })).toBe('2026-06');
    expect(monthKeyOf({ monthKey: '2026-04' })).toBe('2026-04');
    expect(monthKeyOf({})).toBe('');
  });

  it('slices a non-calendar period key down to its calendar month', () => {
    expect(monthKeyOf({ monthKey: '2026-06-25' })).toBe('2026-06');
  });
});

describe('cashflowHistory — card payments are transfers, not spending', () => {
  const payments = [
    pay({ id: 'c1', type: 'card', name: 'Chase Sapphire', amount: 800, date: '2026-06-05' }),
    pay({ id: 'b1', type: 'bill', name: 'Rent', amount: 1500, date: '2026-06-01' }),
  ];
  const txs = [
    tx({ id: 't1', date: '2026-06-10', amount: 120, merchant: 'Costco' }),
    tx({ id: 't2', date: '2026-06-12', amount: 45, merchant: 'Shell' }),
  ];

  it('excludes the card payment but counts bills and transactions', () => {
    const m = monthlySpending(payments, txs)['2026-06'];
    expect(m.spending).toBe(1665);            // 1500 rent + 165 purchases
    expect(m.cardPaymentsExcluded).toBe(800); // held out, reported
    expect(m.blind).toBe(false);
  });

  it('flags a month as blind when card payments have no transactions to explain them', () => {
    const m = monthlySpending(payments, [])['2026-06'];
    expect(m.spending).toBe(1500);            // the bill still counts
    expect(m.cardPaymentsExcluded).toBe(800);
    expect(m.blind).toBe(true);
  });

  it('ignores skipped payments entirely', () => {
    const skipped = [pay({ id: 's1', type: 'bill', name: 'Rent', amount: 0, date: '2026-06-01', skipped: true })];
    expect(monthlySpending(skipped, [])['2026-06']).toBeUndefined();
  });
});

describe('cashflowHistory — bill/transaction deduplication', () => {
  it('drops a bill payment already logged as a transaction', () => {
    const payments = [pay({ id: 'b1', type: 'bill', name: 'Verizon', amount: 90, date: '2026-06-03' })];
    const txs = [tx({ id: 't1', date: '2026-06-03', amount: 90, merchant: 'Verizon', category: 'Bills' })];
    expect(duplicateBillPayments(payments, txs).length).toBe(1);
    // Counted once, from the transaction side.
    expect(monthlySpending(payments, txs)['2026-06'].spending).toBe(90);
  });

  it('keeps both when the transaction has no merchant to match on', () => {
    const payments = [pay({ id: 'b1', type: 'bill', name: 'Verizon', amount: 90, date: '2026-06-03' })];
    const txs = [tx({ id: 't1', date: '2026-06-03', amount: 90, merchant: '' })];
    expect(duplicateBillPayments(payments, txs).length).toBe(0);
    expect(monthlySpending(payments, txs)['2026-06'].spending).toBe(180);
  });

  it('uses each transaction to absorb at most one bill payment', () => {
    const payments = [
      pay({ id: 'b1', type: 'bill', name: 'Verizon', amount: 90, date: '2026-06-03' }),
      pay({ id: 'b2', type: 'bill', name: 'Verizon', amount: 90, date: '2026-06-03' }),
    ];
    const txs = [tx({ id: 't1', date: '2026-06-03', amount: 90, merchant: 'Verizon' })];
    expect(duplicateBillPayments(payments, txs).length).toBe(1);
    expect(monthlySpending(payments, txs)['2026-06'].spending).toBe(180); // 90 tx + 90 surviving bill
  });
});

describe('cashflowHistory — monthKeysThrough', () => {
  it('returns chronological keys ending at the given month', () => {
    expect(monthKeysThrough(3, new Date(2026, 5, 15)))
      .toEqual(['2026-04', '2026-05', '2026-06']);
  });

  it('crosses a year boundary correctly', () => {
    expect(monthKeysThrough(3, new Date(2026, 0, 10)))
      .toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('cashflowHistory — cashflowSeries', () => {
  const settings = { income: 5000 };
  const from = new Date(2026, 5, 15); // Jun 2026

  it('clamps the window to the first month with a real outflow record', () => {
    const payments = [pay({ id: 'b1', type: 'bill', name: 'Rent', amount: 1500, date: '2026-05-01' })];
    const txs = [tx({ id: 't1', date: '2026-06-10', amount: 200, merchant: 'Costco' })];
    const { rows, firstRecorded } = cashflowSeries({ settings, payments, transactions: txs, months: 18, from });
    // 18 months requested, but only May and June have records.
    expect(firstRecorded).toBe('2026-05');
    expect(rows.map((r) => r.mk)).toEqual(['2026-05', '2026-06']);
  });

  it('computes net as income minus merged spending', () => {
    const payments = [pay({ id: 'b1', type: 'bill', name: 'Rent', amount: 1500, date: '2026-06-01' })];
    const txs = [tx({ id: 't1', date: '2026-06-10', amount: 200, merchant: 'Costco' })];
    const { rows } = cashflowSeries({ settings, payments, transactions: txs, months: 6, from });
    const june = rows.find((r) => r.mk === '2026-06');
    expect(june.income).toBe(5000);
    expect(june.spending).toBe(1700);
    expect(june.net).toBe(3300);
  });

  it('applies a one-off income adjustment to just its month', () => {
    const withBonus = { income: 5000, incomeAdjustments: [{ kind: 'once', monthKey: '2026-06', amount: 1000 }] };
    const payments = [pay({ id: 'b1', type: 'bill', name: 'Rent', amount: 1500, date: '2026-05-01' })];
    const { rows } = cashflowSeries({ settings: withBonus, payments, transactions: [], months: 6, from });
    expect(rows.find((r) => r.mk === '2026-05').income).toBe(5000);
    expect(rows.find((r) => r.mk === '2026-06').income).toBe(6000);
  });

  it('marks in-window months with no records at all as blind, not as zero spending', () => {
    const payments = [
      pay({ id: 'b1', type: 'bill', name: 'Rent', amount: 1500, date: '2026-04-01' }),
      pay({ id: 'b2', type: 'bill', name: 'Rent', amount: 1500, date: '2026-06-01' }),
    ];
    const { rows, blindMonths } = cashflowSeries({ settings, payments, transactions: [], months: 6, from });
    expect(rows.map((r) => r.mk)).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(rows.find((r) => r.mk === '2026-05').blind).toBe(true);
    expect(blindMonths).toBe(1);
  });

  it('returns an empty series when nothing has been recorded', () => {
    const out = cashflowSeries({ settings, payments: [], transactions: [], months: 18, from });
    expect(out.rows).toEqual([]);
    expect(out.firstRecorded).toBe('');
  });

  it('reports income as projected, never measured', () => {
    const payments = [pay({ id: 'b1', type: 'bill', name: 'Rent', amount: 1500, date: '2026-06-01' })];
    expect(cashflowSeries({ settings, payments, transactions: [], months: 6, from }).incomeProjected).toBe(true);
  });
});
