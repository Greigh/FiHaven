import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runAutopayMark } from '../../client/js/autopay.js';
import {
  payments,
  setBills,
  setCards,
  setPayments,
  setSettings,
  setEntitlement,
} from '../../client/js/storage.svelte.js';
import { isPaid, paidAmount } from '../../client/js/utils.js';

describe('integration — autopay + storage sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 20));
    localStorage.clear();
    document.body.innerHTML = '<div id="sync-status"></div>';
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    window.AppAuth = null;

    setSettings({ autopayMark: true, periodMode: 'calendar' });
    setEntitlement({ pro: true });
    setBills([{ id: 'B1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }]);
    setCards([]);
    setPayments([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('marks a due autopay bill, persists locally, and debounces a server sync', () => {
    expect(runAutopayMark()).toBe(true);

    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      type: 'bill',
      refId: 'B1',
      amount: 1500,
      note: 'Auto-marked (autopay)',
    });
    expect(isPaid('bill', 'B1')).toBe(true);
    expect(paidAmount('bill', 'B1')).toBe(1500);

    const cached = JSON.parse(localStorage.getItem('fh_payments'));
    expect(cached).toHaveLength(1);
    expect(cached[0].note).toBe('Auto-marked (autopay)');

    expect(fetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);

    expect(fetch).toHaveBeenCalledWith(
      '/api/data',
      expect.objectContaining({
        method: 'PUT',
        credentials: 'same-origin',
      }),
    );
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.payments).toHaveLength(1);
    expect(body.payments[0].refId).toBe('B1');
  });

  it('does not enqueue a sync when autopay finds nothing to add', () => {
    setPayments([{
      id: 'p1',
      type: 'bill',
      refId: 'B1',
      amount: 1500,
      date: '2026-06-20',
      monthKey: '2026-06',
    }]);

    expect(runAutopayMark()).toBe(false);
    vi.advanceTimersByTime(800);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('persists + syncs the per-month memory so a user undo is not resurrected', () => {
    expect(runAutopayMark()).toBe(true);
    expect(payments).toHaveLength(1);

    // The "already handled" memory is cached locally...
    const cachedSettings = JSON.parse(localStorage.getItem('fh_settings'));
    expect(cachedSettings.autopayDone['2026-06']).toContain('bill:B1');

    // ...and rides along in the debounced server sync.
    vi.advanceTimersByTime(800);
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.settings.autopayDone['2026-06']).toContain('bill:B1');

    // The user undoes the auto-mark by removing the payment. A re-run must
    // NOT bring it back — membership memory, not the payment, gates it.
    setPayments([]);
    expect(runAutopayMark()).toBe(false);
    expect(payments).toHaveLength(0);
  });

  it('marks a $0 autopay item once and keeps the undo undone', () => {
    setBills([]);
    setCards([{ id: 'C0', name: 'PaidOff', balance: 0, minPayment: 0, dueDay: 20, autopay: true }]);
    setSettings({ autopayMark: true, periodMode: 'calendar', paidGoal: 'minimum' });
    setEntitlement({ pro: true });
    setPayments([]);

    expect(runAutopayMark()).toBe(true);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ type: 'card', refId: 'C0', amount: 0 });

    // paidAmount stays 0 for a $0 item, so only the memory can stop a re-add.
    setPayments([]);
    expect(runAutopayMark()).toBe(false);
    expect(payments).toHaveLength(0);
  });
});
