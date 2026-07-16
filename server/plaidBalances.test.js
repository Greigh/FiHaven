import { describe, it, expect } from 'vitest';
import { last4, cardMatchesMask, balanceUpdates, applyBalanceUpdates } from './plaidBalances.js';

describe('plaidBalances — last4 & match', () => {
  it('extracts the last four digits', () => {
    expect(last4('1009')).toBe('1009');
    expect(last4('••1009')).toBe('1009');
    expect(last4('411111111009')).toBe('1009');
    expect(last4('12')).toBe('');
    expect(last4(null)).toBe('');
  });

  it('matches via lastDigits (preferred) before the name', () => {
    expect(cardMatchesMask({ name: 'Amex Gold', lastDigits: '1009' }, '1009')).toBe(true);
    expect(cardMatchesMask({ name: 'Chase Sapphire', lastDigits: '4321' }, '1009')).toBe(false);
    expect(cardMatchesMask({ name: 'X', lastDigits: '12' }, '1009')).toBe(false);
  });

  it('handles Amex 4↔5 lastDigits vs Plaid mask', () => {
    // User-stored Ends in (5) vs Plaid mask (last 4 of those 5).
    expect(cardMatchesMask({ name: 'Amex', lastDigits: '10091' }, '0091')).toBe(true);
    expect(cardMatchesMask({ name: 'Amex', lastDigits: '10091' }, '10091')).toBe(true);
    // Unrelated last-4 must not match.
    expect(cardMatchesMask({ name: 'Amex', lastDigits: '10091' }, '4321')).toBe(false);
  });

  it('falls back to a card whose name carries the mask', () => {
    expect(cardMatchesMask({ name: 'Amex Gold ••1009' }, '1009')).toBe(true);
    expect(cardMatchesMask({ name: 'Chase Sapphire' }, '1009')).toBe(false);
    expect(cardMatchesMask({ name: 'X' }, '')).toBe(false);
  });
});

describe('plaidBalances — balanceUpdates', () => {
  const cards = [
    { id: 1, name: 'Amex Gold', lastDigits: '1009', balance: 500 },
    { id: 2, name: 'Chase Sapphire', lastDigits: '4321', balance: 0 },
    { id: 3, name: 'Generic Card', balance: 100 },
    { id: 4, name: 'Legacy Chase 8765', balance: 50 }, // name-only fallback
  ];

  it('updates only unambiguous credit/loan matches', () => {
    const accounts = [
      { type: 'credit', mask: '1009', balances: { current: 742.18, limit: 10000 } }, // → card 1 + limit
      { type: 'credit', mask: '4321', balances: { current: -55 } },    // → card 2, abs, no limit
      { type: 'credit', mask: '8765', balances: { current: 12 } },     // → card 4 via name
      { type: 'depository', mask: '0000', balances: { current: 9000 } }, // ignored (not a card)
      { type: 'credit', mask: '9999', balances: { current: 10 } },     // no card → skipped
    ];
    const ups = balanceUpdates(cards, accounts);
    expect(ups).toEqual([
      { id: 1, balance: 742.18, limit: 10000 },
      { id: 2, balance: 55 },
      { id: 4, balance: 12 },
    ]);
  });

  it('skips a mask that matches more than one card (ambiguous)', () => {
    const dup = [
      { id: 1, name: 'Card A', lastDigits: '1009' },
      { id: 2, name: 'Card B', lastDigits: '1009' },
    ];
    expect(balanceUpdates(dup, [{ type: 'credit', mask: '1009', balances: { current: 5 } }])).toEqual([]);
  });

  it('ignores accounts with no usable balance', () => {
    expect(balanceUpdates(cards, [{ type: 'credit', mask: '1009', balances: {} }])).toEqual([]);
  });
});

describe('plaidBalances — applyBalanceUpdates', () => {
  it('writes only the balance field and reports change', () => {
    const cards = [{ id: 1, name: 'A', balance: 500, dueDay: 5 }, { id: 2, name: 'B', balance: 0 }];
    const res = applyBalanceUpdates(cards, [{ id: 1, balance: 742 }]);
    expect(res.changed).toBe(true);
    expect(res.cards[0]).toEqual({ id: 1, name: 'A', balance: 742, dueDay: 5 });
    expect(res.cards[1]).toBe(cards[1]); // untouched reference
  });

  it('also writes limit when provided, without clearing when omitted', () => {
    const cards = [{ id: 1, name: 'A', balance: 500, limit: 5000 }];
    const withLimit = applyBalanceUpdates(cards, [{ id: 1, balance: 742, limit: 10000 }]);
    expect(withLimit.changed).toBe(true);
    expect(withLimit.cards[0]).toEqual({ id: 1, name: 'A', balance: 742, limit: 10000 });

    const noLimit = applyBalanceUpdates(cards, [{ id: 1, balance: 742 }]);
    expect(noLimit.cards[0].limit).toBe(5000);
  });

  it('reports no change when the balance already matches', () => {
    const cards = [{ id: 1, name: 'A', balance: 742 }];
    expect(applyBalanceUpdates(cards, [{ id: 1, balance: 742 }]).changed).toBe(false);
  });
});
