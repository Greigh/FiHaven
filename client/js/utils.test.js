import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  effectiveDaysUntilDue,
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
  paidGoalPolicy,
  hidePaidOnDashboard,
  archiveInsteadOfDelete,
  isArchived,
  toast,
  setRenderer,
  renderTab,
  refreshAll,
  periodObligationItems,
} from './utils.js';
import { setCards, setBills, setPayments, setSettings } from './storage.svelte.js';
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

  it('uses the default card glyph for card rows', () => {
    setBills([]);
    setCards([{ id: 'C1', name: 'Sapphire', issuer: 'Chase', minPayment: 35, dueDay: 15 }]);
    const item = buildUpcomingItems()[0];
    expect(item.icon).toBe('💳');
    expect(item.iconInfo).toEqual({ isImage: false, emoji: '💳' });
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
