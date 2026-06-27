import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  perkCycleKey, perkCycleBounds, perkExpiresInDays,
  perkUsed, perkRemaining, unrealizedCreditTotal, perksAnnualValue, setPerkUsage,
  perksCapturedAnnual, cardFeeAssessment, cyclesPerYear,
} from './perks.js';
import { setSettings, setCards, settings } from './storage.svelte.js';

describe('perks — cycle keys', () => {
  it('keys each frequency from a date', () => {
    const d = new Date(2026, 5, 20); // Jun 20 2026 (month index 5 → Q2, H1)
    expect(perkCycleKey('monthly', d)).toBe('2026-06');
    expect(perkCycleKey('quarterly', d)).toBe('2026-Q2');
    expect(perkCycleKey('semiannual', d)).toBe('2026-H1');
    expect(perkCycleKey('annual', d)).toBe('2026');
  });

  it('rolls quarter/half at the right month boundaries', () => {
    expect(perkCycleKey('quarterly', new Date(2026, 8, 1))).toBe('2026-Q3'); // Sep
    expect(perkCycleKey('quarterly', new Date(2026, 9, 1))).toBe('2026-Q4'); // Oct
    expect(perkCycleKey('semiannual', new Date(2026, 6, 1))).toBe('2026-H2'); // Jul
  });
});

describe('perks — cycle bounds & expiry', () => {
  it('bounds the monthly and quarterly cycle', () => {
    const m = perkCycleBounds('monthly', new Date(2026, 5, 20));
    expect(m.start).toEqual(new Date(2026, 5, 1));
    expect(m.end).toEqual(new Date(2026, 6, 1));
    const q = perkCycleBounds('quarterly', new Date(2026, 5, 20));
    expect(q.start).toEqual(new Date(2026, 3, 1)); // Apr 1
    expect(q.end).toEqual(new Date(2026, 6, 1));    // Jul 1
  });

  it('counts days left in the cycle', () => {
    // Jun 20 → end Jul 1; days remaining (excluding today) = 10.
    expect(perkExpiresInDays('monthly', new Date(2026, 5, 20))).toBe(10);
  });
});

describe('perks — usage tracking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 20));
    setSettings({});
    setCards([]);
  });
  afterEach(() => vi.useRealTimers());

  const perk = { id: 'P1', label: 'Uber Cash', amount: 10, frequency: 'monthly' };

  it('defaults to zero used and full remaining', () => {
    expect(perkUsed('C1', perk)).toBe(0);
    expect(perkRemaining('C1', perk)).toBe(10);
  });

  it('records used amount and computes remaining, clamped to the cap', () => {
    setPerkUsage('C1', perk, 6);
    expect(perkUsed('C1', perk)).toBe(6);
    expect(perkRemaining('C1', perk)).toBe(4);

    setPerkUsage('C1', perk, 999); // over the cap
    expect(perkUsed('C1', perk)).toBe(10);
    expect(perkRemaining('C1', perk)).toBe(0);

    setPerkUsage('C1', perk, 0); // clearing removes the entry
    expect(settings.perkUsage['C1:P1:2026-06']).toBeUndefined();
    expect(perkRemaining('C1', perk)).toBe(10);
  });

  it('keys usage by cycle, so a new month starts fresh', () => {
    setPerkUsage('C1', perk, 10);
    expect(perkRemaining('C1', perk)).toBe(0);

    vi.setSystemTime(new Date(2026, 6, 5)); // July
    expect(perkUsed('C1', perk)).toBe(0);
    expect(perkRemaining('C1', perk)).toBe(10);
  });

  it('prunes usage entries from cycles older than last year', () => {
    setSettings({ perkUsage: { 'C1:P1:2023-06': 5, 'C1:P1:2025-06': 5 } });
    setPerkUsage('C1', perk, 3); // current year 2026 → minYear 2025
    expect(settings.perkUsage['C1:P1:2023-06']).toBeUndefined(); // dropped
    expect(settings.perkUsage['C1:P1:2025-06']).toBe(5);          // kept
    expect(settings.perkUsage['C1:P1:2026-06']).toBe(3);
  });
});

describe('perks — portfolio totals', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 20));
    setSettings({});
  });
  afterEach(() => vi.useRealTimers());

  it('sums unused credit across cards and annualizes a card', () => {
    const cards = [
      { id: 'C1', perks: [{ id: 'P1', label: 'Uber', amount: 10, frequency: 'monthly' }] },
      { id: 'C2', perks: [{ id: 'P2', label: 'Travel', amount: 300, frequency: 'annual' }] },
    ];
    setCards(cards);
    expect(unrealizedCreditTotal(cards)).toBe(310);

    setPerkUsage('C1', cards[0].perks[0], 4);
    expect(unrealizedCreditTotal(cards)).toBe(306); // 6 left + 300 left

    expect(perksAnnualValue(cards[0])).toBe(120); // $10 × 12
    expect(perksAnnualValue(cards[1])).toBe(300);
  });
});

describe('perks — annual-fee assessment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 20));
    setSettings({});
    setCards([]);
  });
  afterEach(() => vi.useRealTimers());

  it('cyclesPerYear maps each frequency', () => {
    expect(cyclesPerYear('monthly')).toBe(12);
    expect(cyclesPerYear('quarterly')).toBe(4);
    expect(cyclesPerYear('semiannual')).toBe(2);
    expect(cyclesPerYear('annual')).toBe(1);
  });

  it('returns null for a fee-free card', () => {
    expect(cardFeeAssessment({ id: 'C1', perks: [] })).toBeNull();
    expect(cardFeeAssessment({ id: 'C1', annualFee: 0, perks: [] })).toBeNull();
  });

  it('verdicts on captured vs potential perk value', () => {
    // $95 fee, one $10/mo credit → $120/yr potential.
    const card = { id: 'C1', annualFee: 95, perks: [{ id: 'P1', label: 'Uber', amount: 10, frequency: 'monthly' }] };
    setCards([card]);

    // No usage logged → captured 0, but potential ($120) covers the fee → optimize.
    let a = cardFeeAssessment(card);
    expect(a).toMatchObject({ fee: 95, potential: 120, captured: 0, verdict: 'optimize' });
    expect(a.net).toBe(-95);

    // Use $10 this month → annualized captured $120 ≥ fee → keep.
    setPerkUsage('C1', card.perks[0], 10);
    a = cardFeeAssessment(card);
    expect(a.captured).toBe(120);
    expect(a.net).toBe(25);
    expect(a.verdict).toBe('keep');
  });

  it('flags a fee that perks can never cover as review', () => {
    const card = { id: 'C2', annualFee: 550, perks: [{ id: 'P1', label: 'Travel', amount: 100, frequency: 'annual' }] };
    expect(cardFeeAssessment(card)).toMatchObject({ potential: 100, verdict: 'review' });
  });

  it('folds a spend-based rewards estimate into the verdict', () => {
    // $95 fee, one $10/mo credit ($120/yr potential), no usage logged.
    const card = { id: 'C1', annualFee: 95, perks: [{ id: 'P1', label: 'Uber', amount: 10, frequency: 'monthly' }] };
    setCards([card]);

    // Without a rewards estimate: captured 0 → optimize (potential covers it).
    expect(cardFeeAssessment(card)).toMatchObject({ rewards: 0, value: 0, verdict: 'optimize' });

    // A $100 rewards estimate alone already covers the $95 fee → keep.
    const a = cardFeeAssessment(card, undefined, 100);
    expect(a.rewards).toBe(100);
    expect(a.value).toBe(100);     // captured 0 + rewards 100
    expect(a.net).toBe(5);
    expect(a.verdict).toBe('keep');

    // Negative / junk estimates are floored at 0 (unchanged verdict).
    expect(cardFeeAssessment(card, undefined, -50)).toMatchObject({ rewards: 0, verdict: 'optimize' });
  });

  it('annualizes captured usage and caps at the perk value', () => {
    const card = { id: 'C3', annualFee: 0, perks: [{ id: 'P1', label: 'Dining', amount: 25, frequency: 'quarterly' }] };
    setCards([card]);
    setPerkUsage('C3', card.perks[0], 999); // clamps to $25
    expect(perksCapturedAnnual(card)).toBe(100); // $25 × 4 quarters
  });
});
