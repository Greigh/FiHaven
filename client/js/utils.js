/* ═══════════════════════════════════════════════════════════
   utils.js — formatters, date helpers, payment helpers,
               shared constants, toast, renderer registry.
═══════════════════════════════════════════════════════════ */

import { bills, cards, payments, settings } from './storage.svelte.js';
import { today as todayInTz } from './tz.js';
import {
  boundsForKey, currentPeriodKey, paymentInBounds,
  periodKeyForPayment, periodKeyLabel,
} from './period.js';
import {
  billDueOn, nextBillDueDate, daysUntilBillDue, billDueInPeriod,
} from './billSchedule.js';
import { brandIconInfo } from './subscriptionIcons.js';
import {
  DEFAULT_CATEGORY_ICONS,
  CARD_ICON,
  categoryIconInfo,
  categoryIconEmoji,
} from './categoryIcons.js';
import { issuerIconInfo, issuerIconMark, issuerEmoji } from './issuerIcons.js';

export {
  nextBillDueDate, daysUntilBillDue, billDueOn, billDueInPeriod,
} from './billSchedule.js';

// Re-export the period helpers so components can keep importing from utils.
export { currentPeriodKey, periodKeyLabel, periodKeyForPayment };

export {
  categoryIconInfo,
  categoryIconEmoji,
  DEFAULT_CATEGORY_ICONS,
} from './categoryIcons.js';

/* ── Constants ──────────────────────────────────────────── */
/** @deprecated Prefer categoryIconInfo / categoryIconEmoji — kept as the default map. */
export const ICONS = DEFAULT_CATEGORY_ICONS;

// Spending categories used by the rewards optimizer ("which card should I
// use?"). Kept in sync with REWARD_CATEGORIES in the native cores.
export const REWARD_CATEGORIES = [
  'Dining', 'Groceries', 'Gas', 'Travel',
  'Transit', 'Online shopping', 'Streaming', 'Drugstores', 'Other',
];

export const CARD_COLORS = [
  '#1A6BFF', '#C0392B', '#1A7A4A',
  '#7B3CC0', '#C06010', '#007080', '#8B5A00',
];

/* ── Currency Formatters ────────────────────────────────────
   Amounts render in the user's chosen currency. setMoneyFormat()
   is called on load from the synced `currency` setting (default
   USD). Each currency carries a sensible locale so digit grouping
   and symbol placement match the region. */
var CURRENCY_LOCALES = {
  USD: 'en-US', CAD: 'en-CA', AUD: 'en-AU', GBP: 'en-GB', EUR: 'en-IE',
  JPY: 'ja-JP', INR: 'en-IN', CHF: 'de-CH', MXN: 'es-MX', BRL: 'pt-BR',
};
export var SUPPORTED_CURRENCIES = Object.keys(CURRENCY_LOCALES);

var moneyCurrency = 'USD';
var _fmtCache = {};

function _nf(opts) {
  var key = moneyCurrency + ':' + JSON.stringify(opts);
  if (!_fmtCache[key]) {
    var locale = CURRENCY_LOCALES[moneyCurrency] || 'en-US';
    _fmtCache[key] = new Intl.NumberFormat(
      locale,
      Object.assign({ style: 'currency', currency: moneyCurrency }, opts)
    );
  }
  return _fmtCache[key];
}

// Switch the active currency (no-op for unknown codes).
export function setMoneyFormat(currency) {
  if (currency && CURRENCY_LOCALES[currency]) moneyCurrency = currency;
}

// Full amount, with the currency's natural decimal places (2 for USD,
// 0 for JPY, etc.).
export function fmt(n) {
  return _nf({}).format(Number(n || 0));
}

// Rounded, no decimals — for compact chips/labels.
export function fmtShort(n) {
  return _nf({ maximumFractionDigits: 0 }).format(Number(n || 0));
}

/* ── Date / Month Helpers ───────────────────────────────────
   All "today" computations route through tz.js so the calendar
   day is read in the user's configured time zone. Day-diff math
   uses Math.round on midnight-to-midnight intervals, which is
   correct across DST shifts (the round absorbs the 23/25-hour day).
─────────────────────────────────────────────────────────────── */

export function monthKey(d) {
  d = d || todayInTz();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

export function monthLabel(d) {
  d = d || todayInTz();
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// "Long Month Year" label for a YYYY-MM month key. Parses the parts
// into a *local* Date — `new Date('2026-06-01')` would be read as UTC
// midnight, which toLocaleDateString then renders a day earlier in any
// behind-UTC zone, shifting the label back a whole month.
export function monthKeyLabel(mk) {
  if (!mk) return '';
  var parts = mk.split('-');
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  if (isNaN(y) || isNaN(m)) return mk;  // e.g. an "Unknown" bucket
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function offsetDate(offset) {
  offset = offset || 0;
  var d = todayInTz();
  d.setMonth(d.getMonth() + offset);
  return d;
}

export function daysUntilDue(dueDay) {
  var t         = todayInTz();
  var thisMonth = new Date(t.getFullYear(), t.getMonth(), dueDay);
  var nextMonth = new Date(t.getFullYear(), t.getMonth() + 1, dueDay);
  var diff      = Math.round((thisMonth - t) / 864e5);
  return diff < -1 ? Math.round((nextMonth - t) / 864e5) : diff;
}

// Like daysUntilDue, but when this period is fully paid the obligation
// for the current cycle is satisfied — show time until the next due date
// instead of an "overdue" badge.
export function effectiveDaysUntilDue(dueDay, type, refId, mk) {
  if (!dueDay) return null;
  mk = mk || currentPeriodKey();
  if (type && refId != null && isFullyPaid(type, refId, mk)) {
    var t = todayInTz();
    var d = parseInt(dueDay);
    var thisMonth = new Date(t.getFullYear(), t.getMonth(), d);
    var target = thisMonth > t
      ? thisMonth
      : new Date(t.getFullYear(), t.getMonth() + 1, d);
    return Math.round((target - t) / 864e5);
  }
  return daysUntilDue(dueDay);
}

export function effectiveDaysUntilBillDue(bill, mk) {
  if (!bill) return null;
  mk = mk || currentPeriodKey();
  if (isFullyPaid('bill', String(bill.id), mk)) {
    var next = nextBillDueDate(bill);
    if (!next) return null;
    return Math.round((next - todayInTz()) / 864e5);
  }
  return daysUntilBillDue(bill);
}

// The actual calendar date of the next forward-looking occurrence
// of a recurring dueDay. If this month's dueDay is still in the
// future (or today), returns this month's; otherwise next month's.
// Useful for showing "Next due: Feb 5" alongside an overdue badge,
// since a user may have paid the bill outside the app without
// marking it.
export function nextDueDate(dueDay) {
  if (!dueDay) return null;
  var d         = parseInt(dueDay);
  var t         = todayInTz();
  var thisMonth = new Date(t.getFullYear(), t.getMonth(), d);
  return thisMonth >= t
    ? thisMonth
    : new Date(t.getFullYear(), t.getMonth() + 1, d);
}

// "YYYY-MM-DD" for a Date, in its own local fields (which todayInTz()
// already pins to the user's zone). Lets us compare against a bill's
// startDate/endDate strings with a plain lexicographic <, > .
export function ymd(d) {
  d = d || todayInTz();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// A bill's optional active window. "First bill due on" (startDate)
// gates when it begins; "Stops on" (endDate) retires it. Both are
// optional "YYYY-MM-DD". `atDate` defaults to today (in the user's tz).
export function billNotStarted(bill, atDate) {
  if (!bill || !bill.startDate) return false;
  return ymd(atDate) < bill.startDate;
}
export function billEnded(bill, atDate) {
  if (!bill || !bill.endDate) return false;
  return ymd(atDate) > bill.endDate;
}
// Active = within the window. An ended or not-yet-started bill is
// excluded from due/overdue, monthly totals, the calendar, and
// reminders (it still shows in the list with a badge).
export function billActive(bill, atDate) {
  if (bill && bill.archived) return false;
  return !billNotStarted(bill, atDate) && !billEnded(bill, atDate);
}

// Archived records are hidden from every list, total, calendar, and
// reminder — a soft delete that stays restorable. Kept as a flag on the
// record (inside the synced bills/cards lists) so it round-trips across
// web/iOS/Android without a data-shape change.
export function isArchived(x) { return !!(x && x.archived); }

// True if a bill's active window overlaps a budgeting period
// (matches BudgetView's billInPeriod filter).
export function billInPeriod(bill, bounds) {
  if (bill && bill.archived) return false;
  if (!bounds || !bounds.start || !bounds.end) return billActive(bill);
  const lastDay = new Date(bounds.end.getTime() - 864e5);
  return !billEnded(bill, bounds.start) && !billNotStarted(bill, lastDay);
}

// Upcoming items that count as obligations in the current period.
export function periodObligationItems(items, bounds) {
  return items.filter(function (u) {
    if (u.type === 'card') return true;
    var b = bills.find(function (x) { return String(x.id) === String(u.refId); });
    return b && billDueInPeriod(b, bounds);
  });
}

export function hidePaidOnDashboard(s) {
  return s && s.hidePaidOnDashboard !== false;
}

// When on, the destructive button on bills/cards/loans archives (soft,
// restorable) instead of deleting outright. Off by default.
export function archiveInsteadOfDelete(s) {
  return !!(s && s.archiveInsteadOfDelete);
}

// Short calendar label (e.g. "Feb 5"); "Feb 5, 2027" if it's in a
// future year so the year doesn't go missing on a December → January
// rollover.
export function shortDate(d) {
  if (!d) return '';
  var opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== todayInTz().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

// All payments recorded against a given bill/card refId, newest
// first. Used by the variance/sparkline UI and the subscription
// audit. `n` caps the result so callers can grab "the last 6".
export function paymentHistoryFor(type, refId, n) {
  var key = String(refId);
  var list = payments
    .filter(function (p) {
      return p.type === type && String(p.refId) === key;
    })
    .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  return n ? list.slice(0, n) : list;
}

// Days since the most recent payment against a bill/card, or null
// if there has never been one. The subscription audit uses this to
// flag bills that haven't been paid in a long time (probably
// cancelled but still tracked).
export function daysSinceLastPayment(type, refId) {
  var hist = paymentHistoryFor(type, refId, 1);
  if (!hist.length) return null;
  var diff = (Date.now() - new Date(hist[0].date)) / 864e5;
  return Math.floor(diff);
}

// Min/avg/max + recent-amount sequence for the variance card and
// sparkline. `amounts` is oldest→newest so the sparkline reads
// left-to-right chronologically.
export function paymentStats(type, refId, n) {
  var hist = paymentHistoryFor(type, refId, n || 6);
  if (!hist.length) return null;
  var amounts = hist.map(function (p) { return parseFloat(p.amount) || 0; });
  var min = Math.min.apply(null, amounts);
  var max = Math.max.apply(null, amounts);
  var avg = amounts.reduce(function (s, a) { return s + a; }, 0) / amounts.length;
  return { count: amounts.length, min: min, max: max, avg: avg, amounts: amounts.slice().reverse() };
}

// The average of a bill/card's recent actual (non-skip) payments — the
// "average of recent months" used to seed the monthly rollover review.
// Returns null when there's no payment history to average.
export function recentPaymentAverage(type, refId, n) {
  var stats = paymentStats(type, refId, n || 6);
  return stats ? stats.avg : null;
}

// The amount to pre-fill for a bill when a new period starts, under the
// active rollover policy:
//   'average' → the average of recent payments (falls back to the current
//               amount when there's no history to average) — the default
//   'carry'   → the bill's current amount, unchanged
//   'blank'   → 0, so the user types the real figure as they learn it
// `recentAvg` is supplied by the caller (see recentPaymentAverage).
export function rolloverAmount(mode, currentAmount, recentAvg) {
  var cur = parseFloat(currentAmount) || 0;
  switch (mode) {
    case 'carry': return cur;
    case 'blank': return 0;
    case 'average':
    default:
      return (typeof recentAvg === 'number' && isFinite(recentAvg) && recentAvg > 0) ? recentAvg : cur;
  }
}

export function monthsUntil(dateStr) {
  if (!dateStr) return 0;
  var end = new Date(dateStr);
  var now = new Date();
  return Math.max(0, (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth()));
}

export function daysUntilDate(dateStr) {
  if (!dateStr) return 0;
  var target = new Date(dateStr);
  // Compare midnight-to-midnight so time-of-day can't flip the count.
  var targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.max(0, Math.round((targetMidnight - todayInTz()) / 864e5));
}

/* ── Credit Card Helpers ────────────────────────────────── */
export function promoNeeded(card) {
  var bal    = parseFloat(card.promoBalance) || parseFloat(card.balance) || 0;
  var months = monthsUntil(card.promoEndDate);
  return months <= 0 ? bal : bal / months;
}

/* ── Payment Helpers ────────────────────────────────────────
   Paid/owed is matched by whether a payment's date falls inside the
   active period's [start, end) — resolved from the period key — so
   the same logic serves calendar, custom-start-day and rolling modes
   with no data migration. `mk` is a period key (currentPeriodKey()). */
export function isPaid(type, refId, mk) {
  var bounds = boundsForKey(mk || currentPeriodKey());
  return payments.some(function(p) {
    return !p.skipped && p.type === type && String(p.refId) === String(refId) && paymentInBounds(p, bounds);
  });
}

export function paidAmount(type, refId, mk) {
  var bounds = boundsForKey(mk || currentPeriodKey());
  return payments
    .filter(function(p) {
      return !p.skipped && p.type === type && String(p.refId) === String(refId) && paymentInBounds(p, bounds);
    })
    .reduce(function(s, p) { return s + parseFloat(p.amount || 0); }, 0);
}

// A bill/card can be "skipped" for a period — stored as a payment record
// flagged `skipped` (amount 0). A skipped item owes nothing that period and
// drops out of Upcoming, but it isn't a real payment (excluded from totals
// and history). Reversible by deleting the skip record.
export function isSkipped(type, refId, mk) {
  var bounds = boundsForKey(mk || currentPeriodKey());
  return payments.some(function (p) {
    return p.skipped && p.type === type && String(p.refId) === String(refId) && paymentInBounds(p, bounds);
  });
}

/* ── Payment goal / fully-paid logic ─────────────────────────
   A bill/card counts as "fully paid" for a month once the total
   paid reaches its goal amount. The goal follows the global
   settings.paidGoal policy ("minimum" | "recommended" | "full").
   Bills carry a single amount, so their goal is always that amount.
   Payments sum per month (see paidAmount), so partial installments
   accumulate toward the goal on their own.
─────────────────────────────────────────────────────────────── */

// Cent-level tolerance so a goal met to the penny still reads as full.
var PAID_EPSILON = 0.005;

// The "recommended" payment for a card. A per-card override wins when
// set; otherwise promo cards spread the balance to clear it before the
// promo ends (never below the minimum), and non-promo cards recommend
// paying off the remaining balance (interest accrues otherwise).
export function recommendedAmount(card) {
  var override = parseFloat(card.recommendedPayment || 0);
  if (override > 0) return override;
  var min = parseFloat(card.minPayment || 0);
  // Loans: the recommended payment is the scheduled monthly payment, never
  // the whole principal — you rarely clear a mortgage/auto loan in one go
  // (paying it off is still offered as an explicit option in the Pay flow).
  if ((card.type || 'card') === 'loan') return min;
  if (card.hasPromo) return Math.max(min, promoNeeded(card));
  // 0% interest (no active promo): carrying a balance costs nothing, so the
  // recommended payment is just the minimum — not the whole balance. Only a
  // positive regular APR makes paying the balance off the smart move.
  if ((parseFloat(card.regularAPR) || 0) <= 0) return min;
  return parseFloat(card.balance || 0);
}

// The active fully-paid policy, defaulting to "recommended".
export function paidGoalPolicy() {
  var g = settings && settings.paidGoal;
  return (g === 'minimum' || g === 'full') ? g : 'recommended';
}

// The fully-paid goal for a bill/card this month, under the active
// policy. Bills always target their full amount. Cards vary:
//   minimum     → the minimum payment
//   recommended → the payoff-aware recommended amount
//   full        → the start-of-month balance. Card payments decrement
//                 the live balance, so we add this month's payments
//                 back to keep the goal stable as installments land
//                 (otherwise a partial payment would look "complete").
export function goalAmountFor(type, refId, mk) {
  mk = mk || currentPeriodKey();
  if (type === 'bill') {
    var b = bills.find(function (x) { return String(x.id) === String(refId); });
    return b ? parseFloat(b.amount || 0) : 0;
  }
  var c = cards.find(function (x) { return String(x.id) === String(refId); });
  if (!c) return 0;
  // Loans: the monthly obligation is the scheduled payment under every policy
  // — never the full principal (which would leave the row perpetually "unpaid"
  // and wreck remaining-balance totals). A per-loan override still wins.
  if ((c.type || 'card') === 'loan') {
    var loanOverride = parseFloat(c.recommendedPayment || 0);
    return loanOverride > 0 ? loanOverride : parseFloat(c.minPayment || 0);
  }
  var policy = paidGoalPolicy();
  if (policy === 'minimum') return parseFloat(c.minPayment || 0);
  // "full" and a non-promo "recommended" both target paying the balance
  // to zero. Card payments decrement the live balance, so add this
  // month's payments back to keep that goal stable across installments.
  var startBalance = parseFloat(c.balance || 0) + paidAmount(type, refId, mk);
  if (policy === 'full') return startBalance;
  // recommended:
  var override = parseFloat(c.recommendedPayment || 0);
  if (override > 0) return override;
  if (c.hasPromo) return Math.max(parseFloat(c.minPayment || 0), promoNeeded(c));
  // 0% interest (no active promo): no interest cost to carry, so the goal is
  // just the minimum rather than the full start-of-month balance.
  if ((parseFloat(c.regularAPR) || 0) <= 0) return parseFloat(c.minPayment || 0);
  return startBalance;
}

// Amount still owed toward the goal this period (0 once the goal is met).
// A skipped item owes nothing.
export function remainingForItem(type, refId, mk) {
  mk = mk || currentPeriodKey();
  if (isSkipped(type, refId, mk)) return 0;
  return Math.max(0, goalAmountFor(type, refId, mk) - paidAmount(type, refId, mk));
}

// True once nothing remains toward the goal (covers $0-goal items too).
export function isFullyPaid(type, refId, mk) {
  return remainingForItem(type, refId, mk) <= PAID_EPSILON;
}

// State for badges/rows: 'skipped' | 'unpaid' | 'partial' | 'full'.
export function paidState(type, refId, mk) {
  mk = mk || currentPeriodKey();
  if (isSkipped(type, refId, mk)) return 'skipped';
  if (isFullyPaid(type, refId, mk)) return 'full';
  return paidAmount(type, refId, mk) > PAID_EPSILON ? 'partial' : 'unpaid';
}

/* ── Upcoming Items Builder ─────────────────────────────── */
export function buildUpcomingItems() {
  var items = [];

  bills.forEach(function(b) {
    if (!b.dueDay && !b.startDate) return;
    if (!billActive(b)) return;
    if (!nextBillDueDate(b)) return;
    items.push({
      name:    b.name,
      // Who it's actually paid to. The name is often a nickname ("Phone"), so
      // without this the dashboard can't tell you who is taking the money.
      business: b.business || '',
      amount:  parseFloat(b.amount || 0),
      days:    daysUntilBillDue(b),
      nextDue: nextBillDueDate(b),
      type:    'bill',
      refId:   String(b.id),
      autopay: b.autopay,
      icon:    categoryIconEmoji(b.category),
      iconInfo: categoryIconInfo(b.category),
      // A recognized brand (Netflix, Spotify…) overrides the category icon.
      brand:   brandIconInfo(b.name),
    });
  });

  cards.forEach(function(c) {
    if (c.archived) return;
    if (!c.dueDay) return;
    var needed = c.hasPromo
      ? Math.max(parseFloat(c.minPayment || 0), promoNeeded(c))
      : parseFloat(c.minPayment || 0);
    items.push({
      name:    c.name + ' (payment)',
      // The card's issuer plays the same role a bill's business does.
      business: c.issuer || '',
      amount:  needed,
      days:    effectiveDaysUntilDue(parseInt(c.dueDay), 'card', String(c.id)),
      nextDue: nextDueDate(c.dueDay),
      type:    'card',
      refId:   String(c.id),
      autopay: c.autopay,
      icon:    issuerEmoji(c),
      iconInfo: issuerIconMark(c),
      brand:   issuerIconInfo(c),
    });
  });

  items.sort(function(a, b) { return a.days - b.days; });
  return items;
}

/* ── Toast ──────────────────────────────────────────────── */
export function toast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function() { el.classList.remove('show'); }, 2400);
}

/* ── Renderer registry ──────────────────────────────────────
   Avoids a circular dep between utils and the renderers: each
   renderer module imports setRenderer and self-registers, then
   modals/history/etc. call refreshAll() through this module. */
const RENDERERS = Object.create(null);

export function setRenderer(name, fn) {
  RENDERERS[name] = fn;
}

export function renderTab(name) {
  if (RENDERERS[name]) RENDERERS[name]();
}

export function refreshAll() {
  Object.keys(RENDERERS).forEach(function (t) {
    var el = document.getElementById('tab-' + t);
    if (el && el.style.display !== 'none') RENDERERS[t]();
  });
}
