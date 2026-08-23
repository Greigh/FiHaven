import { describe, it, expect } from 'vitest';
import { mergeTransactions, cleanMerchant, isTransferTx, TRANSFER_CATEGORY } from './plaidMerge.js';

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

describe('plaidMerge — account attribution', () => {
  const on = { plaidUpdatePurchases: true };

  it('tags each bank row with the account it came from', () => {
    const out = mergeTransactions(on, [], {
      added: [tx('p1', 10, { account_id: 'acct-gold' }), tx('p2', 20, { account_id: 'acct-plat' })],
    });
    const byId = Object.fromEntries(out.transactions.map((t) => [t.plaidId, t.accountId]));
    expect(byId.p1).toBe('acct-gold');
    expect(byId.p2).toBe('acct-plat');
  });

  it('falls back to an empty accountId rather than undefined', () => {
    // Older Plaid payloads (and our own fixtures) may omit account_id; the
    // field must still exist so native decoders see a consistent shape.
    const out = mergeTransactions(on, [], { added: [tx('p1')] });
    expect(out.transactions[0].accountId).toBe('');
  });

  it('keeps attribution across a modify', () => {
    const first = mergeTransactions(on, [], { added: [tx('p1', 10, { account_id: 'acct-gold' })] });
    const second = mergeTransactions(on, first.transactions, {
      modified: [tx('p1', 12, { account_id: 'acct-gold' })],
    });
    const row = second.transactions.find((t) => t.plaidId === 'p1');
    expect(row.amount).toBe(12);
    expect(row.accountId).toBe('acct-gold');
  });
});

/* A bank descriptor is machine-written: "BILT CARD PMT~Future Amount:
   4070.00~REF 90210" wraps to three lines in a transaction row and buries the
   two words a human actually reads. */
describe('plaidMerge — tidying bank descriptors', () => {
  const on = { plaidUpdatePurchases: true };

  it('keeps the leading name and drops the bank’s packed-on fields', () => {
    expect(cleanMerchant('BILT CARD PMT~Future Amount: 4070.00~REF 90210')).toBe('Bilt Card Payment');
  });

  it('strips trailing reference numbers, store numbers and processor prefixes', () => {
    expect(cleanMerchant('365 RETAIL MARKETS 8005551212')).toBe('365 Retail Markets');
    expect(cleanMerchant('COSTCO WHSE #1234')).toBe('Costco Whse');
    expect(cleanMerchant('SQ *COFFEE BAR')).toBe('Coffee Bar');
    expect(cleanMerchant('WALMART REF #A19X')).toBe('Walmart');
  });

  it('leaves an already-readable name alone', () => {
    expect(cleanMerchant('Trader Joe’s')).toBe('Trader Joe’s');
    expect(cleanMerchant('Amazon')).toBe('Amazon');
  });

  it('never cleans a name away to nothing', () => {
    // All reference number is still better than a blank row.
    expect(cleanMerchant('   000123456789')).toBe('000123456789');
    expect(cleanMerchant('')).toBe('');
  });

  it('cleans the merchant on import', () => {
    const out = mergeTransactions(on, [], {
      added: [tx('p1', 12, { name: 'SQ *BLUE BOTTLE~Ref 4471', merchant_name: null })],
    });
    expect(out.transactions[0].merchant).toBe('Blue Bottle');
  });
});

/* A credit-card payment is money moving between the user's own accounts. Its
   dollars were already counted as spending when the individual purchases
   posted, so letting it into a spend total double-counts them — a $4,070
   payment swamped a month of real groceries. */
describe('plaidMerge — card payments are transfers, not spending', () => {
  const on = { plaidUpdatePurchases: true };
  const pfc = (primary, detailed) => ({ personal_finance_category: { primary, detailed } });

  it('classifies Plaid’s card-payment category as Transfer', () => {
    const out = mergeTransactions(on, [], {
      added: [tx('p1', 4070, { name: 'BILT CARD PMT', ...pfc('LOAN_PAYMENTS', 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT') })],
    });
    expect(out.transactions[0].category).toBe(TRANSFER_CATEGORY);
  });

  it('falls back to the descriptor when the bank’s category is vague', () => {
    // Both a card word AND a payment word must appear.
    expect(isTransferTx({ name: 'BILT CARD PMT', ...pfc('LOAN_PAYMENTS', '') })).toBe(true);
    expect(isTransferTx({ name: 'CHASE CREDIT CRD AUTOPAY', ...pfc('TRANSFER_OUT', '') })).toBe(true);
    expect(isTransferTx({ name: 'CITY WATER PAYMENT', ...pfc('LOAN_PAYMENTS', '') })).toBe(false);
    expect(isTransferTx({ name: 'THE CARD SHOP', ...pfc('GENERAL_MERCHANDISE', '') })).toBe(false);
  });

  it('treats a real purchase as spending even when the name mentions a card', () => {
    const out = mergeTransactions(on, [], {
      added: [tx('p1', 30, { name: 'CARD SHOP', ...pfc('GENERAL_MERCHANDISE', '') })],
    });
    expect(out.transactions[0].category).toBe('Shopping');
  });
});

/* Plaid only re-sends a transaction when the BANK changes it, so a row stored
   before this tidy-up would keep its raw name and wrong category forever. The
   merge re-tidies stored rows on the way through — conservatively, so hand
   edits survive. */
describe('plaidMerge — re-tidying already-stored bank rows', () => {
  const on = { plaidUpdatePurchases: true };
  const stored = (extra) => ({ id: 'plaid-old', plaidId: 'old', source: 'plaid', amount: 4070, date: '2026-06-01', ...extra });

  it('cleans a raw stored descriptor and reclassifies the card payment', () => {
    const out = mergeTransactions(on, [stored({ merchant: 'BILT CARD PMT~Future Amount: 4070.00', category: 'Bills' })], {
      added: [tx('p1')],
    });
    const old = out.transactions.find((t) => t.plaidId === 'old');
    expect(old.merchant).toBe('Bilt Card Payment');
    expect(old.category).toBe(TRANSFER_CATEGORY);
  });

  it('leaves a name the user rewrote and a category they re-picked alone', () => {
    const out = mergeTransactions(on, [stored({ merchant: 'Bilt rent card', category: 'Housing' })], {
      added: [tx('p1')],
    });
    const old = out.transactions.find((t) => t.plaidId === 'old');
    expect(old.merchant).toBe('Bilt rent card');
    expect(old.category).toBe('Housing');
  });

  // 'Bills' and 'Other' are values a USER can pick too, so inferring "untouched"
  // from them re-filed a deliberate choice — and did it again on every sync, so
  // the correction could never stick. `autoCategory` records what the importer
  // actually chose, which is the only thing that can tell the two apart.
  it("keeps a card payment the user deliberately filed under Bills", () => {
    const row = stored({
      merchant: 'Chase Card Payment', category: 'Bills', autoCategory: TRANSFER_CATEGORY,
    });
    const out = mergeTransactions(on, [row], { added: [tx('p1')] });
    const old = out.transactions.find((t) => t.plaidId === 'old');
    expect(old.category).toBe('Bills');
  });

  it('stamps a legacy row so the next hand edit is respected', () => {
    // Pass 1: no autoCategory, so the old guess applies once…
    const first = mergeTransactions(on, [stored({ merchant: 'Chase Card Payment', category: 'Bills' })], {
      added: [tx('p1')],
    }).transactions.find((t) => t.plaidId === 'old');
    expect(first.category).toBe(TRANSFER_CATEGORY);
    expect(first.autoCategory).toBe(TRANSFER_CATEGORY);

    // …and once the user moves it back, it stays put across further syncs.
    let row = { ...first, category: 'Bills' };
    for (let i = 0; i < 3; i += 1) {
      row = mergeTransactions(on, [row], { added: [tx('p' + i)] })
        .transactions.find((t) => t.plaidId === 'old');
      expect(row.category).toBe('Bills');
    }
  });

  it('records what the importer chose on a freshly imported row', () => {
    const out = mergeTransactions(on, [], {
      added: [tx('p1', 10, { name: 'CHASE CREDIT CRD AUTOPAY', personal_finance_category: { primary: 'LOAN_PAYMENTS', detailed: '' } })],
    });
    const row = out.transactions.find((t) => t.plaidId === 'p1');
    expect(row.category).toBe(TRANSFER_CATEGORY);
    expect(row.autoCategory).toBe(TRANSFER_CATEGORY);
  });
});
