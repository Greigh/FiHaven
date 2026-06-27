import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  offerDaysLeft, offerExpired, activeOffers, offersExpiringSoon,
  offerLikelyUsedTx, offerUseSuggestions,
} from './offers.js';

describe('offers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 20)); // Jun 20 2026
  });
  afterEach(() => vi.useRealTimers());

  const offer = (over) => ({ id: 'o', merchant: 'Uber', detail: '$5 back', expires: '2026-06-25', used: false, ...over });

  it('computes days left and expiry', () => {
    expect(offerDaysLeft(offer())).toBe(5);
    expect(offerExpired(offer())).toBe(false);
    expect(offerExpired(offer({ expires: '2026-06-10' }))).toBe(true);
    expect(offerDaysLeft(offer({ expires: '' }))).toBeNull();
    expect(offerExpired(offer({ expires: '' }))).toBe(false);
  });

  it('lists active offers across cards, soonest expiry first, dropping used/expired', () => {
    const cards = [
      { id: 'C1', offers: [
        offer({ id: 'a', expires: '2026-06-28' }),
        offer({ id: 'b', expires: '2026-06-22' }),
        offer({ id: 'used', expires: '2026-06-21', used: true }),
        offer({ id: 'gone', expires: '2026-06-01' }),
      ] },
      { id: 'C2', offers: [offer({ id: 'noexp', expires: '' })] },
    ];
    const list = activeOffers(cards);
    expect(list.map((x) => x.offer.id)).toEqual(['b', 'a', 'noexp']); // 2d, 8d, then no-expiry last
    expect(list[0].card.id).toBe('C1');
  });

  it('counts offers expiring within a window', () => {
    const cards = [{ id: 'C1', offers: [
      offer({ id: 'soon', expires: '2026-06-23' }),  // 3d
      offer({ id: 'later', expires: '2026-07-15' }), // 25d
    ] }];
    expect(offersExpiringSoon(cards)).toBe(1);        // default 7d
    expect(offersExpiringSoon(cards, 30)).toBe(2);
  });

  it('handles cards with no offers', () => {
    expect(activeOffers([{ id: 'C1' }])).toEqual([]);
    expect(activeOffers([])).toEqual([]);
  });

  it('suggests an offer was used from a matching recent transaction', () => {
    const o = offer({ id: 'a', merchant: 'Uber Eats', expires: '2026-06-30' });
    const txns = [
      { merchant: 'UBER EATS 8843', amount: 22, date: '2026-06-18' }, // matches
      { merchant: 'UBER EATS 1102', amount: 14, date: '2026-06-19' }, // newer match
      { merchant: 'Whole Foods', amount: 60, date: '2026-06-19' },    // unrelated
      { merchant: 'Uber Eats refund', amount: -5, date: '2026-06-19' }, // inflow ignored
    ];
    const tx = offerLikelyUsedTx(o, txns);
    expect(tx).not.toBeNull();
    expect(tx.date).toBe('2026-06-19'); // most recent match wins
  });

  it('ignores used offers, stale transactions, and short merchant names', () => {
    expect(offerLikelyUsedTx(offer({ used: true }), [{ merchant: 'Uber', amount: 5, date: '2026-06-19' }])).toBeNull();
    // Outside the 60-day window.
    expect(offerLikelyUsedTx(offer({ merchant: 'Uber' }), [{ merchant: 'Uber', amount: 5, date: '2026-01-01' }])).toBeNull();
    // Too-short merchant string can't match safely.
    expect(offerLikelyUsedTx(offer({ merchant: 'X' }), [{ merchant: 'X mart', amount: 5, date: '2026-06-19' }])).toBeNull();
  });

  it('collects use-suggestions across cards, skipping used/expired offers', () => {
    const cards = [
      { id: 'C1', offers: [
        offer({ id: 'match', merchant: 'Best Buy', expires: '2026-06-30' }),
        offer({ id: 'used', merchant: 'Best Buy', expires: '2026-06-30', used: true }),
        offer({ id: 'expired', merchant: 'Best Buy', expires: '2026-06-01' }),
      ] },
    ];
    const txns = [{ merchant: 'BEST BUY #14', amount: 200, date: '2026-06-15' }];
    const out = offerUseSuggestions(cards, txns);
    expect(out.map((x) => x.offer.id)).toEqual(['match']);
    expect(out[0].tx.merchant).toBe('BEST BUY #14');
  });
});
