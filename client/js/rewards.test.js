import { describe, it, expect } from 'vitest';
import {
  effectiveRate, pointValue, effectiveValue, inActivePromo, rankCardsForCategory,
  rewardExplanation, walletStrategy, txRewardCategory, categorySpendAnnual,
  cardRewardsEstimateAnnual,
} from './rewards.js';

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

describe('rewards — rewardExplanation', () => {
  it('explains a category bonus vs. the flat base for a cash card', () => {
    const card = { rewardBase: 1, rewardCategories: { Dining: 4 } };
    expect(rewardExplanation(card, 'Dining')).toBe('4% back on dining');
    expect(rewardExplanation(card, 'Gas')).toBe('1% back on everything');
  });

  it('breaks down a points card into a cash-equivalent return', () => {
    const bilt = { rewardBase: 1, rewardCategories: { Dining: 3 }, pointValue: 2 };
    expect(rewardExplanation(bilt, 'Dining')).toBe('3× points · 2¢/pt = 6% back on dining');
  });

  it('reports when no rate is set', () => {
    expect(rewardExplanation({}, 'Gas')).toBe('No reward rate set');
  });
});

describe('rewards — walletStrategy', () => {
  it('picks the best eligible card per category', () => {
    const cards = [
      { id: 'din', name: 'Diner', rewardBase: 1, rewardCategories: { Dining: 4 } },
      { id: 'flat', name: 'Flat', rewardBase: 2 },
    ];
    const out = walletStrategy(cards, ['Dining', 'Gas']);
    expect(out[0].category).toBe('Dining');
    expect(out[0].best.card.id).toBe('din');   // 4% beats 2%
    expect(out[1].category).toBe('Gas');
    expect(out[1].best.card.id).toBe('flat');  // 2% base beats 1% base
  });

  it('returns a null best for a category no card earns in', () => {
    const out = walletStrategy([{ id: 'x', name: 'X', rewardCategories: {} }], ['Gas']);
    expect(out[0].best).toBeNull();
  });
});

describe('rewards — spend categorization & estimate', () => {
  const today = new Date();
  const ymd = (offsetDays) => {
    const d = new Date(today.getTime() - offsetDays * 864e5);
    return d.toISOString().slice(0, 10);
  };

  it('txRewardCategory prefers a merchant hint, then the tx category, else Other', () => {
    expect(txRewardCategory({ merchant: 'Starbucks', category: 'Whatever' })).toBe('Dining');
    expect(txRewardCategory({ merchant: 'Unknown Shop', category: 'Groceries' })).toBe('Groceries');
    expect(txRewardCategory({ merchant: 'Unknown Shop', category: 'NotACategory' })).toBe('Other');
  });

  it('annualizes category spend over the data window', () => {
    // ~180 days of data → factor ~2. Dining via merchant hint, Gas via category.
    const txns = [
      { merchant: 'Starbucks', amount: 50, date: ymd(10) },
      { merchant: 'Chipotle', amount: 50, date: ymd(170) },
      { merchant: 'Some Station', category: 'Gas', amount: 100, date: ymd(170) },
      { merchant: 'refund', amount: -20, date: ymd(5) }, // inflow ignored
    ];
    const out = categorySpendAnnual(txns, today);
    // 100 dining + 100 gas over a 170-day window → ×(365/170)≈2.15
    expect(out.Dining).toBeGreaterThan(180);
    expect(out.Gas).toBeGreaterThan(180);
    expect(out).not.toHaveProperty('Other'); // nothing fell through
  });

  it('never counts a transfer toward category spend', () => {
    // A card payment is an outflow like any other, and "Chase Card Payment"
    // has no merchant hint — so before the gate it landed in Other and
    // inflated the annualized spend the rewards optimizer reasons about.
    // A card recommended on the strength of your own card payments is worse
    // than no recommendation.
    const txns = [
      { merchant: 'Chipotle', amount: 100, date: ymd(10) },
      { merchant: 'Chase Card Payment', category: 'Transfer', amount: 2500, date: ymd(9) },
    ];
    const out = categorySpendAnnual(txns, today);
    expect(out).not.toHaveProperty('Transfer');
    // The payment must not reappear under any other bucket either.
    const total = Object.values(out).reduce((a, b) => a + b, 0);
    const dining = categorySpendAnnual([txns[0]], today);
    expect(total).toBeCloseTo(Object.values(dining).reduce((a, b) => a + b, 0), 6);
  });

  it('returns {} when there are no usable transactions', () => {
    expect(categorySpendAnnual([], today)).toEqual({});
    expect(categorySpendAnnual([{ amount: -5, date: ymd(1) }], today)).toEqual({});
  });

  it('estimates rewards only on a card’s bonus categories', () => {
    const spend = { Dining: 1000, Gas: 1000, Other: 5000 };
    // 4× dining at 1¢ = 4% → $40 on $1000 dining. Gas/Other have no bonus → ignored.
    const card = { rewardBase: 1, rewardCategories: { Dining: 4 } };
    expect(cardRewardsEstimateAnnual(card, spend)).toBe(40);
    // Points card: 3× dining × 2¢/pt = 6% → $60.
    const pts = { rewardBase: 1, rewardCategories: { Dining: 3 }, pointValue: 2 };
    expect(cardRewardsEstimateAnnual(pts, spend)).toBe(60);
    // Loans earn nothing.
    expect(cardRewardsEstimateAnnual({ type: 'loan', rewardCategories: { Dining: 4 } }, spend)).toBe(0);
  });
});

/* The optimizer runs over whatever the user typed in, so every helper has to
   survive a half-filled card, an empty wallet, and a transaction list that is
   missing or full of junk dates. */
describe('rewards — partial cards and empty input', () => {
  it('ranks the excluded promo cards among themselves too', () => {
    // Both are set aside, but the UI still shows them in value order.
    const { excluded } = rankCardsForCategory('Dining', [
      { id: 'lowPromo', rewardCategories: { Dining: 2 }, hasPromo: true, promoEndDate: future() },
      { id: 'highPromo', rewardCategories: { Dining: 5 }, hasPromo: true, promoEndDate: future() },
    ]);
    expect(excluded.map((e) => e.card.id)).toEqual(['highPromo', 'lowPromo']);
  });

  it('explains a category bonus on a card with no base rate at all', () => {
    // No rewardBase → base reads as 0, so any category rate is a bonus.
    expect(rewardExplanation({ rewardCategories: { Dining: 3 } }, 'Dining'))
      .toBe('3% back on dining');
    // No categories object either → the base is all there is.
    expect(rewardExplanation({ rewardBase: 2 }, 'Dining')).toBe('2% back on everything');
  });

  it('walletStrategy tolerates a missing category list and a wallet that earns nothing', () => {
    expect(walletStrategy([{ id: 'x', rewardBase: 1 }])).toEqual([]);
    // Every card is in a promo, so nothing is eligible for any category.
    const out = walletStrategy(
      [{ id: 'p', rewardBase: 5, hasPromo: true, promoEndDate: future() }],
      ['Dining'],
    );
    expect(out[0].best).toBeNull();
  });

  it('categorySpendAnnual ignores rows with no date or an unusable one', () => {
    const today = new Date();
    const out = categorySpendAnnual([
      { merchant: 'Starbucks', amount: 40, date: '' },
      { merchant: 'Starbucks', amount: 40, date: 'not-a-date' },
      { merchant: 'Starbucks', amount: 40, date: '2026' },
      { merchant: 'Starbucks', amount: 40, date: '0000-01-01' },
    ], today);
    expect(out).toEqual({});
  });

  it('categorySpendAnnual drops rows outside the trailing year', () => {
    const today = new Date(2026, 5, 15);
    const out = categorySpendAnnual([
      { merchant: 'Starbucks', amount: 100, date: '2024-01-01' }, // too old
      { merchant: 'Starbucks', amount: 100, date: '2026-12-01' }, // in the future
      { merchant: 'Starbucks', amount: 'oops', date: '2026-06-10' }, // no usable amount
    ], today);
    expect(out).toEqual({});
  });

  it('categorySpendAnnual clamps a same-day window to 30 days before annualizing', () => {
    const today = new Date(2026, 5, 15);
    // One transaction dated today → a zero-day span, which must not blow up
    // into a division by zero or a wild extrapolation.
    const out = categorySpendAnnual([
      { merchant: 'Starbucks', amount: 100, date: '2026-06-15' },
    ], today);
    expect(out.Dining).toBe(Math.round(100 * (365 / 30)));
  });

  it('categorySpendAnnual works with no arguments at all', () => {
    // No list, and no reference date → "now" from the user's time zone.
    expect(categorySpendAnnual()).toEqual({});
  });

  it('cardRewardsEstimateAnnual tolerates a bare card and unusable spend', () => {
    // No rewardBase and no rewardCategories: nothing beats the base, so $0.
    expect(cardRewardsEstimateAnnual({}, { Dining: 1000 })).toBe(0);
    // No spend map at all.
    expect(cardRewardsEstimateAnnual({ rewardBase: 1, rewardCategories: { Dining: 4 } })).toBe(0);
    // Categories with no usable spend contribute nothing.
    expect(cardRewardsEstimateAnnual(
      { rewardBase: 1, rewardCategories: { Dining: 4 } },
      { Dining: 'lots', Gas: 0, Travel: -50 },
    )).toBe(0);
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
