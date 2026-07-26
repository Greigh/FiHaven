import { describe, it, expect } from 'vitest';
import {
  last4,
  cardMatchesMask,
  cardMatchesIssuerAndName,
  issuerMatchesInstitution,
  matchCardToAccount,
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

describe('plaidBalances — issuer + name (tier 3)', () => {
  it('folds trading names onto one issuer', () => {
    expect(issuerMatchesInstitution('Amex', 'American Express')).toBe(true);
    expect(issuerMatchesInstitution('American Express', 'American Express Credit Cards')).toBe(true);
    expect(issuerMatchesInstitution('Bank of America', 'Bank of America, N.A.')).toBe(true);
    expect(issuerMatchesInstitution('Chase', 'JPMorgan Chase')).toBe(true);
    expect(issuerMatchesInstitution('Chase', 'American Express')).toBe(false);
    expect(issuerMatchesInstitution('', 'American Express')).toBe(false);
  });

  it('needs a shared product word, not just the issuer', () => {
    const gold = { name: 'Gold Card', issuer: 'American Express' };
    expect(cardMatchesIssuerAndName(gold, { name: 'Amex Gold Card' }, 'American Express')).toBe(true);
    // Same bank, different product — must NOT match.
    expect(cardMatchesIssuerAndName(gold, { name: 'Platinum Card' }, 'American Express')).toBe(false);
    // Right product, wrong bank.
    expect(cardMatchesIssuerAndName(gold, { name: 'Gold Card' }, 'Chase')).toBe(false);
    // "Card"/"credit" alone are stopwords and prove nothing.
    expect(cardMatchesIssuerAndName({ name: 'Card', issuer: 'Amex' }, { name: 'Credit Card' }, 'American Express')).toBe(false);
  });

  it('reads official_name when the short name is unhelpful', () => {
    const card = { name: 'Sapphire Preferred', issuer: 'Chase' };
    const account = { name: 'CREDIT CARD', official_name: 'Chase Sapphire Preferred Card' };
    expect(cardMatchesIssuerAndName(card, account, 'JPMorgan Chase')).toBe(true);
  });
});

describe('plaidBalances — matchCardToAccount tiers', () => {
  const gold = { id: 'g', name: 'Gold Card', issuer: 'American Express', lastDigits: '1001' };
  const plat = { id: 'p', name: 'Platinum Card', issuer: 'American Express', lastDigits: '2002' };

  it('an explicit link wins over digits that point elsewhere', () => {
    const linked = { ...gold, plaidAccountId: 'acct-1' };
    const account = { account_id: 'acct-1', mask: '2002' }; // digits say Platinum
    expect(matchCardToAccount([linked, plat], account, 'American Express').id).toBe('g');
  });

  it('an explicit link needs no mask at all', () => {
    const linked = { ...gold, plaidAccountId: 'acct-1' };
    expect(matchCardToAccount([linked], { account_id: 'acct-1', mask: null }, '').id).toBe('g');
  });

  it('never auto-claims a card pinned to a different account', () => {
    const pinned = { ...gold, plaidAccountId: 'somewhere-else' };
    // Digits would otherwise match this account outright.
    expect(matchCardToAccount([pinned], { account_id: 'acct-9', mask: '1001' }, '')).toBe(null);
  });

  it('falls back to issuer + name when the bank reports no mask (the Amex case)', () => {
    const account = { account_id: 'acct-2', name: 'Gold Card', mask: null };
    expect(matchCardToAccount([gold, plat], account, 'American Express').id).toBe('g');
  });

  it('breaks a digit tie with issuer + name', () => {
    const a = { id: 'a', name: 'Gold Card', issuer: 'American Express', lastDigits: '1001' };
    const b = { id: 'b', name: 'Freedom', issuer: 'Chase', lastDigits: '1001' };
    const account = { account_id: 'acct-3', name: 'Amex Gold Card', mask: '1001' };
    expect(matchCardToAccount([a, b], account, 'American Express').id).toBe('a');
  });

  it('stays silent rather than guessing between two cards at one bank', () => {
    const account = { account_id: 'acct-4', name: 'Credit Card', mask: null };
    expect(matchCardToAccount([gold, plat], account, 'American Express')).toBe(null);
  });

  it('two cards explicitly linked to the same account is ambiguous, not first-wins', () => {
    const one = { ...gold, plaidAccountId: 'acct-5' };
    const two = { ...plat, plaidAccountId: 'acct-5' };
    expect(matchCardToAccount([one, two], { account_id: 'acct-5' }, '')).toBe(null);
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
