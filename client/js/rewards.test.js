import { describe, it, expect } from 'vitest';
import { effectiveRate, pointValue, effectiveValue, inActivePromo, rankCardsForCategory } from './rewards.js';

const isoOffsetMonths = (months) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};
const future = () => isoOffsetMonths(12);
const past = () => isoOffsetMonths(-12);

describe('rewards — effectiveRate', () => {
  it('uses the category multiplier when one is set', () => {
    const card = { rewardBase: 1, rewardCategories: { Dining: 4 } };
    expect(effectiveRate(card, 'Dining')).toBe(4);
  });

  it('falls back to the base rate for an uncovered category', () => {
    const card = { rewardBase: 1.5, rewardCategories: { Dining: 4 } };
    expect(effectiveRate(card, 'Gas')).toBe(1.5);
  });

  it('treats a zero/missing rate as zero', () => {
    expect(effectiveRate({ rewardCategories: { Dining: 0 } }, 'Dining')).toBe(0);
    expect(effectiveRate({}, 'Dining')).toBe(0);
  });
});

describe('rewards — inActivePromo', () => {
  it('is true while the promo end date is still in the future', () => {
    expect(inActivePromo({ hasPromo: true, promoEndDate: future() })).toBe(true);
  });

  it('is false when expired, not a promo, or missing an end date', () => {
    expect(inActivePromo({ hasPromo: true, promoEndDate: past() })).toBe(false);
    expect(inActivePromo({ hasPromo: false, promoEndDate: future() })).toBe(false);
    expect(inActivePromo({ hasPromo: true })).toBe(false);
  });

  it('treats an unparseable promo end date as an active promo window', () => {
    expect(inActivePromo({ hasPromo: true, promoEndDate: 'not-a-date' })).toBe(true);
  });
});

describe('rewards — rankCardsForCategory', () => {
  it('ranks eligible cards high-to-low, excludes active-promo cards, and drops loans', () => {
    const list = [
      { id: 'a', name: 'A', rewardBase: 1, rewardCategories: { Dining: 2 } },
      { id: 'b', name: 'B', rewardBase: 3 },
      { id: 'promo', name: 'P', rewardBase: 5, hasPromo: true, promoEndDate: future() },
      { id: 'loan', name: 'Car loan', type: 'loan', rewardBase: 9 },
    ];

    const { eligible, excluded } = rankCardsForCategory('Dining', list);

    // b (3.0) outranks a (Dining 2.0); the promo card is set aside.
    expect(eligible.map((e) => e.card.id)).toEqual(['b', 'a']);
    expect(excluded.map((e) => e.card.id)).toEqual(['promo']);
    // The 0%-promo card carries a human-readable reason for the UI.
    expect(excluded[0].reason).toMatch(/^Skipped:/);
    // A loan never earns rewards and appears in neither bucket.
    const allIds = [...eligible, ...excluded].map((e) => e.card.id);
    expect(allIds).not.toContain('loan');
  });

  it('uses generic promo copy when the end date cannot be parsed', () => {
    const { excluded } = rankCardsForCategory('Dining', [
      { id: 'bad-date', name: 'Promo', rewardBase: 5, hasPromo: true, promoEndDate: 'not-a-date' },
    ]);
    expect(excluded[0].reason).toContain('its 0% promo');
  });

  it('includes a formatted end date in the skip reason for active promos', () => {
    const end = future();
    const { excluded } = rankCardsForCategory('Dining', [
      { id: 'promo', name: 'Promo', rewardBase: 5, hasPromo: true, promoEndDate: end },
    ]);
    expect(excluded[0].reason).toContain('0% promo until');
  });

  it('handles empty and undefined input', () => {
    expect(rankCardsForCategory('Gas', [])).toEqual({ eligible: [], excluded: [] });
    expect(rankCardsForCategory('Gas')).toEqual({ eligible: [], excluded: [] });
  });
});

describe('rewards — point value (cash-equivalent ranking)', () => {
  it('pointValue defaults to 1 and reads a positive override', () => {
    expect(pointValue({})).toBe(1);
    expect(pointValue({ pointValue: 0 })).toBe(1);   // 0/invalid → cash back
    expect(pointValue({ pointValue: 2.2 })).toBe(2.2);
  });

  it('effectiveValue is multiplier × point value', () => {
    const bilt = { rewardCategories: { Dining: 3 }, pointValue: 2.2 };
    expect(effectiveValue(bilt, 'Dining')).toBeCloseTo(6.6);
    const cash = { rewardBase: 2 }; // no pointValue → 1
    expect(effectiveValue(cash, 'Dining')).toBe(2);
  });

  it('ranks by cash value, so a points card can beat a higher-multiplier cash card', () => {
    const list = [
      { id: 'cash3', rewardCategories: { Dining: 3 } },                  // 3 × 1 = 3
      { id: 'pts3',  rewardCategories: { Dining: 3 }, pointValue: 2.2 }, // 3 × 2.2 = 6.6
      { id: 'cash5', rewardCategories: { Dining: 5 } },                  // 5 × 1 = 5
    ];
    const { eligible } = rankCardsForCategory('Dining', list);
    expect(eligible.map((e) => e.card.id)).toEqual(['pts3', 'cash5', 'cash3']);
    expect(eligible[0].value).toBeCloseTo(6.6);
    expect(eligible[0].rate).toBe(3);          // raw multiplier preserved
    expect(eligible[0].pointValue).toBe(2.2);
  });
});
