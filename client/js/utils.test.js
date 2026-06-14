import { describe, it, expect, beforeEach } from 'vitest';
import {
  recommendedAmount,
  promoNeeded,
  goalAmountFor,
  fmt,
  fmtShort,
  setMoneyFormat,
  monthKeyLabel,
  monthsUntil,
  daysUntilDate,
  paidAmount,
  isPaid,
  isSkipped,
  paidState,
  remainingForItem,
  daysUntilDue,
  nextDueDate,
  shortDate,
  paymentHistoryFor,
  daysSinceLastPayment,
  paymentStats,
  buildUpcomingItems,
  monthKey,
  monthLabel,
  offsetDate,
} from './utils.js';
import { setCards, setBills, setPayments, setSettings } from './storage.svelte.js';

const isoOffsetMonths = (months) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

// Local (not UTC) YYYY-MM-DD so a payment lands in the current calendar period.
const localIso = (d = new Date()) =>
  d.getFullYear() + '-' +
  String(d.getMonth() + 1).padStart(2, '0') + '-' +
  String(d.getDate()).padStart(2, '0');

describe('utils — recommendedAmount', () => {
  it('recommends the minimum for a loan, never the whole balance', () => {
    expect(recommendedAmount({ type: 'loan', balance: 250000, minPayment: 1500 })).toBe(1500);
  });

  it('lets a per-card override win', () => {
    expect(recommendedAmount({ balance: 1000, minPayment: 25, recommendedPayment: 200 })).toBe(200);
  });

  it('recommends paying the full balance on a non-promo card', () => {
    expect(recommendedAmount({ balance: 1000, minPayment: 25 })).toBe(1000);
  });

  it('spreads a promo balance but never drops below the minimum', () => {
    const card = {
      hasPromo: true,
      promoBalance: 1000,
      promoEndDate: isoOffsetMonths(10), // ~100/mo spread → minimum wins
      minPayment: 200,
    };
    expect(recommendedAmount(card)).toBe(200);
  });
});

describe('utils — promoNeeded', () => {
  it('spreads the promo balance across the remaining months', () => {
    const n = promoNeeded({ promoBalance: 1000, promoEndDate: isoOffsetMonths(5) });
    expect(n).toBeGreaterThan(150);
    expect(n).toBeLessThan(260);
  });

  it('returns the whole balance once the promo has ended', () => {
    expect(promoNeeded({ promoBalance: 500, promoEndDate: '2000-01-01' })).toBe(500);
  });
});

describe('utils — goalAmountFor (loan parity fix)', () => {
  beforeEach(() => {
    setBills([]);
    setPayments([]);
    setCards([{ id: 'L1', type: 'loan', balance: 200000, minPayment: 1200 }]);
  });

  it('uses the scheduled payment for a loan under every paid-goal policy', () => {
    for (const policy of ['minimum', 'recommended', 'full']) {
      setSettings({ paidGoal: policy });
      expect(goalAmountFor('card', 'L1')).toBe(1200);
    }
  });

  it('honors a per-loan override over the minimum', () => {
    setSettings({ paidGoal: 'recommended' });
    setCards([{ id: 'L2', type: 'loan', balance: 200000, minPayment: 1200, recommendedPayment: 1500 }]);
    expect(goalAmountFor('card', 'L2')).toBe(1500);
  });
});

describe('utils — goalAmountFor (bills and card policies)', () => {
  beforeEach(() => {
    setBills([{ id: 'B1', amount: 120 }]);
    setPayments([]);
    setCards([{ id: 'C1', balance: 1000, minPayment: 25 }]);
    setSettings({ paidGoal: 'recommended' });
  });

  it('a bill goal is simply its amount', () => {
    expect(goalAmountFor('bill', 'B1')).toBe(120);
  });

  it('a card goal follows the active paid-goal policy', () => {
    setSettings({ paidGoal: 'minimum' });
    expect(goalAmountFor('card', 'C1')).toBe(25);
    setSettings({ paidGoal: 'full' });
    expect(goalAmountFor('card', 'C1')).toBe(1000);
    setSettings({ paidGoal: 'recommended' }); // non-promo → pay the balance
    expect(goalAmountFor('card', 'C1')).toBe(1000);
  });
});

describe('utils — payment state', () => {
  beforeEach(() => {
    setBills([]);
    setSettings({ paidGoal: 'minimum' }); // flat goal = minPayment, avoids add-back
    setCards([{ id: 'C1', balance: 1000, minPayment: 100 }]);
    setPayments([]);
  });

  it('isPaid / paidAmount reflect a payment in the current period', () => {
    setPayments([{ id: 'p1', type: 'card', refId: 'C1', amount: 60, date: localIso() }]);
    expect(isPaid('card', 'C1')).toBe(true);
    expect(paidAmount('card', 'C1')).toBe(60);
  });

  it('a skipped record is not counted as a payment', () => {
    setPayments([{ id: 's1', type: 'card', refId: 'C1', amount: 0, skipped: true, date: localIso() }]);
    expect(isSkipped('card', 'C1')).toBe(true);
    expect(isPaid('card', 'C1')).toBe(false);
  });

  it('paidState transitions unpaid → partial → full', () => {
    expect(paidState('card', 'C1')).toBe('unpaid');
    setPayments([{ id: 'p1', type: 'card', refId: 'C1', amount: 40, date: localIso() }]);
    expect(paidState('card', 'C1')).toBe('partial');
    setPayments([{ id: 'p2', type: 'card', refId: 'C1', amount: 100, date: localIso() }]);
    expect(paidState('card', 'C1')).toBe('full');
    expect(remainingForItem('card', 'C1')).toBe(0);
  });

  it('a skipped item owes nothing and reads as skipped', () => {
    setPayments([{ id: 's1', type: 'card', refId: 'C1', amount: 0, skipped: true, date: localIso() }]);
    expect(paidState('card', 'C1')).toBe('skipped');
    expect(remainingForItem('card', 'C1')).toBe(0);
  });
});

describe('utils — money formatting', () => {
  it('formats full and short amounts in USD by default', () => {
    expect(fmt(1234.5)).toBe('$1,234.50');
    expect(fmtShort(1234.5)).toBe('$1,235');
    expect(fmt(null)).toBe('$0.00');
  });

  it('setMoneyFormat switches currency and ignores unknown codes', () => {
    expect(fmt(1000)).toBe('$1,000.00');
    setMoneyFormat('ZZZ'); // unknown → no-op
    expect(fmt(1000)).toBe('$1,000.00');
    setMoneyFormat('JPY'); // yen: no decimal places, non-$ symbol
    const yen = fmt(1000);
    expect(yen).not.toContain('$');
    expect(yen).not.toContain('.00');
    setMoneyFormat('USD'); // restore for any later assertions
    expect(fmt(1000)).toBe('$1,000.00');
  });
});

describe('utils — date helpers', () => {
  it('monthKeyLabel renders a long month label (and tolerates junk)', () => {
    expect(monthKeyLabel('2026-06')).toBe('June 2026');
    expect(monthKeyLabel('')).toBe('');
    expect(monthKeyLabel('Unknown')).toBe('Unknown');
  });

  it('monthsUntil counts whole calendar months ahead (0 in the past)', () => {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() + 5, 15);
    const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-15`;
    expect(monthsUntil(iso)).toBe(5);
    expect(monthsUntil('2000-01-01')).toBe(0);
    expect(monthsUntil('')).toBe(0);
  });

  it('daysUntilDate counts days ahead (0 in the past)', () => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    const n = daysUntilDate(localIso(d));
    expect(n).toBeGreaterThanOrEqual(9); // ±1 for tz boundary
    expect(n).toBeLessThanOrEqual(11);
    expect(daysUntilDate('2000-01-01')).toBe(0);
    expect(daysUntilDate('')).toBe(0);
  });
});

describe('utils — due-date math', () => {
  beforeEach(() => setSettings({})); // browser tz, so "today" matches new Date()

  it('daysUntilDue is 0 when the due day is today', () => {
    expect(daysUntilDue(new Date().getDate())).toBe(0);
  });

  it('nextDueDate returns a forward-looking Date on the due day', () => {
    const d = nextDueDate(15);
    expect(d instanceof Date).toBe(true);
    expect(d.getDate()).toBe(15);
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    expect(d.getTime()).toBeGreaterThanOrEqual(todayMidnight.getTime());
  });

  it('nextDueDate returns null without a due day', () => {
    expect(nextDueDate(0)).toBe(null);
    expect(nextDueDate(undefined)).toBe(null);
  });

  it('shortDate adds the year only when it differs from this year', () => {
    const y = new Date().getFullYear();
    expect(shortDate(new Date(y, 1, 5))).toBe('Feb 5');
    expect(shortDate(new Date(y + 1, 1, 5))).toBe(`Feb 5, ${y + 1}`);
    expect(shortDate(null)).toBe('');
  });
});

describe('utils — payment history & stats', () => {
  beforeEach(() => {
    setPayments([
      { id: '1', type: 'card', refId: 'C1', amount: 100, date: '2026-01-15' },
      { id: '2', type: 'card', refId: 'C1', amount: 200, date: '2026-03-15' },
      { id: '3', type: 'card', refId: 'C1', amount: 150, date: '2026-02-15' },
      { id: '4', type: 'bill', refId: 'B1', amount: 50, date: '2026-02-15' },
    ]);
  });

  it('paymentHistoryFor returns matching rows newest-first, capped by n', () => {
    expect(paymentHistoryFor('card', 'C1').map((p) => p.id)).toEqual(['2', '3', '1']);
    expect(paymentHistoryFor('card', 'C1', 2)).toHaveLength(2);
    expect(paymentHistoryFor('card', 'nope')).toEqual([]);
  });

  it('paymentStats reports min/avg/max with chronological amounts', () => {
    const s = paymentStats('card', 'C1');
    expect(s.count).toBe(3);
    expect(s.min).toBe(100);
    expect(s.max).toBe(200);
    expect(s.avg).toBeCloseTo(150);
    expect(s.amounts).toEqual([100, 150, 200]); // oldest → newest
    expect(paymentStats('card', 'nope')).toBe(null);
  });

  it('daysSinceLastPayment is null with no history, positive otherwise', () => {
    expect(daysSinceLastPayment('card', 'nope')).toBe(null);
    expect(daysSinceLastPayment('card', 'C1')).toBeGreaterThan(0);
  });
});

describe('utils — buildUpcomingItems', () => {
  beforeEach(() => {
    setSettings({});
    setPayments([]);
    setBills([
      { id: 'B1', name: 'Rent', amount: 1500, dueDay: 1, category: 'Housing' },
      { id: 'B2', name: 'NoDue', amount: 10 },
    ]);
    setCards([{ id: 'C1', name: 'Visa', minPayment: 25, dueDay: 20 }]);
  });

  it('includes only due-dated bills/cards, sorted by days-until-due', () => {
    const items = buildUpcomingItems();
    expect(items.some((i) => i.name === 'Rent')).toBe(true);
    expect(items.some((i) => i.name === 'Visa (payment)')).toBe(true);
    expect(items.some((i) => i.name === 'NoDue')).toBe(false);
    for (let k = 1; k < items.length; k++) {
      expect(items[k].days).toBeGreaterThanOrEqual(items[k - 1].days);
    }
  });
});

describe('utils — month helpers', () => {
  it('monthKey / monthLabel format a given date', () => {
    const d = new Date(2026, 5, 15);
    expect(monthKey(d)).toBe('2026-06');
    expect(monthLabel(d)).toBe('June 2026');
  });

  it('offsetDate shifts by whole months', () => {
    setSettings({});
    const base = offsetDate(0);
    const next = offsetDate(1);
    expect(next.getMonth()).toBe((base.getMonth() + 1) % 12);
  });
});
