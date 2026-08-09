import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAutopayMark } from './autopay.js';
import {
  setBills,
  setCards,
  setPayments,
  setSettings,
  setEntitlement,
  payments,
  settings,
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

  it('marks a card on its autopayDay even before the due day arrives', () => {
    // Pulls on the 18th (already past on Jun 20) though the statement is
    // due on the 25th (not yet here).
    setCards([{ id: 'C1', name: 'Visa', balance: 1000, minPayment: 35, dueDay: 25, autopayDay: 18, autopay: true }]);
    setSettings({ autopayMark: true, paidGoal: 'minimum' });

    expect(runAutopayMark()).toBe(true);
    expect(payments[0]).toMatchObject({ type: 'card', refId: 'C1', amount: 35 });
  });

  it('does not mark before the autopayDay even if the due day has passed', () => {
    // Due on the 20th (here) but autopay pulls on the 25th (not yet).
    setCards([{ id: 'C1', name: 'Visa', balance: 1000, minPayment: 35, dueDay: 20, autopayDay: 25, autopay: true }]);
    setSettings({ autopayMark: true, paidGoal: 'minimum' });

    expect(runAutopayMark()).toBe(false);
    expect(payments).toHaveLength(0);
  });

  it('marks an autopay bill on its autopayDay when due later in the period', () => {
    // Bill due on the 25th; autopay pulls on the 18th (already past on Jun 20).
    setBills([{ id: 'B1', name: 'Rent', amount: 1500, dueDay: 25, autopayDay: 18, autopay: true }]);

    expect(runAutopayMark()).toBe(true);
    expect(payments[0]).toMatchObject({ type: 'bill', refId: 'B1', amount: 1500 });
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

  it('only marks once: a user undo (removing the payment) is not reverted', () => {
    setBills([{ id: 'B1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }]);

    expect(runAutopayMark()).toBe(true);
    expect(payments).toHaveLength(1);

    // User undoes the auto-mark — remove the payment.
    setPayments([]);
    // It must not come back: the per-month memory remembers we handled it.
    expect(runAutopayMark()).toBe(false);
    expect(payments).toHaveLength(0);
  });

  it('handles $0 items: marks once and the undo sticks', () => {
    // A card whose payment goal is $0 (nothing owed). paidAmount can never
    // exceed the epsilon, so membership memory is what gates re-marking.
    setCards([{ id: 'C0', name: 'PaidOff', balance: 0, minPayment: 0, dueDay: 20, autopay: true }]);
    setSettings({ autopayMark: true, periodMode: 'calendar', paidGoal: 'minimum' });
    setEntitlement({ pro: true });

    expect(runAutopayMark()).toBe(true);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ type: 'card', refId: 'C0', amount: 0 });

    // Without the memory this would re-add forever; with it, no-op.
    expect(runAutopayMark()).toBe(false);
    expect(payments).toHaveLength(1);

    // And an undo stays undone.
    setPayments([]);
    expect(runAutopayMark()).toBe(false);
    expect(payments).toHaveLength(0);
  });

  it('keeps a $0 undo undone across a calendar-month boundary in a rolling period', () => {
    // Rolling window May 20 – Jun 29 (spans two calendar months). A $0 card
    // is auto-marked in May; the user undoes it; later, still inside the same
    // window but now in June, it must not silently come back.
    setCards([{ id: 'C0', name: 'PaidOff', balance: 0, minPayment: 0, dueDay: 28, autopay: true }]);
    setSettings({
      autopayMark: true, paidGoal: 'minimum',
      periodMode: 'rolling', periodLength: 40, periodAnchor: '2026-05-20',
    });
    setEntitlement({ pro: true });

    vi.setSystemTime(new Date(2026, 4, 28)); // May 28 — inside the window
    expect(runAutopayMark()).toBe(true);
    expect(payments).toHaveLength(1);
    expect(settings.autopayDone['2026-05']).toContain('card:C0');

    // User undoes it.
    setPayments([]);

    // Same window, now June — must stay undone (read crosses both months).
    vi.setSystemTime(new Date(2026, 5, 10)); // Jun 10
    expect(runAutopayMark()).toBe(false);
    expect(payments).toHaveLength(0);
  });

  // A blank amount is unfinished setup, not a $0 charge. Auto-marking it would
  // invent a payment that never happened, leave a phantom row in History, and
  // feed a 0 into recentPaymentAverage (which drives the rollover prefill).
  it('does not auto-mark a bill whose amount was never set', () => {
    setBills([{ id: 'B1', name: 'Water', amount: null, dueDay: 20, autopay: true }]);

    expect(runAutopayMark()).toBe(false);
    expect(payments).toHaveLength(0);
  });

  it('still auto-marks a bill deliberately set to $0', () => {
    // The point of the blank/zero split: an explicit 0 is a real answer, so it
    // behaves exactly as before. Only "never filled in" is held back.
    setBills([{ id: 'B1', name: 'Water', amount: 0, dueDay: 20, autopay: true }]);

    expect(runAutopayMark()).toBe(true);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ refId: 'B1', amount: 0 });
  });

  it('ignores items that are not on autopay', () => {
    setBills([{ id: 'B1', name: 'Rent', amount: 1500, dueDay: 20, autopay: false }]);
    setCards([{ id: 'C1', name: 'Visa', balance: 1000, minPayment: 35, dueDay: 20 }]);

    expect(runAutopayMark()).toBe(false);
    expect(payments).toHaveLength(0);
  });

  it('ignores a bill with no schedule and a card with no day to pull on', () => {
    // A bill needs either a due day or a first-due date to be schedulable.
    setBills([{ id: 'B1', name: 'Someday', amount: 50, autopay: true }]);
    // A card needs a due day (or an explicit autopay day).
    setCards([{ id: 'C1', name: 'Visa', balance: 1000, minPayment: 35, autopay: true }]);

    expect(runAutopayMark()).toBe(false);
    expect(payments).toHaveLength(0);
  });

  it('does not mark a bill on its autopayDay when the bill is not due this period', () => {
    // Annual bill anchored in January: nothing is scheduled in June, so the
    // autopay day (the 18th, already past) must not trigger a mark.
    setBills([{
      id: 'B1', name: 'Domain renewal', amount: 20,
      frequency: 'Annually', startDate: '2026-01-10', autopayDay: 18, autopay: true,
    }]);

    expect(runAutopayMark()).toBe(false);
    expect(payments).toHaveLength(0);
  });

  it('does not mark a bill before its autopayDay arrives', () => {
    // Due on the 20th (already here) but autopay pulls on the 25th.
    setBills([{ id: 'B1', name: 'Rent', amount: 1500, dueDay: 20, autopayDay: 25, autopay: true }]);

    expect(runAutopayMark()).toBe(false);
    expect(payments).toHaveLength(0);
  });

  it('names an unnamed card in the payment it records', () => {
    setCards([{ id: 'C1', balance: 1000, minPayment: 35, dueDay: 20, autopay: true }]);
    setSettings({ autopayMark: true, periodMode: 'calendar', paidGoal: 'minimum' });

    expect(runAutopayMark()).toBe(true);
    expect(payments[0].name).toBe('Card (payment)');
  });

  /* A rolling window can start mid-month, so an autopay day earlier in the
     month than the window's start belongs to the NEXT calendar month's
     occurrence — not to a day that already passed before the period began. */
  it('rolls an autopayDay that precedes the period start into the next month', () => {
    setSettings({
      autopayMark: true, paidGoal: 'minimum',
      periodMode: 'rolling', periodLength: 35, periodAnchor: '2026-06-15',
    });
    setCards([{ id: 'C1', name: 'Visa', balance: 1000, minPayment: 35, dueDay: 28, autopayDay: 5, autopay: true }]);

    // Window is Jun 15 – Jul 20. On Jun 20 the 5th has not come round again.
    vi.setSystemTime(new Date(2026, 5, 20));
    expect(runAutopayMark()).toBe(false);
    expect(payments).toHaveLength(0);

    // By Jul 6 the July 5th pull is inside the window and in the past.
    vi.setSystemTime(new Date(2026, 6, 6));
    expect(runAutopayMark()).toBe(true);
    expect(payments[0]).toMatchObject({ type: 'card', refId: 'C1', amount: 35 });
  });

  /* The per-month memory is pruned as it is written: buckets older than the
     longest rolling window a client may read across are dropped, this month's
     is merged rather than replaced, and everything in between is kept. */
  it('merges into this month’s memory and prunes buckets older than four months', () => {
    setBills([{ id: 'B1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }]);
    setSettings({
      autopayMark: true, periodMode: 'calendar',
      autopayDone: {
        '2025-11': ['bill:ANCIENT'],  // older than the 4-month window → dropped
        '2026-04': ['bill:KEEP'],     // inside the window → kept
        '2026-06': ['bill:EARLIER'],  // this month → merged with the new mark
      },
    });

    expect(runAutopayMark()).toBe(true);
    expect(Object.keys(settings.autopayDone).sort()).toEqual(['2026-04', '2026-06']);
    expect(settings.autopayDone['2026-04']).toEqual(['bill:KEEP']);
    expect(settings.autopayDone['2026-06'].sort()).toEqual(['bill:B1', 'bill:EARLIER']);
  });

  it('does not auto-mark a loan whose monthly payment was never set', () => {
    setCards([{
      id: 'L1', name: 'Mortgage', type: 'loan', balance: 250000,
      minPayment: null, dueDay: 20, autopay: true,
    }]);
    setSettings({ autopayMark: true, paidGoal: 'minimum', periodMode: 'calendar' });
    setEntitlement({ pro: true });

    expect(runAutopayMark()).toBe(false);
    expect(payments).toHaveLength(0);
  });
});
