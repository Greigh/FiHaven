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

  it('matches a card whose name carries the mask', () => {
    expect(cardMatchesMask({ name: 'Amex Gold ••1009' }, '1009')).toBe(true);
    expect(cardMatchesMask({ name: 'Chase Sapphire' }, '1009')).toBe(false);
    expect(cardMatchesMask({ name: 'X' }, '')).toBe(false);
  });
});

describe('plaidBalances — balanceUpdates', () => {
  const cards = [
    { id: 1, name: 'Amex Gold ••1009', balance: 500 },
    { id: 2, name: 'Chase 4321', balance: 0 },
    { id: 3, name: 'Generic Card', balance: 100 },
  ];

  it('updates only unambiguous credit/loan matches', () => {
    const accounts = [
      { type: 'credit', mask: '1009', balances: { current: 742.18 } }, // → card 1
      { type: 'credit', mask: '4321', balances: { current: -55 } },    // → card 2, abs
      { type: 'depository', mask: '0000', balances: { current: 9000 } }, // ignored (not a card)
      { type: 'credit', mask: '9999', balances: { current: 10 } },     // no card → skipped
    ];
    const ups = balanceUpdates(cards, accounts);
    expect(ups).toEqual([{ id: 1, balance: 742.18 }, { id: 2, balance: 55 }]);
  });

  it('skips a mask that matches more than one card (ambiguous)', () => {
    const dup = [{ id: 1, name: 'Card ••1009' }, { id: 2, name: 'Other ••1009' }];
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

  it('reports no change when the balance already matches', () => {
    const cards = [{ id: 1, name: 'A', balance: 742 }];
    expect(applyBalanceUpdates(cards, [{ id: 1, balance: 742 }]).changed).toBe(false);
  });
});
