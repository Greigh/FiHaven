import { describe, it, expect } from 'vitest';
import { mergeTransactions } from './plaidMerge.js';

/* Plaid's transactions-sync cursor is destructive: once advanced, those
   transactions are never handed to us again. Bank import is opt-in and OFF by
   default, so a sync that runs while the gate is off must not advance the
   cursor — otherwise the user's history is consumed and thrown away, and
   turning the toggle on later leaves Spending empty forever.

   `merged` is the signal the caller uses to decide whether to advance. */

const tx = (id, amount = 10, extra = {}) => ({
  transaction_id: id,
  amount,
  date: '2026-07-01',
  name: 'Coffee',
  personal_finance_category: { primary: 'FOOD_AND_DRINK' },
  ...extra,
});

describe('plaidMerge — the opt-in gate guards the sync cursor', () => {
  it('imports nothing and reports merged:false when bank import is OFF', () => {
    const existing = [{ id: 'mine', amount: 5 }];
    const out = mergeTransactions({}, existing, { added: [tx('p1')] });

    // false is what tells the caller to leave the cursor alone, so Plaid offers
    // these same transactions again once the user opts in.
    expect(out.merged).toBe(false);
    expect(out.transactions).toBeNull();
  });

  it('imports and reports merged:true when bank import is ON', () => {
    const out = mergeTransactions(
      { plaidUpdatePurchases: true },
      [{ id: 'mine', amount: 5 }],
      { added: [tx('p1')] }
    );

    expect(out.merged).toBe(true);
    expect(out.transactions.some((t) => t.id === 'mine')).toBe(true);        // manual survives
    expect(out.transactions.some((t) => t.source === 'plaid')).toBe(true);   // bank added
  });

  it('reports merged:true for an empty diff so the cursor can still advance', () => {
    const out = mergeTransactions({}, [], { added: [], modified: [], removed: [] });
    expect(out.merged).toBe(true);
    expect(out.transactions).toBeNull();
  });
});

describe('plaidMerge — additive, outflows only', () => {
  const on = { plaidUpdatePurchases: true };

  it('never touches manual rows', () => {
    const manual = [
      { id: 'm1', amount: 5, category: 'Dining' },
      { id: 'm2', amount: 9, category: 'Groceries' },
    ];
    const out = mergeTransactions(on, manual, { added: [tx('p1'), tx('p2')] });

    expect(out.transactions.filter((t) => t.source !== 'plaid')).toEqual(manual);
    expect(out.transactions.filter((t) => t.source === 'plaid')).toHaveLength(2);
  });

  it('imports outflows only — a refund is money coming in, not spending', () => {
    // Plaid signs outflows positive.
    const out = mergeTransactions(on, [], { added: [tx('out', 12), tx('refund', -30)] });

    const bank = out.transactions.filter((t) => t.source === 'plaid');
    expect(bank).toHaveLength(1);
    expect(bank[0].plaidId).toBe('out');
    expect(bank[0].amount).toBe(12);
  });

  it('dedupes by plaid id rather than appending a second copy', () => {
    const first = mergeTransactions(on, [], { added: [tx('p1', 10)] });
    const second = mergeTransactions(on, first.transactions, { modified: [tx('p1', 25)] });

    const bank = second.transactions.filter((t) => t.source === 'plaid');
    expect(bank).toHaveLength(1);
    expect(bank[0].amount).toBe(25);   // updated in place
  });

  it('drops a transaction Plaid removed', () => {
    const first = mergeTransactions(on, [{ id: 'mine' }], { added: [tx('p1')] });
    const second = mergeTransactions(on, first.transactions, {
      removed: [{ transaction_id: 'p1' }],
    });

    expect(second.transactions.filter((t) => t.source === 'plaid')).toHaveLength(0);
    expect(second.transactions.filter((t) => t.id === 'mine')).toHaveLength(1);
  });

  it('never re-adds a bank transaction the user declined (plaidHidden)', () => {
    const settings = { plaidUpdatePurchases: true, plaidHidden: ['p1'] };
    const out = mergeTransactions(settings, [{ id: 'mine' }], { added: [tx('p1'), tx('p2')] });

    const bank = out.transactions.filter((t) => t.source === 'plaid');
    expect(bank.map((t) => t.plaidId)).toEqual(['p2']);   // p1 stays declined
    expect(out.merged).toBe(true);
  });

  it('keeps a declined pending charge hidden after it posts under a new id', () => {
    // Decline pending "pend1"; it later posts as "post1" pointing back at it.
    const settings = { plaidUpdatePurchases: true, plaidHidden: ['pend1'] };
    const out = mergeTransactions(settings, [], {
      added: [tx('post1', 10, { pending_transaction_id: 'pend1' })],
    });
    expect(out.transactions.filter((t) => t.source === 'plaid')).toHaveLength(0);
  });

  it('prunes an already-stored bank row once it is declined', () => {
    const stored = mergeTransactions(on, [], { added: [tx('p1')] }).transactions;
    // User declines p1 (settings now list it) and a later sync brings a new row.
    const out = mergeTransactions(
      { plaidUpdatePurchases: true, plaidHidden: ['p1'] },
      stored,
      { added: [tx('p2')] },
    );
    const bank = out.transactions.filter((t) => t.source === 'plaid');
    expect(bank.map((t) => t.plaidId)).toEqual(['p2']);
  });

  it('maps Plaid categories onto FiHaven ones', () => {
    const out = mergeTransactions(on, [], {
      added: [
        tx('a', 10, { personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'GROCERIES' } }),
        tx('b', 10, { personal_finance_category: { primary: 'TRANSPORTATION' } }),
        tx('c', 10, { personal_finance_category: { primary: 'WHO_KNOWS' } }),
      ],
    });
    const byId = Object.fromEntries(out.transactions.map((t) => [t.plaidId, t.category]));
    expect(byId.a).toBe('Groceries');
    expect(byId.b).toBe('Transport');
    expect(byId.c).toBe('Other');
  });
});
