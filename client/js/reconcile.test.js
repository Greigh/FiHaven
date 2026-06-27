import { describe, it, expect } from 'vitest';
import { looksSame, duplicatePairs, unmatchedBank, unconfirmedManual } from './reconcile.js';

const tx = (o) => ({ id: o.id, date: o.date, amount: o.amount, merchant: o.merchant || '', source: o.source || 'manual' });

describe('reconcile — looksSame', () => {
  it('matches same amount, similar merchant, date within ±1 day', () => {
    const a = tx({ id: 'a', date: '2026-06-15', amount: 42.5, merchant: 'Starbucks #12' });
    const b = tx({ id: 'b', date: '2026-06-16', amount: 42.5, merchant: 'STARBUCKS', source: 'plaid' });
    expect(looksSame(a, b)).toBe(true);
  });

  it('rejects different amount, far date, or unrelated merchant', () => {
    const base = { id: 'a', date: '2026-06-15', amount: 42.5, merchant: 'Starbucks' };
    expect(looksSame(tx(base), tx({ ...base, id: 'b', amount: 9.0 }))).toBe(false);   // amount
    expect(looksSame(tx(base), tx({ ...base, id: 'b', date: '2026-06-20' }))).toBe(false); // date
    expect(looksSame(tx(base), tx({ ...base, id: 'b', merchant: 'Whole Foods' }))).toBe(false); // merchant
  });

  it('needs a real merchant on both sides', () => {
    expect(looksSame(tx({ id: 'a', date: '2026-06-15', amount: 5, merchant: '' }),
                     tx({ id: 'b', date: '2026-06-15', amount: 5, merchant: '' }))).toBe(false);
  });

  it('respects a custom day tolerance', () => {
    const a = tx({ id: 'a', date: '2026-06-15', amount: 10, merchant: 'Target' });
    const b = tx({ id: 'b', date: '2026-06-18', amount: 10, merchant: 'Target' });
    expect(looksSame(a, b)).toBe(false);          // 3 days, default tol 1
    expect(looksSame(a, b, 3)).toBe(true);
  });
});

describe('reconcile — duplicatePairs / unmatchedBank', () => {
  const txns = [
    tx({ id: 'm1', date: '2026-06-15', amount: 42.5, merchant: 'Starbucks' }),       // dup of p1
    tx({ id: 'm2', date: '2026-06-10', amount: 80, merchant: 'Costco' }),            // no bank match
    tx({ id: 'p1', date: '2026-06-16', amount: 42.5, merchant: 'STARBUCKS #9', source: 'plaid' }),
    tx({ id: 'p2', date: '2026-06-14', amount: 23.1, merchant: 'Shell Oil', source: 'plaid' }), // bank-only
  ];

  it('pairs each bank duplicate with one manual row', () => {
    const pairs = duplicatePairs(txns);
    expect(pairs.length).toBe(1);
    expect(pairs[0].manual.id).toBe('m1');
    expect(pairs[0].bank.id).toBe('p1');
  });

  it('lists bank rows with no manual counterpart', () => {
    expect(unmatchedBank(txns).map((t) => t.id)).toEqual(['p2']);
  });

  it('uses each manual row at most once for two similar bank rows', () => {
    const two = [
      tx({ id: 'm1', date: '2026-06-15', amount: 5, merchant: 'Cafe' }),
      tx({ id: 'pa', date: '2026-06-15', amount: 5, merchant: 'Cafe', source: 'plaid' }),
      tx({ id: 'pb', date: '2026-06-16', amount: 5, merchant: 'Cafe', source: 'plaid' }),
    ];
    const pairs = duplicatePairs(two);
    expect(pairs.length).toBe(1);                 // only one manual to pair with
    expect(unmatchedBank(two).length).toBe(1);    // the other bank row is unmatched
  });
});

describe('reconcile — unconfirmedManual', () => {
  const today = new Date(2026, 5, 20); // Jun 20 2026
  it('flags recent manual rows the bank never corroborated', () => {
    const txns = [
      tx({ id: 'm1', date: '2026-06-15', amount: 42.5, merchant: 'Starbucks' }),  // matched by bank → not flagged
      tx({ id: 'm2', date: '2026-06-18', amount: 80, merchant: 'Costco' }),       // recent, no bank → flagged
      tx({ id: 'm3', date: '2026-01-01', amount: 9, merchant: 'Old' }),           // too old → not flagged
      tx({ id: 'p1', date: '2026-06-16', amount: 42.5, merchant: 'STARBUCKS', source: 'plaid' }),
    ];
    expect(unconfirmedManual(txns, 35, today).map((t) => t.id)).toEqual(['m2']);
  });
});
