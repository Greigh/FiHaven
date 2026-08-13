import { describe, it, expect } from 'vitest';
import { proposalComparison } from './plaidBalanceReview.js';

// `currentBalance` is the live figure a bank suggestion replaces; a card that
// never had one falls back to its statement balance, same as the Cards list.
const CARDS = [
  { id: 1, name: 'Chase', balance: 2000, currentBalance: 2336.64, limit: 40900 },
  { id: 2, name: 'Bilt', balance: 5079.77, limit: 15000 },
  { id: 3, name: 'No limit', balance: 100, limit: 0 },
];

describe('proposalComparison', () => {
  it('reads direction from the live balance, not the statement', () => {
    const up = proposalComparison({ id: 1, proposedCurrent: 2400 }, CARDS);
    expect(up.current).toBe(2336.64);
    expect(up.direction).toBe('up');

    const down = proposalComparison({ id: 1, proposedCurrent: 1900 }, CARDS);
    expect(down.direction).toBe('down');
    // Statement balance is 2000 — reading that instead would call this "down"
    // from the wrong figure and show the wrong "current".
    expect(down.current).toBe(2336.64);
  });

  it('falls back to the statement balance when no current is tracked', () => {
    const cmp = proposalComparison({ id: 2, proposedCurrent: 5079.77 }, CARDS);
    expect(cmp.current).toBe(5079.77);
    expect(cmp.direction).toBe('same');
  });

  it('treats a sub-cent move as no change', () => {
    const cmp = proposalComparison({ id: 1, proposedCurrent: 2336.641 }, CARDS);
    expect(cmp.direction).toBe('same');
  });

  it('flags the limit only when it actually moved', () => {
    expect(proposalComparison({ id: 1, proposedCurrent: 1, limit: 40900 }, CARDS).limitChanged)
      .toBe(false);
    expect(proposalComparison({ id: 1, proposedCurrent: 1, limit: 45000 }, CARDS).limitChanged)
      .toBe(true);
    // No limit reported at all — nothing to say either way.
    expect(proposalComparison({ id: 1, proposedCurrent: 1 }, CARDS).limitChanged).toBe(false);
    // A first limit on a card that has none is a change worth showing.
    const fresh = proposalComparison({ id: 3, proposedCurrent: 1, limit: 5000 }, CARDS);
    expect(fresh.limitChanged).toBe(true);
    expect(fresh.currentLimit).toBe(null);
  });

  it('has nothing to compare against when the card is gone', () => {
    const cmp = proposalComparison({ id: 99, proposedCurrent: 500, limit: 1000 }, CARDS);
    expect(cmp.current).toBe(null);
    expect(cmp.direction).toBe('same');
    expect(cmp.proposed).toBe(500);
    expect(cmp.limitChanged).toBe(true);
  });

  it('accepts the legacy `balance` key for the proposed figure', () => {
    expect(proposalComparison({ id: 1, balance: 2400 }, CARDS).proposed).toBe(2400);
  });
});
