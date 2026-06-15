import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildSubscriptionItems, totalMonthlySubs } from '../../client/js/subscriptionsFinder.js';
import * as tz from '../../client/js/tz.js';

describe('integration — subscription finder + storage', () => {
  beforeEach(() => {
    vi.spyOn(tz, 'today').mockReturnValue(new Date(2026, 5, 15));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('combines flagged bills and recurring transactions from live storage', () => {
    const items = buildSubscriptionItems(
      [
        { id: 'sub1', name: 'Streaming', category: 'Subscriptions', amount: 14.99, frequency: 'Monthly', dueDay: 5 },
        { id: 'rent', name: 'Rent', category: 'Housing', amount: 1500, frequency: 'Monthly', dueDay: 1 },
      ],
      [
        { id: 't1', merchant: 'iCloud', amount: 2.99, date: '2026-04-12' },
        { id: 't2', merchant: 'iCloud', amount: 2.99, date: '2026-05-12' },
      ],
    );

    expect(items.map((i) => i.name)).toEqual(['Streaming', 'iCloud']);
    expect(totalMonthlySubs(items)).toBeCloseTo(17.98);

    const billItem = items.find((i) => i.source === 'bill');
    expect(billItem.nextDue).toBeTruthy();
  });
});
