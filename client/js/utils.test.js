import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  recommendedAmount,
  promoNeeded,
  liveCardBalance,
  cardAmounts,
  cardHeadlineMode,
  otherCardAmounts,
  goalAmountFor,
  payTargetAmount,
  payTargetRemaining,
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
  effectiveDaysUntilDue,
  effectiveDaysUntilBillDue,
  nextDueDate,
  shortDate,
  paymentHistoryFor,
  daysSinceLastPayment,
  paymentStats,
  recentPaymentAverage,
  rolloverAmount,
  buildUpcomingItems,
  monthKey,
  monthLabel,
  offsetDate,
  ymd,
  billNotStarted,
  billEnded,
  billActive,
  billInPeriod,
  isFullyPaid,
  needsAmount,
  nothingDue,
  amountIsSet,
  paidGoalPolicy,
  hidePaidOnDashboard,
  archiveInsteadOfDelete,
  isArchived,
  toast,
  setRenderer,
  renderTab,
  refreshAll,
  periodObligationItems,
  cardForTransaction,
  daysUntilBillDue,
} from './utils.js';
import { setCards, setBills, setPayments, setSettings, bills, cards } from './storage.svelte.js';
import { boundsForKey } from './period.js';

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

  it('recommends paying the full balance on an interest-bearing non-promo card', () => {
    expect(recommendedAmount({ balance: 1000, minPayment: 25, regularAPR: 19.99 })).toBe(1000);
  });

  it('recommends only the minimum on a 0% non-promo card', () => {
    expect(recommendedAmount({ balance: 1000, minPayment: 25, regularAPR: 0 })).toBe(25);
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

describe('utils — liveCardBalance', () => {
  it('prefers the current balance when one is tracked', () => {
    expect(liveCardBalance({ balance: 0, currentBalance: 420.5 })).toBe(420.5);
  });

  it('falls back to the statement balance when current is unset', () => {
    expect(liveCardBalance({ balance: 300 })).toBe(300);
    expect(liveCardBalance({ balance: 300, currentBalance: null })).toBe(300);
    expect(liveCardBalance({ balance: 300, currentBalance: '' })).toBe(300);
  });

  it('honors a current balance of exactly zero', () => {
    expect(liveCardBalance({ balance: 300, currentBalance: 0 })).toBe(0);
  });

  it('handles string amounts and missing cards', () => {
    expect(liveCardBalance({ balance: '150.25' })).toBe(150.25);
    expect(liveCardBalance({ currentBalance: '75' })).toBe(75);
    expect(liveCardBalance(null)).toBe(0);
    expect(liveCardBalance({})).toBe(0);
  });
});

describe('utils — cardHeadlineMode', () => {
  it('defaults to the amount due', () => {
    expect(cardHeadlineMode(null)).toBe('due');
    expect(cardHeadlineMode({})).toBe('due');
    expect(cardHeadlineMode({ cardHeadline: 'nonsense' })).toBe('due');
  });

  it('honors the two other choices', () => {
    expect(cardHeadlineMode({ cardHeadline: 'current' })).toBe('current');
    expect(cardHeadlineMode({ cardHeadline: 'owed' })).toBe('owed');
  });

  it('always leaves the other two amounts to show alongside', () => {
    expect(otherCardAmounts('due')).toEqual(['current', 'owed']);
    expect(otherCardAmounts('current')).toEqual(['due', 'owed']);
    expect(otherCardAmounts('owed')).toEqual(['due', 'current']);
  });
});

describe('utils — cardAmounts', () => {
  beforeEach(() => {
    setBills([]);
    setPayments([]);
    setSettings({ paidGoal: 'full' });
  });

  it('separates what is due from the live balance', () => {
    const card = { id: 'C1', type: 'card', balance: 2829, currentBalance: 2946.18, minPayment: 35 };
    setCards([card]);
    const a = cardAmounts(card);
    expect(a.due).toBe(2829);        // paidGoal 'full' targets the whole balance
    expect(a.current).toBe(2946.18); // live balance, including new charges
    expect(a.owed).toBe(2829);
  });

  it('follows the paid-goal policy for both the due and owed figures', () => {
    const card = { id: 'C1', type: 'card', balance: 2829, currentBalance: 2946.18, minPayment: 35 };
    setCards([card]);
    setSettings({ paidGoal: 'minimum' });
    const a = cardAmounts(card);
    expect(a.due).toBe(35);          // what this period actually asks for
    expect(a.owed).toBe(35);         // none of it paid yet
  });

  it('leads with the promo installment when the statement is clear', () => {
    // The case that drove this: a 0% promo card whose statement balance is 0
    // still owes its monthly payoff slice, and used to lead with a settled
    // green "$0.00" while telling you to pay $500 two lines lower.
    const now = new Date();
    // Four whole months out, mid-month so no end-of-month rollover shifts it.
    const end = new Date(now.getFullYear(), now.getMonth() + 4, 15);
    const promoEndDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-15`;
    const card = {
      id: 'C1', type: 'card', balance: 0, currentBalance: 9732, minPayment: 0,
      hasPromo: true, promoBalance: 2000, promoEndDate,
    };
    setCards([card]);
    setSettings({ paidGoal: 'recommended' });
    const a = cardAmounts(card);
    expect(a.due).toBeCloseTo(500, 2);
    expect(a.owed).toBeCloseTo(500, 2);
    expect(a.current).toBe(9732);
  });

  it('shrinks only the owed figure as partial payments land', () => {
    const card = { id: 'C1', type: 'card', balance: 2829, currentBalance: 2946.18, minPayment: 35 };
    setCards([card]);
    setSettings({ paidGoal: 'minimum' });
    setPayments([{ type: 'card', refId: 'C1', amount: 20, date: localIso() }]);
    const a = cardAmounts(card);
    expect(a.due).toBe(35);          // the target holds still…
    expect(a.current).toBe(2946.18);
    expect(a.owed).toBe(15);         // …while what's left of it shrinks
  });

  it('uses the scheduled payment as a loan’s due amount, not its principal', () => {
    const loan = { id: 'L1', type: 'loan', balance: 200000, minPayment: 1200 };
    setCards([loan]);
    const a = cardAmounts(loan);
    expect(a.due).toBe(1200);
    expect(a.current).toBe(200000);
    expect(a.owed).toBe(1200);
  });

  it('reports nothing owed on a skipped card', () => {
    const card = { id: 'C1', type: 'card', balance: 500, minPayment: 25 };
    setCards([card]);
    setPayments([{ type: 'card', refId: 'C1', skipped: true, date: localIso() }]);
    const a = cardAmounts(card);
    expect(a.due).toBe(500);   // a skip doesn't change what the period asked for
    expect(a.owed).toBe(0);
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
    setCards([{ id: 'C1', balance: 1000, minPayment: 25, regularAPR: 19.99 }]);
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
    setSettings({ paidGoal: 'recommended' }); // interest-bearing non-promo → pay the balance
    expect(goalAmountFor('card', 'C1')).toBe(1000);
  });

  it('a 0% card owes only the minimum under the recommended policy', () => {
    setCards([{ id: 'C0', balance: 1000, minPayment: 25, regularAPR: 0 }]);
    setSettings({ paidGoal: 'recommended' });
    expect(goalAmountFor('card', 'C0')).toBe(25);
    setSettings({ paidGoal: 'full' }); // explicit "full" still targets the balance
    expect(goalAmountFor('card', 'C0')).toBe(1000);
  });
});

describe('utils — payTargetAmount / payTargetRemaining', () => {
  // A payment decrements the card's balance (applyCardPaymentDelta), so these
  // fixtures carry the *post-payment* balance alongside the payment record.
  beforeEach(() => {
    setBills([{ id: 'B1', amount: 120 }]);
    setPayments([]);
    setSettings({ paidGoal: 'recommended' });
    setCards([{ id: 'C1', balance: 1000, minPayment: 25, regularAPR: 19.99 }]);
  });

  it('a target holds still while the remainder shrinks with each payment', () => {
    setCards([{ id: 'C1', balance: 600, minPayment: 25, regularAPR: 19.99 }]);
    setPayments([{ id: 'p1', type: 'card', refId: 'C1', amount: 400, date: localIso() }]);
    expect(payTargetAmount('recommended', 'card', 'C1')).toBe(1000);
    expect(payTargetRemaining('recommended', 'card', 'C1')).toBe(600);
    expect(payTargetAmount('payoff', 'card', 'C1')).toBe(1000);
    expect(payTargetRemaining('payoff', 'card', 'C1')).toBe(600);
  });

  it('the minimum is a flat target — paying it leaves nothing toward it', () => {
    setCards([{ id: 'C1', balance: 975, minPayment: 25, regularAPR: 19.99 }]);
    setPayments([{ id: 'p1', type: 'card', refId: 'C1', amount: 25, date: localIso() }]);
    expect(payTargetAmount('minimum', 'card', 'C1')).toBe(25);
    expect(payTargetRemaining('minimum', 'card', 'C1')).toBe(0);
  });

  it('an explicit recommended payment is spent down, not re-suggested in full', () => {
    setCards([{ id: 'C1', balance: 800, minPayment: 25, regularAPR: 19.99, recommendedPayment: 200 }]);
    setPayments([{ id: 'p1', type: 'card', refId: 'C1', amount: 200, date: localIso() }]);
    expect(payTargetAmount('recommended', 'card', 'C1')).toBe(200);
    expect(payTargetRemaining('recommended', 'card', 'C1')).toBe(0);
  });

  it("a 0% promo's monthly target is measured from the start-of-period balance", () => {
    // $1,200 promo over 6 months = $200/mo; $200 of it is already paid.
    setCards([{
      id: 'P1', balance: 1000, promoBalance: 1000, minPayment: 25,
      hasPromo: true, promoEndDate: isoOffsetMonths(6), regularAPR: 19.99,
    }]);
    setPayments([{ id: 'p1', type: 'card', refId: 'P1', amount: 200, date: localIso() }]);
    expect(payTargetAmount('recommended', 'card', 'P1')).toBeCloseTo(200, 5);
    expect(payTargetRemaining('recommended', 'card', 'P1')).toBeCloseTo(0, 5);
  });

  it('a loan targets its scheduled payment, with payoff as the principal', () => {
    setCards([{ id: 'L1', type: 'loan', balance: 198800, minPayment: 1200 }]);
    setPayments([{ id: 'p1', type: 'card', refId: 'L1', amount: 1200, date: localIso() }]);
    expect(payTargetAmount('monthly', 'card', 'L1')).toBe(1200);
    expect(payTargetRemaining('monthly', 'card', 'L1')).toBe(0);
    expect(payTargetAmount('payoff', 'card', 'L1')).toBe(200000);
    expect(payTargetRemaining('payoff', 'card', 'L1')).toBe(198800);
  });

  it("a bill's only target is its amount, less what's been paid", () => {
    setPayments([{ id: 'p1', type: 'bill', refId: 'B1', amount: 50, date: localIso() }]);
    expect(payTargetAmount('full', 'bill', 'B1')).toBe(120);
    expect(payTargetRemaining('full', 'bill', 'B1')).toBe(70);
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

  /* A stored date is a calendar day. Parsed as UTC and read back locally, the
     1st of a month falls into the month before west of UTC — which silently
     shortened every 0% promo by a month. Pinned to a fixed clock because the
     bug only shows on dates the naive parse rounds down. */
  it('reads a date-only string as a local calendar day, not UTC midnight', () => {
    setSettings({});
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 7, 1, 13, 0, 0)); // Aug 1 2026, local
      expect(monthsUntil('2027-02-01')).toBe(6);
      expect(monthsUntil('2026-09-01')).toBe(1);
      expect(daysUntilDate('2026-08-11')).toBe(10);
      expect(daysUntilDate('2026-08-01')).toBe(0);
    } finally {
      vi.useRealTimers();
    }
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

  it('effectiveDaysUntilDue points to next month when this period is paid', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 29)); // Jun 29
    setCards([{ id: 'c1', name: 'Test', dueDay: 28, minPayment: 40, balance: 0 }]);
    setPayments([{ id: 'p1', type: 'card', refId: 'c1', amount: 40, date: '2026-06-28' }]);
    expect(daysUntilDue(28)).toBe(-1);
    expect(effectiveDaysUntilDue(28, 'card', 'c1')).toBeGreaterThan(20);
    vi.useRealTimers();
  });
});

/* The bill flavour of the same idea: once this period is settled, the row should
   count down to the NEXT occurrence instead of showing an overdue badge. Unlike
   effectiveDaysUntilDue it honors the bill's frequency, not just a day-of-month. */
describe('utils — effectiveDaysUntilBillDue', () => {
  beforeEach(() => {
    setSettings({});
    setBills([]);
    setPayments([]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 29)); // Mon Jun 29
  });

  afterEach(() => vi.useRealTimers());

  it('returns null without a bill', () => {
    expect(effectiveDaysUntilBillDue(null)).toBe(null);
    expect(effectiveDaysUntilBillDue(undefined)).toBe(null);
  });

  it('falls through to daysUntilBillDue while the bill is unpaid', () => {
    const bill = { id: 'B1', name: 'Rent', amount: 100, dueDay: 28, frequency: 'Monthly' };
    setBills([bill]);
    // Jun 28 has passed, so the next occurrence is Jul 28 — 29 days out.
    expect(effectiveDaysUntilBillDue(bill)).toBe(29);
  });

  it('counts to the next occurrence once the period is fully paid', () => {
    const bill = { id: 'B1', name: 'Gym', amount: 40, dueDay: 30, frequency: 'Monthly' };
    setBills([bill]);
    setPayments([{ id: 'p1', type: 'bill', refId: 'B1', amount: 40, date: '2026-06-29' }]);
    expect(isFullyPaid('bill', 'B1')).toBe(true);
    expect(effectiveDaysUntilBillDue(bill)).toBe(1); // Jun 30
  });

  it('respects a weekly frequency when paid', () => {
    const bill = { id: 'B1', name: 'Sitter', amount: 60, frequency: 'Weekly', startDate: '2026-06-01' };
    setBills([bill]);
    setPayments([{ id: 'p1', type: 'bill', refId: 'B1', amount: 60, date: '2026-06-29' }]);
    // Jun 1 + 4 weeks = Jun 29, so today is itself an occurrence.
    expect(effectiveDaysUntilBillDue(bill)).toBe(0);
  });

  /* A paid bill with nothing to advance to reads as null ("no next due"), not
     the 9999 sentinel daysUntilBillDue hands back — the row shows no countdown
     rather than a nonsense one. */
  it('returns null for a paid bill with no schedule to advance to', () => {
    const bill = { id: 'B1', name: 'One-off', amount: 25 };
    setBills([bill]);
    setPayments([{ id: 'p1', type: 'bill', refId: 'B1', amount: 25, date: '2026-06-29' }]);
    expect(isFullyPaid('bill', 'B1')).toBe(true);
    expect(effectiveDaysUntilBillDue(bill)).toBe(null);
  });

  it('an unscheduled UNPAID bill still reports the 9999 sentinel', () => {
    const bill = { id: 'B1', name: 'One-off', amount: 25 };
    setBills([bill]);
    expect(effectiveDaysUntilBillDue(bill)).toBe(9999);
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

  it('recentPaymentAverage returns the mean of recent payments, or null', () => {
    expect(recentPaymentAverage('card', 'C1')).toBeCloseTo(150);
    expect(recentPaymentAverage('card', 'nope')).toBe(null);
  });

  it('rolloverAmount seeds new-period amounts per policy', () => {
    // average → the recent average, falling back to the current amount
    expect(rolloverAmount('average', 90, 150)).toBe(150);
    expect(rolloverAmount('average', 90, null)).toBe(90);
    expect(rolloverAmount('average', 90, 0)).toBe(90);
    // carry keeps the current amount; blank clears it
    expect(rolloverAmount('carry', 90, 150)).toBe(90);
    expect(rolloverAmount('blank', 90, 150)).toBe(0);
    // unknown mode falls back to the average behavior
    expect(rolloverAmount('nonsense', 90, 150)).toBe(150);
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

  it('applies category icon overrides to bill rows', () => {
    setSettings({ categoryIcons: { Housing: '🏡' } });
    setCards([]);
    const rent = buildUpcomingItems().find((i) => i.name === 'Rent');
    expect(rent.icon).toBe('🏡');
    expect(rent.iconInfo).toEqual({ isImage: false, emoji: '🏡' });
  });

  it('applies image category overrides on bill iconInfo', () => {
    const src = 'data:image/png;base64,abc';
    setSettings({ categoryIcons: { Housing: { type: 'image', value: src } } });
    setCards([]);
    const rent = buildUpcomingItems().find((i) => i.name === 'Rent');
    expect(rent.iconInfo).toEqual({ isImage: true, src });
    // Text fallback stays on the default category emoji.
    expect(rent.icon).toBe('🏠');
  });

  it('attaches issuer brand icons to card rows', () => {
    setBills([]);
    setCards([{ id: 'C1', name: 'Sapphire', issuer: 'Chase', minPayment: 35, dueDay: 15 }]);
    const item = buildUpcomingItems()[0];
    expect(item.brand.isLogo).toBe(true);
    expect(item.brand.key).toBe('chase');
    expect(item.iconInfo.isImage).toBe(true);
    expect(item.icon).toBe('🔵');
  });

  it('uses the emoji stand-in for an issuer without a bundled logo', () => {
    setBills([]);
    setCards([{ id: 'C2', name: 'Blue Card', issuer: 'SoFi', minPayment: 10, dueDay: 1 }]);
    const item = buildUpcomingItems()[0];
    expect(item.brand.isLogo).toBe(false);
    expect(item.brand.isMonogram).toBe(true);
    expect(item.brand.emoji).toBe('🟣');
    expect(item.icon).toBe('🟣');
  });

  it('marks a full-color logo so the row plates it instead of tinting it', () => {
    setBills([]);
    setCards([{ id: 'C3', name: 'Blue Card', issuer: 'Bilt', minPayment: 10, dueDay: 1 }]);
    const item = buildUpcomingItems()[0];
    expect(item.brand.isLogo).toBe(true);
    expect(item.brand.key).toBe('bilt');
    expect(item.brand.fullColor).toBe(true);
    // Bilt's mark is its square lockup, so 1:1 — the plate is sized from the
    // aspect either way. A wordmark's ratio is covered by the next test.
    expect(item.brand.aspect).toBe(1);
    // The emoji stand-in survives for text-only contexts.
    expect(item.icon).toBe('🏠');
  });

  it('carries a wordmark’s aspect ratio so the plate can hug it', () => {
    setBills([]);
    setCards([{ id: 'C4', name: 'Quicksilver', issuer: 'Capital One', minPayment: 10, dueDay: 1 }]);
    const item = buildUpcomingItems()[0];
    expect(item.brand.fullColor).toBe(true);
    expect(item.brand.aspect).toBeGreaterThan(2);
  });
});

describe('utils — bill active window (start/end dates)', () => {
  beforeEach(() => setSettings({})); // browser tz
  const at = (s) => new Date(s + 'T00:00:00');

  it('ymd formats a Date as YYYY-MM-DD in its local fields', () => {
    expect(ymd(new Date(2026, 5, 7))).toBe('2026-06-07');
  });

  it('a bill with no dates is always active', () => {
    expect(billActive({})).toBe(true);
    expect(billNotStarted({})).toBe(false);
    expect(billEnded({})).toBe(false);
  });

  it('an archived bill is never active (soft-deleted, excluded everywhere)', () => {
    expect(billActive({ archived: true })).toBe(false);
    // Even within its active window, archived wins.
    expect(billActive({ startDate: '2026-06-01', endDate: '2026-06-30', archived: true }, at('2026-06-15'))).toBe(false);
  });

  it('billNotStarted is true strictly before startDate, false on/after', () => {
    const b = { startDate: '2026-06-15' };
    expect(billNotStarted(b, at('2026-06-14'))).toBe(true);
    expect(billNotStarted(b, at('2026-06-15'))).toBe(false);
    expect(billNotStarted(b, at('2026-07-01'))).toBe(false);
  });

  it('billEnded is true strictly after endDate, false on/before', () => {
    const b = { endDate: '2026-06-15' };
    expect(billEnded(b, at('2026-06-15'))).toBe(false);
    expect(billEnded(b, at('2026-06-16'))).toBe(true);
  });

  it('billActive honors both bounds inclusively', () => {
    const b = { startDate: '2026-06-01', endDate: '2026-06-30' };
    expect(billActive(b, at('2026-05-31'))).toBe(false);
    expect(billActive(b, at('2026-06-01'))).toBe(true);
    expect(billActive(b, at('2026-06-30'))).toBe(true);
    expect(billActive(b, at('2026-07-01'))).toBe(false);
  });

  it('buildUpcomingItems excludes not-yet-started and ended bills', () => {
    setPayments([]);
    setCards([]);
    setBills([
      { id: 'A', name: 'Active', amount: 10, dueDay: 1 },
      { id: 'F', name: 'Future', amount: 10, dueDay: 1, startDate: '2999-01-01' },
      { id: 'E', name: 'Ended', amount: 10, dueDay: 1, endDate: '2000-01-01' },
    ]);
    const names = buildUpcomingItems().map((i) => i.name);
    expect(names).toContain('Active');
    expect(names).not.toContain('Future');
    expect(names).not.toContain('Ended');
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

describe('utils — billInPeriod and paid goal helpers', () => {
  beforeEach(() => {
    setSettings({ paidGoal: 'minimum', hidePaidDashboard: false });
    setBills([{ id: 'B1', name: 'Rent', amount: 120, dueDay: 1 }]);
    setCards([{ id: 'C1', balance: 1000, minPayment: 100 }]);
    setPayments([]);
  });

  it('billInPeriod is true when the bill active window overlaps the bounds', () => {
    const bounds = { start: new Date(2026, 5, 1), end: new Date(2026, 6, 1) };
    expect(billInPeriod({ dueDay: 15 }, bounds)).toBe(true);
    expect(billInPeriod({ dueDay: 1, endDate: '2026-05-31' }, bounds)).toBe(false);
    expect(billInPeriod({ dueDay: 1, startDate: '2026-07-01' }, bounds)).toBe(false);
  });

  it('paidGoalPolicy normalizes invalid settings to recommended', () => {
    setSettings({ paidGoal: 'nonsense' });
    expect(paidGoalPolicy()).toBe('recommended');
    setSettings({ paidGoal: 'full' });
    expect(paidGoalPolicy()).toBe('full');
  });

  it('isFullyPaid compares paid amount to the goal', () => {
    setSettings({ paidGoal: 'minimum' });
    const today = localIso();
    setPayments([{ id: 'p1', type: 'card', refId: 'C1', amount: 100, date: today }]);
    expect(isFullyPaid('card', 'C1')).toBe(true);
    setPayments([{ id: 'p1', type: 'card', refId: 'C1', amount: 50, date: today }]);
    expect(isFullyPaid('card', 'C1')).toBe(false);
  });

  // A zero goal satisfies `remaining <= 0` on its own, so an item with no
  // amount set used to read as fully paid with no payment behind it — and the
  // row's Undo, which removes a payment record, had nothing to remove.
  it('amountIsSet separates a blank amount from an explicit zero', () => {
    expect(amountIsSet(undefined)).toBe(false);
    expect(amountIsSet(null)).toBe(false);
    expect(amountIsSet('')).toBe(false);
    expect(amountIsSet('   ')).toBe(false);
    expect(amountIsSet(0)).toBe(true);
    expect(amountIsSet('0')).toBe(true);
    expect(amountIsSet(12.5)).toBe(true);
  });

  it.each([
    ['blank string', ''],
    ['missing', undefined],
    ['null', null],
  ])('a bill whose amount is %s is not "paid"', (_label, amount) => {
    setBills([{ id: 'B9', name: 'Mortgage', dueDay: 1, amount }]);
    setPayments([]);
    expect(goalAmountFor('bill', 'B9')).toBe(0);
    expect(needsAmount('bill', 'B9')).toBe(true);
    expect(isFullyPaid('bill', 'B9')).toBe(false);
    expect(nothingDue('bill', 'B9')).toBe(false);
    expect(paidState('bill', 'B9')).toBe('unpaid');
  });

  it('a bill deliberately set to $0 is settled, not unfinished', () => {
    setBills([{ id: 'B9', name: 'Free trial', dueDay: 1, amount: 0 }]);
    setPayments([]);
    expect(needsAmount('bill', 'B9')).toBe(false);
    expect(isFullyPaid('bill', 'B9')).toBe(true);
    expect(nothingDue('bill', 'B9')).toBe(true);   // "Nothing due", not "Paid"
  });

  it('a loan with no monthly payment is not "paid"', () => {
    setCards([{ id: 'L9', name: 'Mortgage', type: 'loan', dueDay: 1, balance: 250000 }]);
    setPayments([]);
    expect(needsAmount('card', 'L9')).toBe(true);
    expect(isFullyPaid('card', 'L9')).toBe(false);
    setCards([{ id: 'L9', name: 'Mortgage', type: 'loan', dueDay: 1, balance: 250000, minPayment: 1800 }]);
    expect(needsAmount('card', 'L9')).toBe(false);
    expect(paidState('card', 'L9')).toBe('unpaid');
  });

  it('a loan falls back to the scheduled payment when the override is zero', () => {
    setCards([{ id: 'L9', type: 'loan', dueDay: 1, balance: 250000, recommendedPayment: 0 }]);
    setPayments([]);
    expect(needsAmount('card', 'L9')).toBe(true);
    setCards([{ id: 'L9', type: 'loan', dueDay: 1, balance: 250000, recommendedPayment: 900 }]);
    expect(needsAmount('card', 'L9')).toBe(false);
  });

  // A balance-derived goal reaching zero means the card is paid off — that is a
  // real answer, so it must not be mistaken for unfinished setup.
  it('a paid-off credit card reads as nothing due, not missing an amount', () => {
    setSettings({ paidGoal: 'full' });
    setCards([{ id: 'C9', name: 'Visa', balance: 0, minPayment: 0 }]);
    setPayments([]);
    expect(needsAmount('card', 'C9')).toBe(false);
    expect(nothingDue('card', 'C9')).toBe(true);
  });

  it('a card on the minimum policy with no minimum set needs an amount', () => {
    setSettings({ paidGoal: 'minimum' });
    setCards([{ id: 'C9', name: 'Visa', balance: 500 }]);
    setPayments([]);
    expect(needsAmount('card', 'C9')).toBe(true);
    expect(isFullyPaid('card', 'C9')).toBe(false);
  });

  it('paying something toward a zero-goal item still reads as paid', () => {
    setBills([{ id: 'B9', name: 'Freebie', dueDay: 1, amount: '' }]);
    setPayments([{ id: 'p1', type: 'bill', refId: 'B9', amount: 25, date: localIso() }]);
    expect(needsAmount('bill', 'B9')).toBe(false);
    expect(isFullyPaid('bill', 'B9')).toBe(true);
    expect(nothingDue('bill', 'B9')).toBe(false);  // it was paid, not costless
  });

  // The one-tap "It's $0" answer on a no-amount row. It has to land as a real
  // 0 — not stay blank — or the row keeps asking the same question forever.
  it('confirming $0 settles a blank-amount row for good', () => {
    setBills([{ id: 'B9', name: 'Free trial', dueDay: 1, amount: '' }]);
    setPayments([]);
    expect(needsAmount('bill', 'B9')).toBe(true);

    bills[0].amount = 0;                      // what confirmZeroAmount writes
    expect(amountIsSet(bills[0].amount)).toBe(true);
    expect(needsAmount('bill', 'B9')).toBe(false);
    expect(nothingDue('bill', 'B9')).toBe(true);
    expect(paidState('bill', 'B9')).toBe('full');
  });

  it('confirming $0 on a loan settles its monthly payment', () => {
    setCards([{ id: 'L9', name: 'Paid-off loan', type: 'loan', dueDay: 1, balance: 0 }]);
    setPayments([]);
    expect(needsAmount('card', 'L9')).toBe(true);

    cards[0].minPayment = 0;
    expect(needsAmount('card', 'L9')).toBe(false);
    expect(nothingDue('card', 'L9')).toBe(true);
  });

  it('a skipped item owes nothing by choice, not for want of an amount', () => {
    setBills([{ id: 'B9', name: 'Mortgage', dueDay: 1, amount: '' }]);
    setPayments([{ id: 's1', type: 'bill', refId: 'B9', amount: 0, skipped: true, date: localIso() }]);
    expect(needsAmount('bill', 'B9')).toBe(false);
    expect(nothingDue('bill', 'B9')).toBe(false);
    expect(paidState('bill', 'B9')).toBe('skipped');
  });

  it('hidePaidOnDashboard defaults to true unless explicitly disabled', () => {
    expect(hidePaidOnDashboard({ hidePaidOnDashboard: false })).toBe(false);
    expect(hidePaidOnDashboard({})).toBe(true);
    expect(hidePaidOnDashboard(null)).toBeFalsy();
  });

  it('archiveInsteadOfDelete defaults to false unless explicitly enabled', () => {
    expect(archiveInsteadOfDelete({ archiveInsteadOfDelete: true })).toBe(true);
    expect(archiveInsteadOfDelete({})).toBe(false);
    expect(archiveInsteadOfDelete(null)).toBe(false);
  });

  it('isArchived reflects the archived flag', () => {
    expect(isArchived({ archived: true })).toBe(true);
    expect(isArchived({})).toBe(false);
    expect(isArchived(null)).toBe(false);
  });
});

describe('utils — toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="toast"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('shows a message and removes the show class after 2400ms', () => {
    toast('Saved!');
    const el = document.getElementById('toast');
    expect(el.textContent).toBe('Saved!');
    expect(el.classList.contains('show')).toBe(true);

    vi.advanceTimersByTime(2400);
    expect(el.classList.contains('show')).toBe(false);
  });

  it('no-ops when #toast is missing', () => {
    document.body.innerHTML = '';
    expect(() => toast('hello')).not.toThrow();
  });
});

describe('utils — renderer registry', () => {
  it('renderTab invokes a registered renderer; refreshAll skips hidden tabs', () => {
    const billsFn = vi.fn();
    const cardsFn = vi.fn();
    setRenderer('bills', billsFn);
    setRenderer('cards', cardsFn);

    document.body.innerHTML =
      '<div id="tab-bills" style="display:block"></div>' +
      '<div id="tab-cards" style="display:none"></div>';

    renderTab('bills');
    expect(billsFn).toHaveBeenCalledOnce();

    refreshAll();
    expect(billsFn).toHaveBeenCalledTimes(2);
    expect(cardsFn).not.toHaveBeenCalled();

    expect(() => renderTab('missing')).not.toThrow();
  });
});

describe('utils — periodObligationItems', () => {
  beforeEach(() => {
    setBills([
      { id: 'B1', name: 'Rent', dueDay: 1, frequency: 'Monthly' },
      { id: 'B2', name: 'Quarterly', dueDay: 5, frequency: 'Quarterly', startDate: '2026-01-05' },
    ]);
  });

  it('keeps every card and only bills with a due date in the period', () => {
    const bounds = boundsForKey('2026-02', { mode: 'calendar', startDay: 1, length: 35 });
    const items = periodObligationItems([
      { type: 'card', refId: 'C1' },
      { type: 'bill', refId: 'B1' },
      { type: 'bill', refId: 'B2' },
    ], bounds);

    expect(items.map((i) => i.refId)).toEqual(['C1', 'B1']);
  });
});

describe('cardForTransaction', () => {
  const gold = { id: 'C1', name: 'Amex Gold', plaidAccountId: 'acct-gold' };
  const plat = { id: 'C2', name: 'Amex Platinum', plaidAccountId: 'acct-plat' };
  const unlinked = { id: 'C3', name: 'Chase Freedom' };

  it('attributes a bank row to the card pinned to its account', () => {
    expect(cardForTransaction({ accountId: 'acct-plat' }, [gold, plat, unlinked]).id).toBe('C2');
  });

  it('returns null for manual rows and unlinked accounts', () => {
    expect(cardForTransaction({ amount: 5 }, [gold])).toBe(null);
    expect(cardForTransaction({ accountId: '' }, [gold])).toBe(null);
    expect(cardForTransaction({ accountId: 'acct-unknown' }, [gold, plat])).toBe(null);
  });

  it('never claims a row for a card with no link', () => {
    // The unlinked card must not soak up rows just by being present.
    expect(cardForTransaction({ accountId: 'acct-gold' }, [unlinked])).toBe(null);
  });

  it('re-attributes history when a card is re-pointed at another account', () => {
    const tx = { accountId: 'acct-plat' };
    expect(cardForTransaction(tx, [{ ...gold, plaidAccountId: 'acct-plat' }]).id).toBe('C1');
  });

  it('falls back to the synced card list when no list is passed', () => {
    setCards([gold, plat]);
    expect(cardForTransaction({ accountId: 'acct-gold' }).id).toBe('C1');
    expect(cardForTransaction({ accountId: 'acct-nope' })).toBe(null);
  });
});

/* Every one of these reads a field the user may simply not have filled in, or
   a record that has since been deleted. None of them may return NaN or throw:
   the values feed straight into totals, badges, and the dashboard sort. */
describe('utils — missing records and unset amounts', () => {
  beforeEach(() => {
    setSettings({});
    setBills([]);
    setCards([]);
    setPayments([]);
  });

  it('fmtShort and monthLabel work with nothing passed', () => {
    expect(fmtShort()).toBe('$0');
    expect(fmtShort(null)).toBe('$0');
    expect(monthLabel()).toBe(monthLabel(new Date()));
  });

  it('effectiveDaysUntilDue is null without a due day', () => {
    expect(effectiveDaysUntilDue(0, 'card', 'C1')).toBe(null);
    expect(effectiveDaysUntilDue(undefined)).toBe(null);
  });

  it('effectiveDaysUntilDue keeps this month’s due day when it is still ahead', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 5, 10)); // Jun 10
      setBills([{ id: 'B1', name: 'Rent', amount: 100, dueDay: 12 }]);
      setPayments([{ id: 'p1', type: 'bill', refId: 'B1', amount: 100, date: '2026-06-01', monthKey: '2026-06' }]);
      // Paid, but the 12th has not happened yet — count to it, not to July.
      expect(effectiveDaysUntilDue(12, 'bill', 'B1')).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('billInPeriod excludes archived bills and falls back to the active window', () => {
    const bounds = boundsForKey('2026-06', { mode: 'calendar', startDay: 1, length: 35 });
    expect(billInPeriod({ id: 'B1', archived: true }, bounds)).toBe(false);
    // No usable bounds → the plain active-window check.
    expect(billInPeriod({ id: 'B2' })).toBe(true);
    expect(billInPeriod({ id: 'B3', endDate: '2000-01-01' }, null)).toBe(false);
    expect(billInPeriod({ id: 'B4' }, { start: new Date(2026, 5, 1) })).toBe(true);
  });

  it('paymentStats and paidAmount treat an unusable amount as 0', () => {
    setPayments([
      { id: '1', type: 'card', refId: 'C1', amount: 'oops', date: '2026-01-15' },
      { id: '2', type: 'card', refId: 'C1', amount: 100, date: '2026-01-16' },
    ]);
    const stats = paymentStats('card', 'C1');
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(100);
    expect(stats.avg).toBe(50);

    setPayments([{ id: '3', type: 'bill', refId: 'B1', amount: null, date: localIso(), monthKey: monthKey() }]);
    expect(paidAmount('bill', 'B1')).toBe(0);
  });

  it('rolloverAmount treats an unusable current amount as 0', () => {
    expect(rolloverAmount('carry', 'not a number')).toBe(0);
    expect(rolloverAmount('average', undefined, null)).toBe(0);
  });

  /* Anything that is not a bare YYYY-MM-DD is a real instant, not a calendar
     day, and goes through Date untouched. */
  it('date math accepts a full timestamp as well as a calendar day', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 7, 1, 13, 0, 0)); // Aug 1 2026, local
      expect(monthsUntil('2026-10-15T09:30:00')).toBe(2);
      expect(daysUntilDate('2026-08-11T23:00:00')).toBe(10);
      // A slash-separated date is likewise handed to Date as-is.
      expect(monthsUntil('2026/10/15')).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cardAmounts is all zeros without a card', () => {
    expect(cardAmounts(null)).toEqual({ due: 0, current: 0, owed: 0, statement: null });
  });

  /* The goal is resolved from the synced card list, so a row whose record has
     since been deleted reports 0 rather than reading a stale balance off the
     object it was handed. */
  it('cardAmounts reports 0 for a card that is no longer in the list', () => {
    setCards([]);
    const a = cardAmounts({ id: 'GONE', balance: 250, minPayment: 25 }, '2026-06');
    expect(a.due).toBe(0);
    expect(a.owed).toBe(0);
    expect(a.current).toBe(250); // read straight off the object, not the list
  });

  it('cardAmounts reads blank money fields as 0, never NaN', () => {
    setSettings({ paidGoal: 'minimum' });
    setCards([{ id: 'C2' }, { id: 'L1', type: 'loan' }]);
    expect(cardAmounts({ id: 'C2' }, '2026-06').due).toBe(0);
    expect(cardAmounts({ id: 'L1', type: 'loan' }, '2026-06').due).toBe(0);
  });

  it('promoNeeded falls back to the statement balance, then to 0', () => {
    // No promoBalance → spread the statement balance instead.
    expect(promoNeeded({ balance: 600, promoEndDate: '2000-01-01' })).toBe(600);
    // Nothing to spread at all.
    expect(promoNeeded({ promoEndDate: '2000-01-01' })).toBe(0);
  });

  it('recommendedAmount is 0 for an interest-bearing card with no balance set', () => {
    expect(recommendedAmount({ minPayment: 0, regularAPR: 19.99 })).toBe(0);
  });

  /* A card payment lowers the balance, so a balance-derived target has to add
     this period's payments back — including onto an unparseable promo
     balance, which reads as 0 rather than poisoning the target with NaN. */
  it('rebuilds the start-of-period card from an unusable promo balance', () => {
    setCards([{
      id: 'C1', name: 'Visa', balance: 500, promoBalance: 'n/a',
      hasPromo: true, promoEndDate: isoOffsetMonths(6), minPayment: 10,
    }]);
    setPayments([{ id: 'p1', type: 'card', refId: 'C1', amount: 100, date: localIso(), monthKey: monthKey() }]);

    // Start-of-period balance is 500 + 100; the promo balance is 0 + 100.
    expect(payTargetAmount('payoff', 'card', 'C1')).toBe(600);
    expect(payTargetAmount('recommended', 'card', 'C1')).toBeGreaterThan(0);
  });

  it('a card with no minimum payment set targets 0 under the minimum policy', () => {
    setCards([{ id: 'C1', name: 'Visa', balance: 400 }]);
    expect(payTargetAmount('minimum', 'card', 'C1')).toBe(0);
    expect(payTargetAmount('monthly', 'card', 'C1')).toBe(0);
  });

  it('every goal helper returns a neutral value for a record that is gone', () => {
    expect(payTargetAmount('full', 'bill', 'missing')).toBe(0);
    expect(payTargetAmount('minimum', 'card', 'missing')).toBe(0);
    expect(payTargetRemaining('recommended', 'card', 'missing')).toBe(0);
    expect(goalAmountFor('card', 'missing')).toBe(0);
    expect(goalAmountFor('bill', 'missing')).toBe(0);
    expect(remainingForItem('card', 'missing')).toBe(0);
    expect(needsAmount('card', 'missing')).toBe(false);
    expect(isFullyPaid('card', 'missing')).toBe(true); // nothing owed, nothing missing
  });
});

/* The dashboard's Upcoming list is built from whatever is on file, including
   half-configured rows. Anything without a real next due date has to drop out
   silently rather than sorting to the top with a NaN. */
describe('utils — buildUpcomingItems with incomplete records', () => {
  beforeEach(() => {
    setSettings({});
    setBills([]);
    setCards([]);
    setPayments([]);
  });

  it('drops a bill whose schedule yields no next occurrence', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 5, 20)); // Jun 20
      setBills([
        // Active today, but the next annual occurrence falls after it retires.
        { id: 'DEAD', name: 'Domain', amount: 20, frequency: 'Annually',
          startDate: '2025-06-19', endDate: '2026-06-21' },
        { id: 'LIVE', name: 'Rent', dueDay: 25, frequency: 'Monthly' },
      ]);

      const items = buildUpcomingItems();
      expect(items.map((i) => i.refId)).toEqual(['LIVE']);
      // A bill with no amount set contributes 0, not NaN.
      expect(items[0].amount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips archived cards and cards with no due day', () => {
    setCards([
      { id: 'ARCH', name: 'Closed', archived: true, dueDay: 10, minPayment: 20 },
      { id: 'NODAY', name: 'No day', minPayment: 20 },
      { id: 'OK', name: 'Visa', dueDay: 10, minPayment: 20 },
    ]);

    expect(buildUpcomingItems().map((i) => i.refId)).toEqual(['OK']);
  });

  it('uses the promo spread for a promo card, and 0 when no minimum is set', () => {
    setCards([
      { id: 'PROMO', name: 'Promo', dueDay: 10, balance: 1200, promoBalance: 1200,
        hasPromo: true, promoEndDate: isoOffsetMonths(6) },
      { id: 'BLANK', name: 'Blank', dueDay: 11 },
    ]);

    const items = buildUpcomingItems();
    const promo = items.find((i) => i.refId === 'PROMO');
    const blank = items.find((i) => i.refId === 'BLANK');
    expect(promo.amount).toBeGreaterThan(100); // 1200 spread over ~6 months
    expect(blank.amount).toBe(0);
  });
});
