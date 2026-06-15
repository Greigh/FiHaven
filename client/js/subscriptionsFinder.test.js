import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  monthlyOfBill,
  daysSince,
  buildSubscriptionItems,
  totalMonthlySubs,
  STALE_DAYS,
} from './subscriptionsFinder.js';
import * as tz from './tz.js';

describe('subscriptionsFinder — monthlyOfBill', () => {
  it('normalizes common bill frequencies to a monthly amount', () => {
    expect(monthlyOfBill({ amount: 1200, frequency: 'Monthly' })).toBe(1200);
    expect(monthlyOfBill({ amount: 300, frequency: 'Quarterly' })).toBe(100);
    expect(monthlyOfBill({ amount: 52, frequency: 'Weekly' })).toBeCloseTo((52 * 52) / 12);
    expect(monthlyOfBill({ amount: 100, frequency: 'Bi-weekly' })).toBeCloseTo((100 * 26) / 12);
    expect(monthlyOfBill({ amount: 120, frequency: 'Annually' })).toBe(10);
  });
});

describe('subscriptionsFinder — buildSubscriptionItems', () => {
  beforeEach(() => {
    vi.spyOn(tz, 'today').mockReturnValue(new Date(2026, 5, 15));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes active subscription bills and ignores ended ones', () => {
    const items = buildSubscriptionItems(
      [
        { id: 's1', name: 'Netflix', category: 'Subscriptions', amount: 15.99, frequency: 'Monthly' },
        { id: 's2', name: 'Old Gym', category: 'Subscriptions', amount: 40, frequency: 'Monthly', endDate: '2020-01-01' },
      ],
      [],
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: 'bill-s1', name: 'Netflix', source: 'bill', monthly: 15.99 });
  });

  it('detects recurring merchants seen in at least two months', () => {
    const items = buildSubscriptionItems(
      [],
      [
        { merchant: 'Spotify', amount: 10.99, date: '2026-04-05' },
        { merchant: 'Spotify', amount: 10.99, date: '2026-05-05' },
      ],
      new Date(2026, 5, 15).getTime(),
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: 'tx-Spotify',
      name: 'Spotify',
      source: 'tx',
      monthly: 10.99,
      stale: false,
      priceUp: null,
    });
  });

  it('flags price increases and stale recurring charges', () => {
    const staleDate = '2026-03-01';
    const now = new Date(2026, 5, 15).getTime();
    expect(daysSince(staleDate, now)).toBeGreaterThan(STALE_DAYS);

    const items = buildSubscriptionItems(
      [],
      [
        { merchant: 'Cloud', amount: 9, date: '2026-01-10' },
        { merchant: 'Cloud', amount: 9, date: '2026-02-10' },
        { merchant: 'Cloud', amount: 12, date: staleDate },
      ],
      now,
    );

    expect(items[0].priceUp).toBe(9);
    expect(items[0].stale).toBe(true);
  });

  it('sorts items by monthly cost descending', () => {
    const items = buildSubscriptionItems(
      [{ id: 'a', name: 'Cheap', category: 'Subscriptions', amount: 5, frequency: 'Monthly' }],
      [
        { merchant: 'Premium', amount: 20, date: '2026-04-01' },
        { merchant: 'Premium', amount: 20, date: '2026-05-01' },
      ],
    );

    expect(items.map((i) => i.name)).toEqual(['Premium', 'Cheap']);
    expect(totalMonthlySubs(items)).toBeCloseTo(25);
  });
});
