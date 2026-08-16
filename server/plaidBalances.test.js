import { describe, it, expect } from 'vitest';
import {
  last4,
  cardMatchesMask,
  cardMatchesIssuerAndName,
  issuerMatchesInstitution,
  matchCardToAccount,
  cardOptedOut,
  NO_LINK,
  owedFromBalances,
  balanceFingerprint,
  balanceProposals,
  applyAcceptedCurrentBalance,
  applyBalanceUpdates,
  isAssetAccount,
  accountTypeFromPlaid,
  accountTypeCompatible,
  accountOptedOut,
  accountLinkIsLive,
  accountMatchesMask,
  accountMatchesName,
  matchAccountToPlaid,
  accountBalanceFingerprint,
  accountBalanceProposals,
  applyAcceptedAccountBalance,
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

  // Disconnecting a bank (or relinking one, which mints fresh account ids)
  // strands the pin on every card that pointed at it. Treating a dead pin as
  // "spoken for" barred those cards from ever matching again.
  it('ignores a pin to an account the user no longer has', () => {
    const pinned = { ...gold, plaidAccountId: 'removed-bank-acct' };
    const account = { account_id: 'acct-9', mask: '1001' };
    const live = new Set(['acct-9', 'acct-other']);
    expect(matchCardToAccount([pinned], account, '', live).id).toBe('g');
  });

  it('still refuses to auto-claim a card pinned to another LIVE account', () => {
    const pinned = { ...gold, plaidAccountId: 'acct-other' };
    const account = { account_id: 'acct-9', mask: '1001' };
    const live = new Set(['acct-9', 'acct-other']);
    expect(matchCardToAccount([pinned], account, '', live)).toBe(null);
  });

  it('trusts every pin when the caller does not say which are live', () => {
    const pinned = { ...gold, plaidAccountId: 'acct-other' };
    expect(matchCardToAccount([pinned], { account_id: 'acct-9', mask: '1001' }, '')).toBe(null);
  });

  // "Match automatically" can't express a refusal — the next sync just pins the
  // card again. NO_LINK is the durable no.
  it('never matches a card the user opted out of, by digits or by name', () => {
    const opted = { ...gold, plaidAccountId: NO_LINK };
    const live = new Set(['acct-9']);
    expect(matchCardToAccount([opted], { account_id: 'acct-9', mask: '1001' }, '', live)).toBe(null);
    expect(matchCardToAccount([opted], { account_id: 'acct-9', name: 'Gold Card', mask: null }, 'American Express', live))
      .toBe(null);
  });

  it('keeps the opt-out even though no account by that id exists', () => {
    // The sentinel isn't a real account id, so it must not read as a dead pin.
    const opted = { ...gold, plaidAccountId: NO_LINK };
    expect(matchCardToAccount([opted], { account_id: 'acct-9', mask: '1001' }, '', new Set(['acct-9'])))
      .toBe(null);
    expect(cardOptedOut(opted)).toBe(true);
    expect(cardOptedOut(gold)).toBe(false);
  });

  it('does not let the opt-out claim an account by explicit link', () => {
    // Belt and braces: even an account somehow named "none" isn't a match.
    const opted = { ...gold, plaidAccountId: NO_LINK };
    expect(matchCardToAccount([opted], { account_id: NO_LINK }, '')).toBe(null);
  });

  it('an opted-out card does not make its neighbour look ambiguous', () => {
    const opted = { id: 'x', name: 'Old Gold', lastDigits: '1001', plaidAccountId: NO_LINK };
    const live = { id: 'y', name: 'Gold Card', lastDigits: '1001' };
    expect(matchCardToAccount([opted, live], { account_id: 'acct-9', mask: '1001' }, '').id).toBe('y');
  });

  it('two cards explicitly linked to the same account is ambiguous, not first-wins', () => {
    const one = { ...gold, plaidAccountId: 'acct-5' };
    const two = { ...plat, plaidAccountId: 'acct-5' };
    expect(matchCardToAccount([one, two], { account_id: 'acct-5' }, '')).toBe(null);
  });
});

// A negative `current` on a credit line is ambiguous: either you're ahead, or
// the issuer flipped the sign. Taking the absolute value read "you have a $50
// credit" as "you owe $50" — the one direction a money app must never get
// wrong on its own initiative.
describe('plaidBalances — owedFromBalances', () => {
  it('takes a positive current as the amount owed', () => {
    expect(owedFromBalances({ current: 742.18, limit: 10000, available: 9257.82 })).toBe(742.18);
  });

  it('reads a negative current as a credit balance when nothing contradicts it', () => {
    expect(owedFromBalances({ current: -55 })).toBe(0);
    expect(owedFromBalances({ current: -55, limit: null, available: null })).toBe(0);
  });

  it('trusts the credit line over the sign: available ABOVE the limit is a real credit', () => {
    // $1,000 line with $1,055 available = $55 in your favour, owing nothing.
    expect(owedFromBalances({ current: -55, limit: 1000, available: 1055 })).toBe(0);
  });

  it('detects an issuer that reports what is owed as a negative', () => {
    // $1,000 line with $945 available means $55 IS owed, so -55 is a sign flip.
    expect(owedFromBalances({ current: -55, limit: 1000, available: 945 })).toBe(55);
  });

  // A stored snapshot writes a figure the bank didn't report as an explicit
  // null, and Number(null) is 0 — which proposed "Current → $0.00" for an
  // account whose balance simply wasn't available.
  it('rejects a balance it cannot use', () => {
    expect(owedFromBalances({ current: null })).toBe(null);
    expect(owedFromBalances({})).toBe(null);
    expect(owedFromBalances(null)).toBe(null);
    expect(owedFromBalances({ current: '' })).toBe(null);
    expect(owedFromBalances({ current: 'n/a' })).toBe(null);
  });

  it('does not let an unreported limit fake a zero credit line', () => {
    // limit/available both null → no corroboration, so the credit reading wins
    // rather than "limit 0 - available 0 = owes 0" arriving by accident.
    expect(owedFromBalances({ current: -55, limit: null, available: null })).toBe(0);
    expect(owedFromBalances({ current: -55, limit: 1000, available: null })).toBe(0);
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
      // current: -55 with nothing to corroborate it = a credit balance.
      { id: 2, proposedCurrent: 0, fingerprint: balanceFingerprint(2, 0) },
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

  // An archived card is off the Cards tab, so a proposal for it would sit in
  // the review queue naming a card the user can't see — and can't judge.
  it('skips archived cards, and does not let one shadow a live match', () => {
    const archived = [{ id: 9, name: 'Old Amex', lastDigits: '1009', archived: true }];
    expect(balanceProposals(archived, [{ type: 'credit', mask: '1009', balances: { current: 5 } }], []))
      .toEqual([]);

    // The archived twin must not make the live card look ambiguous.
    const both = [...archived, { id: 10, name: 'New Amex', lastDigits: '1009' }];
    expect(balanceProposals(both, [{ type: 'credit', mask: '1009', balances: { current: 5 } }], []))
      .toEqual([{ id: 10, proposedCurrent: 5, fingerprint: balanceFingerprint(10, 5) }]);
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

/* ── Asset accounts (the Balances tab) ────────────────────────── */

describe('plaidBalances — asset account matching', () => {
  const depo = (over = {}) => ({
    account_id: 'p1', type: 'depository', subtype: 'checking',
    mask: '4455', name: 'Total Checking', balances: { current: 1200 }, ...over,
  });

  it('only treats depository/investment accounts as assets', () => {
    expect(isAssetAccount({ type: 'depository' })).toBe(true);
    expect(isAssetAccount({ type: 'investment' })).toBe(true);
    expect(isAssetAccount({ type: 'brokerage' })).toBe(true);
    // Credit and loan are the cards' business, matched by balanceProposals.
    expect(isAssetAccount({ type: 'credit' })).toBe(false);
    expect(isAssetAccount({ type: 'loan' })).toBe(false);
    expect(isAssetAccount(null)).toBe(false);
  });

  it('maps a Plaid subtype onto the Balances tab type', () => {
    expect(accountTypeFromPlaid({ type: 'depository', subtype: 'checking' })).toBe('checking');
    expect(accountTypeFromPlaid({ type: 'depository', subtype: 'savings' })).toBe('savings');
    expect(accountTypeFromPlaid({ type: 'depository', subtype: 'cd' })).toBe('savings');
    expect(accountTypeFromPlaid({ type: 'investment', subtype: 'ira' })).toBe('investment');
    // An unknown subtype is left unclassified rather than guessed at.
    expect(accountTypeFromPlaid({ type: 'depository', subtype: 'weird' })).toBe('');
    expect(accountTypeFromPlaid({ type: 'credit' })).toBe('');
  });

  it('rules out an account whose type cannot be what Plaid describes', () => {
    // A house is not a chequing account.
    expect(accountTypeCompatible({ type: 'property' }, depo())).toBe(false);
    expect(accountTypeCompatible({ type: 'checking' }, depo())).toBe(true);
    // Checking/savings/cash are near enough that the user's label shouldn't veto.
    expect(accountTypeCompatible({ type: 'savings' }, depo())).toBe(true);
    // Unknown on either side stays eligible.
    expect(accountTypeCompatible({ type: '' }, depo())).toBe(true);
    expect(accountTypeCompatible({ type: 'property' }, { type: 'depository', subtype: 'weird' })).toBe(true);
  });

  it('matches on the last four digits carried in the account name', () => {
    expect(accountMatchesMask({ name: 'Chase 4455' }, '4455')).toBe(true);
    expect(accountMatchesMask({ name: 'Chase Checking' }, '4455')).toBe(false);
    // Fewer than four digits is not a mask.
    expect(accountMatchesMask({ name: 'Chase 455' }, '455')).toBe(false);
  });

  it('will not match on the words every account shares', () => {
    // "Checking" is on both sides of every pairing at every bank, so it can
    // never be the thing that connects two accounts.
    expect(accountMatchesName({ name: 'My Checking' }, depo({ name: 'Total Checking' }), 'Chase')).toBe(false);
    expect(accountMatchesName({ name: 'Savings' }, depo({ name: 'Premier Savings' }), 'Chase')).toBe(false);
    // A distinctive product word does connect them.
    expect(accountMatchesName({ name: 'Sapphire Checking' }, depo({ name: 'Sapphire Banking' }), 'Chase')).toBe(true);
    // So does the bank's own name.
    expect(accountMatchesName({ name: 'Ally Savings' }, depo({ name: 'Online Savings' }), 'Ally Bank')).toBe(true);
  });

  it('an explicit pin always wins, and beats a digit match on another row', () => {
    const accounts = [
      { id: 'a1', name: 'Chase 4455', type: 'checking' },
      { id: 'a2', name: 'Pinned', type: 'checking', plaidAccountId: 'p1' },
    ];
    expect(matchAccountToPlaid(accounts, depo(), 'Chase').id).toBe('a2');
  });

  it('never claims an account the user opted out of', () => {
    const accounts = [{ id: 'a1', name: 'Chase 4455', type: 'checking', plaidAccountId: NO_LINK }];
    expect(accountOptedOut(accounts[0])).toBe(true);
    expect(matchAccountToPlaid(accounts, depo(), 'Chase')).toBeNull();
  });

  it('leaves a genuinely ambiguous pair alone rather than guessing', () => {
    // Same digits, and nothing distinctive in either name to separate them.
    const accounts = [
      { id: 'a1', name: 'Checking 4455', type: 'checking' },
      { id: 'a2', name: 'Savings 4455', type: 'checking' },
    ];
    expect(matchAccountToPlaid(accounts, depo(), 'Chase')).toBeNull();
  });

  it('breaks a digit tie on the institution name', () => {
    // Two rows carry the same last-4, but only one names the bank Plaid is
    // reporting from — the same tier-3 narrowing the card path uses.
    const accounts = [
      { id: 'a1', name: 'Chase 4455', type: 'checking' },
      { id: 'a2', name: 'Other 4455', type: 'checking' },
    ];
    expect(matchAccountToPlaid(accounts, depo(), 'Chase').id).toBe('a1');
  });

  it('frees an account pinned to a bank that has since been removed', () => {
    const accounts = [{ id: 'a1', name: 'Chase 4455', type: 'checking', plaidAccountId: 'gone' }];
    // With the live-id set supplied, the dead pin no longer blocks the match.
    expect(accountLinkIsLive(accounts[0], new Set(['p1']))).toBe(false);
    expect(matchAccountToPlaid(accounts, depo(), 'Chase', new Set(['p1'])).id).toBe('a1');
  });
});

describe('plaidBalances — accountBalanceProposals', () => {
  const acct = (over = {}) => ({ id: 'a1', name: 'Chase 4455', type: 'checking', balance: 900, ...over });
  const depo = (over = {}) => ({
    account_id: 'p1', type: 'depository', subtype: 'checking',
    mask: '4455', name: 'Total Checking', balances: { current: 1200 }, ...over,
  });

  it('proposes the bank figure for a single confident match', () => {
    expect(accountBalanceProposals([acct()], [depo()], [])).toEqual([{
      id: 'a1',
      proposedBalance: 1200,
      fingerprint: accountBalanceFingerprint('a1', 1200),
    }]);
  });

  it('ignores credit and loan accounts — those belong to the cards queue', () => {
    const credit = depo({ type: 'credit', subtype: 'credit card' });
    expect(accountBalanceProposals([acct()], [credit], [])).toEqual([]);
  });

  it('stays quiet when the stored balance already agrees', () => {
    expect(accountBalanceProposals([acct({ balance: 1200 })], [depo()], [])).toEqual([]);
  });

  it('does not re-propose a figure the user already answered', () => {
    const fp = accountBalanceFingerprint('a1', 1200);
    expect(accountBalanceProposals([acct()], [depo()], [fp])).toEqual([]);
    // A different figure is a different question, so it is asked.
    const moved = accountBalanceProposals([acct()], [depo({ balances: { current: 1300 } })], [fp]);
    expect(moved).toHaveLength(1);
    expect(moved[0].proposedBalance).toBe(1300);
  });

  it('skips an account whose balance the bank did not report', () => {
    // Number(null) is 0, so an absent figure must not become a $0 proposal.
    expect(accountBalanceProposals([acct()], [depo({ balances: { current: null } })], [])).toEqual([]);
    expect(accountBalanceProposals([acct()], [depo({ balances: {} })], [])).toEqual([]);
  });

  it('account fingerprints cannot collide with a card fingerprint', () => {
    // Both queues share one resolved list, so the prefix is load-bearing.
    expect(accountBalanceFingerprint('1', 500)).not.toBe(balanceFingerprint('1', 500));
    expect(accountBalanceFingerprint('1', 500).startsWith('acct:')).toBe(true);
  });
});

describe('plaidBalances — applyAcceptedAccountBalance', () => {
  it('writes balance and leaves the user\'s own labels alone', () => {
    const accounts = [
      { id: 'a1', name: 'Chase', type: 'checking', balance: 900, notes: 'mine' },
      { id: 'a2', name: 'Other', type: 'savings', balance: 10 },
    ];
    const res = applyAcceptedAccountBalance(accounts, [{ id: 'a1', proposedBalance: 1200 }]);
    expect(res.changed).toBe(true);
    expect(res.accounts[0]).toEqual({ id: 'a1', name: 'Chase', type: 'checking', balance: 1200, notes: 'mine' });
    // Untouched rows keep their identity, so a re-render can skip them.
    expect(res.accounts[1]).toBe(accounts[1]);
  });

  it('reports no change when the figure already matches, or the account is gone', () => {
    const accounts = [{ id: 'a1', balance: 1200 }];
    expect(applyAcceptedAccountBalance(accounts, [{ id: 'a1', proposedBalance: 1200 }]).changed).toBe(false);
    expect(applyAcceptedAccountBalance(accounts, [{ id: 'nope', proposedBalance: 5 }]).changed).toBe(false);
    expect(applyAcceptedAccountBalance(accounts, [{ id: 'a1', proposedBalance: null }]).changed).toBe(false);
  });
});
