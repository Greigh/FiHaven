import { describe, it, expect } from 'vitest';
import {
  last4,
  cardMatchesMask,
  balanceFingerprint,
  balanceProposals,
  applyAcceptedCurrentBalance,
  applyBalanceUpdates,
} from './plaidBalances.js';

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
    expect(cardMatchesMask({ name: 'Amex', lastDigits: '10091' }, '0091')).toBe(true);
    expect(cardMatchesMask({ name: 'Amex', lastDigits: '10091' }, '10091')).toBe(true);
    expect(cardMatchesMask({ name: 'Amex', lastDigits: '10091' }, '4321')).toBe(false);
  });

  it('falls back to a card whose name carries the mask', () => {
    expect(cardMatchesMask({ name: 'Amex Gold ••1009' }, '1009')).toBe(true);
    expect(cardMatchesMask({ name: 'Chase Sapphire' }, '1009')).toBe(false);
    expect(cardMatchesMask({ name: 'X' }, '')).toBe(false);
  });
});

describe('plaidBalances — balanceProposals', () => {
  const cards = [
    { id: 1, name: 'Amex Gold', lastDigits: '1009', balance: 500, currentBalance: 500 },
    { id: 2, name: 'Chase Sapphire', lastDigits: '4321', balance: 0 },
    { id: 3, name: 'Generic Card', balance: 100 },
    { id: 4, name: 'Legacy Chase 8765', balance: 50 },
  ];

  it('proposes current balance (not statement) for unambiguous matches', () => {
    const accounts = [
      { type: 'credit', mask: '1009', balances: { current: 742.18, limit: 10000 } },
      { type: 'credit', mask: '4321', balances: { current: -55 } },
      { type: 'credit', mask: '8765', balances: { current: 12 } },
      { type: 'depository', mask: '0000', balances: { current: 9000 } },
      { type: 'credit', mask: '9999', balances: { current: 10 } },
    ];
    const ups = balanceProposals(cards, accounts, []);
    expect(ups).toEqual([
      {
        id: 1,
        proposedCurrent: 742.18,
        limit: 10000,
        fingerprint: balanceFingerprint(1, 742.18, 10000),
      },
      { id: 2, proposedCurrent: 55, fingerprint: balanceFingerprint(2, 55) },
      { id: 4, proposedCurrent: 12, fingerprint: balanceFingerprint(4, 12) },
    ]);
  });

  it('skips resolved fingerprints and already-matching currentBalance', () => {
    const fp = balanceFingerprint(1, 742.18, 10000);
    expect(
      balanceProposals(
        cards,
        [{ type: 'credit', mask: '1009', balances: { current: 742.18, limit: 10000 } }],
        [fp]
      )
    ).toEqual([]);

    const matched = [{ ...cards[0], currentBalance: 742.18, limit: 10000 }];
    expect(
      balanceProposals(
        matched,
        [{ type: 'credit', mask: '1009', balances: { current: 742.18, limit: 10000 } }],
        []
      )
    ).toEqual([]);
  });

  it('skips a mask that matches more than one card (ambiguous)', () => {
    const dup = [
      { id: 1, name: 'Card A', lastDigits: '1009' },
      { id: 2, name: 'Card B', lastDigits: '1009' },
    ];
    expect(balanceProposals(dup, [{ type: 'credit', mask: '1009', balances: { current: 5 } }], [])).toEqual([]);
  });
});

describe('plaidBalances — applyAcceptedCurrentBalance', () => {
  it('writes currentBalance only (never statement balance)', () => {
    const cards = [{ id: 1, name: 'A', balance: 500, dueDay: 5 }, { id: 2, name: 'B', balance: 0 }];
    const res = applyAcceptedCurrentBalance(cards, [{ id: 1, proposedCurrent: 742 }]);
    expect(res.changed).toBe(true);
    expect(res.cards[0]).toEqual({ id: 1, name: 'A', balance: 500, dueDay: 5, currentBalance: 742 });
    expect(res.cards[1]).toBe(cards[1]);
  });

  it('also writes limit when provided', () => {
    const cards = [{ id: 1, name: 'A', balance: 500, limit: 5000, currentBalance: 100 }];
    const withLimit = applyAcceptedCurrentBalance(cards, [{ id: 1, proposedCurrent: 742, limit: 10000 }]);
    expect(withLimit.changed).toBe(true);
    expect(withLimit.cards[0].currentBalance).toBe(742);
    expect(withLimit.cards[0].limit).toBe(10000);
    expect(withLimit.cards[0].balance).toBe(500);
  });

  it('legacy applyBalanceUpdates also targets currentBalance', () => {
    const cards = [{ id: 1, name: 'A', balance: 500 }];
    const res = applyBalanceUpdates(cards, [{ id: 1, balance: 742 }]);
    expect(res.cards[0].currentBalance).toBe(742);
    expect(res.cards[0].balance).toBe(500);
  });
});
