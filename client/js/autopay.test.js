import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAutopayMark } from './autopay.js';
import {
  setBills,
  setCards,
  setPayments,
  setSettings,
  setEntitlement,
  payments,
} from './storage.svelte.js';

describe('autopay — runAutopayMark', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 20)); // Jun 20 local
    setSettings({ autopayMark: true, periodMode: 'calendar' });
    setEntitlement({ pro: true });
    setPayments([]);
    setCards([]);
    setBills([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when autopay is off or the user is not Pro', () => {
    setBills([{ id: 'B1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }]);

    setSettings({ autopayMark: false });
    expect(runAutopayMark()).toBe(false);

    setSettings({ autopayMark: true });
    setEntitlement({ pro: false });
    expect(runAutopayMark()).toBe(false);
    expect(payments).toHaveLength(0);
  });

  it('auto-marks an autopay bill that is due in the current period', () => {
    setBills([{ id: 'B1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }]);

    expect(runAutopayMark()).toBe(true);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      type: 'bill',
      refId: 'B1',
      name: 'Rent',
      amount: 1500,
      note: 'Auto-marked (autopay)',
    });
  });

  it('auto-marks an autopay card on its due day', () => {
    setCards([{ id: 'C1', name: 'Visa', balance: 1000, minPayment: 35, dueDay: 20, autopay: true }]);
    setSettings({ autopayMark: true, paidGoal: 'minimum' });

    expect(runAutopayMark()).toBe(true);
    expect(payments[0]).toMatchObject({
      type: 'card',
      refId: 'C1',
      name: 'Visa (payment)',
      amount: 35,
    });
  });

  it('is idempotent when a payment already exists or the item was skipped', () => {
    setBills([{ id: 'B1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }]);
    setPayments([{ id: 'p1', type: 'bill', refId: 'B1', amount: 1500, date: '2026-06-20', monthKey: '2026-06' }]);

    expect(runAutopayMark()).toBe(false);
    expect(payments).toHaveLength(1);

    setPayments([{ id: 's1', type: 'bill', refId: 'B1', amount: 0, skipped: true, date: '2026-06-20', monthKey: '2026-06' }]);
    expect(runAutopayMark()).toBe(false);
  });

  it('does not mark bills that are not yet due in the period', () => {
    vi.setSystemTime(new Date(2026, 5, 10)); // Jun 10
    setBills([{ id: 'B1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }]);

    expect(runAutopayMark()).toBe(false);
    expect(payments).toHaveLength(0);
  });
});
