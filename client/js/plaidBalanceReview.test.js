import { describe, it, expect, beforeEach } from 'vitest';
import {
  proposalComparison, balanceFingerprint,
  accountProposalComparison, accountBalanceFingerprint,
  pendingAccountProposals, acceptAccountProposal, declineAccountProposal,
  acceptAllAccountProposals, declineAllAccountProposals,
} from './plaidBalanceReview.js';
import { accounts, settings, setAccounts, setSettings } from './storage.svelte.js';

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

/* ── Asset accounts (the Balances tab) ────────────────────────── */

const ACCOUNTS = [
  { id: 'a1', name: 'Ally Savings', type: 'savings', balance: 4200 },
  { id: 'a2', name: '', type: 'checking', balance: 0 },
];

describe('accountProposalComparison', () => {
  it('reads the balance on file and which way the bank moves it', () => {
    const up = accountProposalComparison({ id: 'a1', proposedBalance: 4500 }, ACCOUNTS);
    expect(up.current).toBe(4200);
    expect(up.proposed).toBe(4500);
    expect(up.direction).toBe('up');
    expect(up.name).toBe('Ally Savings');

    expect(accountProposalComparison({ id: 'a1', proposedBalance: 3900 }, ACCOUNTS).direction)
      .toBe('down');
  });

  it('treats a sub-cent move as no change', () => {
    expect(accountProposalComparison({ id: 'a1', proposedBalance: 4200.001 }, ACCOUNTS).direction)
      .toBe('same');
  });

  it('leaves current null when the account is gone', () => {
    // Nothing to compare against, so the row shows the bank figure alone
    // rather than inventing a zero to move away from.
    const cmp = accountProposalComparison({ id: 'nope', proposedBalance: 500 }, ACCOUNTS);
    expect(cmp.current).toBeNull();
    expect(cmp.direction).toBe('same');
  });

  it('handles an account whose balance was never set', () => {
    const cmp = accountProposalComparison({ id: 'a2', proposedBalance: 75 }, ACCOUNTS);
    expect(cmp.current).toBe(0);
    expect(cmp.direction).toBe('up');
  });
});

describe('accountBalanceFingerprint', () => {
  it('prefixes account fingerprints so they cannot collide with a card', () => {
    // Both queues write into the one shared `plaidBalanceResolved` list, so a
    // collision would silently answer the other queue's question.
    expect(accountBalanceFingerprint('1', 500)).toBe('acct:1:500.00');
    expect(accountBalanceFingerprint('1', 500)).not.toBe(balanceFingerprint('1', 500));
  });

  it('is stable to the cent', () => {
    expect(accountBalanceFingerprint('a1', 4200)).toBe(accountBalanceFingerprint('a1', 4200.0));
    expect(accountBalanceFingerprint('a1', 4200)).not.toBe(accountBalanceFingerprint('a1', 4200.01));
  });
});

describe('account proposal queue & resolution', () => {
  beforeEach(() => {
    setAccounts([
      { id: 'acct-1', name: 'Checking', type: 'checking', balance: 1200, notes: 'Direct deposit' },
      { id: 'acct-2', name: 'High Yield Savings', type: 'savings', balance: 5000, notes: 'Emergency fund' },
    ]);
    setSettings({
      income: 0,
      plaidAccountProposals: [
        { id: 'acct-1', proposedBalance: 1350, fingerprint: 'acct:acct-1:1350.00' },
        { id: 'acct-2', proposedBalance: 5120, fingerprint: 'acct:acct-2:5120.00' },
      ],
      plaidBalanceResolved: [],
    });
  });

  it('filters out already-resolved account proposals', () => {
    expect(pendingAccountProposals()).toHaveLength(2);

    setSettings({
      ...settings,
      plaidBalanceResolved: [{ fingerprint: 'acct:acct-1:1350.00', decision: 'accept' }],
    });

    const pending = pendingAccountProposals();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('acct-2');
  });

  it('accepts an account proposal: updates balance and preserves all user fields', () => {
    const proposal = { id: 'acct-1', proposedBalance: 1350, fingerprint: 'acct:acct-1:1350.00' };
    const ok = acceptAccountProposal(proposal);

    expect(ok).toBe(true);
    const updated = accounts.find((a) => a.id === 'acct-1');
    expect(updated.balance).toBe(1350);
    // User fields stay pristine
    expect(updated.name).toBe('Checking');
    expect(updated.type).toBe('checking');
    expect(updated.notes).toBe('Direct deposit');

    // Dropped from the proposals queue
    expect(settings.plaidAccountProposals.map((p) => p.id)).toEqual(['acct-2']);
    // Fingerprint recorded in resolved memory
    const resolved = settings.plaidBalanceResolved;
    expect(resolved).toEqual(
      expect.arrayContaining([expect.objectContaining({ fingerprint: 'acct:acct-1:1350.00', decision: 'accept' })])
    );
  });

  it('declines an account proposal: preserves typed balance and remembers decision', () => {
    const proposal = { id: 'acct-2', proposedBalance: 5120, fingerprint: 'acct:acct-2:5120.00' };
    const ok = declineAccountProposal(proposal);

    expect(ok).toBe(true);
    const kept = accounts.find((a) => a.id === 'acct-2');
    expect(kept.balance).toBe(5000);

    // Dropped from queue and recorded as decline
    expect(settings.plaidAccountProposals.map((p) => p.id)).toEqual(['acct-1']);
    expect(settings.plaidBalanceResolved).toEqual(
      expect.arrayContaining([expect.objectContaining({ fingerprint: 'acct:acct-2:5120.00', decision: 'decline' })])
    );
  });

  it('handles accepting a proposal whose account was deleted', () => {
    const orphan = { id: 'gone', proposedBalance: 999, fingerprint: 'acct:gone:999.00' };
    const ok = acceptAccountProposal(orphan);

    expect(ok).toBe(false);
    expect(settings.plaidBalanceResolved).toEqual(
      expect.arrayContaining([expect.objectContaining({ fingerprint: 'acct:gone:999.00', decision: 'decline' })])
    );
  });

  it('acceptAllAccountProposals updates all accounts in queue safely', () => {
    acceptAllAccountProposals();

    expect(accounts.find((a) => a.id === 'acct-1').balance).toBe(1350);
    expect(accounts.find((a) => a.id === 'acct-2').balance).toBe(5120);
    expect(settings.plaidAccountProposals).toEqual([]);
    expect(pendingAccountProposals()).toHaveLength(0);
  });

  it('declineAllAccountProposals keeps all accounts unchanged safely', () => {
    declineAllAccountProposals();

    expect(accounts.find((a) => a.id === 'acct-1').balance).toBe(1200);
    expect(accounts.find((a) => a.id === 'acct-2').balance).toBe(5000);
    expect(settings.plaidAccountProposals).toEqual([]);
    expect(pendingAccountProposals()).toHaveLength(0);
  });

  it('deduplicates fingerprints in plaidBalanceResolved to preserve resolution capacity', () => {
    const proposal = { id: 'acct-1', proposedBalance: 1350, fingerprint: 'acct:acct-1:1350.00' };
    acceptAccountProposal(proposal);
    declineAccountProposal(proposal);

    const matches = (settings.plaidBalanceResolved || []).filter(
      (r) => ((r && r.fingerprint) || r) === proposal.fingerprint
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].decision).toBe('decline');
  });
});


