import { describe, it, expect } from 'vitest';
import { effectiveRate, inActivePromo, rankCardsForCategory } from './rewards.js';

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

  it('handles empty and undefined input', () => {
    expect(rankCardsForCategory('Gas', [])).toEqual({ eligible: [], excluded: [] });
    expect(rankCardsForCategory('Gas')).toEqual({ eligible: [], excluded: [] });
  });
});
