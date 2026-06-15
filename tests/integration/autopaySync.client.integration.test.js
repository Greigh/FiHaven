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
});
