import { describe, it, expect } from 'vitest';
import {
  mergeDataset, mergeList, mergeRecord, mergeSettings, deepEqual,
} from './syncMerge.js';

const bill = (id, extra) => Object.assign({ id, name: 'Rent', amount: 1500 }, extra);

describe('syncMerge — deepEqual', () => {
  it('ignores key order but not values', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual(null, undefined)).toBe(true);
    expect(deepEqual(0, '0')).toBe(false);
  });
});

describe('syncMerge — mergeRecord', () => {
  const base = { id: 'b1', name: 'Rent', amount: 1500, note: '' };

  it('keeps a change from each side when they touch different fields', () => {
    const local = { ...base, amount: 1600 };
    const server = { ...base, name: 'Rent + parking' };
    expect(mergeRecord(base, local, server)).toEqual({
      id: 'b1', name: 'Rent + parking', amount: 1600, note: '',
    });
  });

  it('prefers the local value when both sides moved the same field', () => {
    const seen = [];
    const merged = mergeRecord(
      base,
      { ...base, amount: 1600 },
      { ...base, amount: 1700 },
      (k) => seen.push(k),
    );
    expect(merged.amount).toBe(1600);
    expect(seen).toEqual(['amount']);
  });

  it('does not call the same value from both sides a conflict', () => {
    const seen = [];
    mergeRecord(base, { ...base, amount: 1600 }, { ...base, amount: 1600 }, (k) => seen.push(k));
    expect(seen).toEqual([]);
  });

  it('carries a field added on either side', () => {
    const merged = mergeRecord(base, { ...base, autopay: true }, { ...base, dueDay: 5 });
    expect(merged.autopay).toBe(true);
    expect(merged.dueDay).toBe(5);
  });

  it('treats a removed field as a change, and lets a local removal stand', () => {
    const local = { id: 'b1', name: 'Rent', amount: 1500 };  // note dropped
    expect(mergeRecord(base, local, base)).not.toHaveProperty('note');
  });
});

describe('syncMerge — mergeList', () => {
  it('keeps an addition from each side', () => {
    const base = [bill('b1')];
    const local = [bill('b1'), bill('b2', { name: 'Phone' })];
    const server = [bill('b1'), bill('b3', { name: 'Gas' })];
    expect(mergeList(base, local, server).map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
  });

  it('honours a delete from either side over a concurrent edit', () => {
    const base = [bill('b1'), bill('b2')];
    // b1 deleted here while edited there; b2 the other way round.
    const local = [bill('b2', { amount: 99 })];
    const server = [bill('b1', { amount: 99 })];
    expect(mergeList(base, local, server)).toEqual([]);
  });

  it('takes the server copy of a record this device never touched', () => {
    const base = [bill('b1')];
    const local = [bill('b1')];
    const server = [bill('b1', { amount: 2000 })];
    expect(mergeList(base, local, server)[0].amount).toBe(2000);
  });

  it('keeps the local copy of a record nobody else touched', () => {
    const base = [bill('b1')];
    const local = [bill('b1', { amount: 2000 })];
    const server = [bill('b1')];
    expect(mergeList(base, local, server)[0].amount).toBe(2000);
  });

  it('carries through a local record that has no id to match on', () => {
    const merged = mergeList([], [{ name: 'no id' }], []);
    expect(merged).toEqual([{ name: 'no id' }]);
  });

  it('orders local records first, then whatever arrived from elsewhere', () => {
    const base = [];
    const local = [bill('l1'), bill('l2')];
    const server = [bill('s1'), bill('s2')];
    expect(mergeList(base, local, server).map((b) => b.id)).toEqual(['l1', 'l2', 's1', 's2']);
  });
});

describe('syncMerge — mergeSettings', () => {
  it('merges income sources from both sides instead of picking one list', () => {
    const base = { incomes: [{ id: 's1', label: 'Acme', amount: 3000 }] };
    const local = { incomes: [base.incomes[0], { id: 's2', label: 'Side', amount: 500 }] };
    const server = { incomes: [{ id: 's1', label: 'Acme Corp', amount: 3000 }] };

    const merged = mergeSettings(base, local, server);
    expect(merged.incomes).toEqual([
      { id: 's1', label: 'Acme Corp', amount: 3000 },  // the rename from elsewhere
      { id: 's2', label: 'Side', amount: 500 },        // the paycheck added here
    ]);
  });

  it('merges income adjustments the same way', () => {
    const base = { incomeAdjustments: [] };
    const local = { incomeAdjustments: [{ id: 'a1', label: 'Bonus', amount: 500 }] };
    const server = { incomeAdjustments: [{ id: 'a2', label: 'PTO', amount: -200 }] };
    expect(mergeSettings(base, local, server).incomeAdjustments.map((a) => a.id))
      .toEqual(['a1', 'a2']);
  });

  it('never lets a stale local copy overwrite a server-owned key', () => {
    const base = { plaidBalanceProposals: [{ fingerprint: 'f1' }] };
    const local = { plaidBalanceProposals: [{ fingerprint: 'f1' }], income: 10 };
    const server = { plaidBalanceProposals: [{ fingerprint: 'f2' }] };
    expect(mergeSettings(base, local, server).plaidBalanceProposals)
      .toEqual([{ fingerprint: 'f2' }]);
  });

  it('unions the append-only decision lists so no answered question comes back', () => {
    const base = { plaidHidden: ['t1'] };
    const local = { plaidHidden: ['t1', 't2'] };
    const server = { plaidHidden: ['t1', 't3'] };
    expect(mergeSettings(base, local, server).plaidHidden).toEqual(['t1', 't2', 't3']);
  });

  it('field-merges ordinary scalars, local winning a true collision', () => {
    const base = { currency: 'USD', periodMode: 'calendar' };
    const local = { currency: 'GBP', periodMode: 'calendar' };
    const server = { currency: 'USD', periodMode: 'rolling' };
    const merged = mergeSettings(base, local, server);
    expect(merged).toEqual({ currency: 'GBP', periodMode: 'rolling' });
  });
});

describe('syncMerge — mergeDataset', () => {
  it('reconciles a bank sync against an unsynced income edit', () => {
    // The case this exists for: the bank imported transactions server-side
    // while this device was holding a new paycheck it had not pushed yet.
    const base = {
      bills: [bill('b1')],
      transactions: [],
      settings: { incomes: [{ id: 's1', label: 'Acme', amount: 3000 }] },
    };
    const local = {
      bills: [bill('b1')],
      transactions: [],
      settings: { incomes: [base.settings.incomes[0], { id: 's2', label: 'Side', amount: 500 }] },
    };
    const server = {
      bills: [bill('b1')],
      transactions: [{ id: 'plaid-1', amount: 12, source: 'plaid' }],
      settings: { incomes: [{ id: 's1', label: 'Acme', amount: 3000 }] },
    };

    const { data, conflicts } = mergeDataset(base, local, server);
    expect(data.transactions).toHaveLength(1);          // the bank rows land…
    expect(data.settings.incomes.map((s) => s.id)).toEqual(['s1', 's2']); // …and so does the paycheck
    expect(conflicts).toEqual([]);
  });

  it('reports the fields it had to pick a side on', () => {
    const base = { bills: [bill('b1')], settings: { income: 100 } };
    const local = { bills: [bill('b1', { amount: 10 })], settings: { income: 200 } };
    const server = { bills: [bill('b1', { amount: 20 })], settings: { income: 300 } };

    const { data, conflicts } = mergeDataset(base, local, server);
    expect(data.bills[0].amount).toBe(10);
    expect(data.settings.income).toBe(200);
    expect(conflicts).toEqual(['bills.amount', 'settings.income']);
  });

  it('produces every list even when the inputs are empty or absent', () => {
    const { data } = mergeDataset(null, null, null);
    expect(Object.keys(data).sort()).toEqual(
      ['accounts', 'bills', 'cards', 'goals', 'payments', 'settings', 'transactions'],
    );
    expect(data.bills).toEqual([]);
    expect(data.settings).toEqual({});
  });
});
