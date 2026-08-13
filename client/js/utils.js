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

/* Which of a card's three amounts leads its row (the big figure in the
   top-right corner). The other two always stay on the card, just smaller —
   this picks the headline, it never hides anything.
     'due'     — what to pay this period under the paid-goal policy
     'current' — live balance including post-statement charges
     'owed'    — that same goal less what's already been paid
   Defaults to 'due': the amount with a deadline attached. */
export function cardHeadlineMode(s) {
  var v = s && s.cardHeadline;
  return (v === 'current' || v === 'owed') ? v : 'due';
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

/* A stored YYYY-MM-DD is a calendar day, not an instant: `new Date(s)` parses
   the bare form as UTC midnight, so reading it back with the local getters
   lands on the previous day anywhere west of UTC. A promo ending on the 1st
   then reads as ending the month before — one month fewer to spread the
   balance over, which inflates every figure derived from it. Parse the parts
   into a local midnight instead; anything with a time attached is a real
   instant and goes through Date untouched. */
function parseLocalDate(dateStr) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  if (!m) return new Date(dateStr);
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

export function monthsUntil(dateStr) {
  if (!dateStr) return 0;
  var end = parseLocalDate(dateStr);
  var now = new Date();
  return Math.max(0, (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth()));
}

export function daysUntilDate(dateStr) {
  if (!dateStr) return 0;
  var target = parseLocalDate(dateStr);
  // Compare midnight-to-midnight so time-of-day can't flip the count.
  var targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.max(0, Math.round((targetMidnight - todayInTz()) / 864e5));
}

/* ── Credit Card Helpers ────────────────────────────────── */

/* What's actually sitting on the card right now. `balance` is the statement
   balance — what's due by the due date — while `currentBalance` (typed in, or
   pushed by a bank sync) is the live figure including charges made since the
   statement closed. Utilization and debt totals follow the live figure because
   that's what the issuer reports; the statement balance drives what's owed.
   Unset means "not tracked separately", so fall back to the statement. */
export function liveCardBalance(card) {
  if (!card) return 0;
  var cur = card.currentBalance;
  if (cur !== null && cur !== undefined && cur !== '' && isFinite(parseFloat(cur))) {
    return parseFloat(cur);
  }
  return parseFloat(card.balance) || 0;
}

/* Credit utilization as a 0..1 ratio, or null when there's nothing to measure
   against — a loan (no revolving limit) or a card with no limit set. Always
   from the live balance, because that's the figure the issuer reports.

   One helper for every caller on purpose: the row, the dashboard alert and the
   "highest utilization" sort each derived this separately, and on iOS/Android
   they drifted apart. Mirrors Schedule.utilization on both. */
export function utilizationOf(card) {
  if (!card) return null;
  if ((card.type || 'card') === 'loan') return null;
  var lim = parseFloat(card.limit) || 0;
  if (lim <= 0) return null;
  return liveCardBalance(card) / lim;
}

/* How a bank's suggested figures compare with what's on the card today, for
   the balance-review row.

   `direction` is which way the debt moves — 'up' is more owed, so the UI
   paints it red. It's measured against the LIVE balance because that's the
   field Accept overwrites; comparing against the statement would report the
   move from a figure the suggestion never touches.

   `limitChanged` is false when the bank re-reports the limit already on file,
   which keeps unchanged limits out of the row. A first limit on a card that
   has none counts as a change.

   Both use PAID_EPSILON, the same cent tolerance the paid-state maths uses —
   a re-reported figure differing in float noise is not a change. Mirrors
   Schedule.balanceProposalChange on iOS/Android. */
export function balanceProposalChange(current, proposed, currentLimit, proposedLimit) {
  var now = current == null ? null : Number(current);
  var next = Number(proposed) || 0;
  var direction = 'same';
  if (now != null && Math.abs(next - now) > PAID_EPSILON) {
    direction = next > now ? 'up' : 'down';
  }
  var lim = proposedLimit == null ? null : Number(proposedLimit);
  var haveLim = lim != null && isFinite(lim);
  var oldLim = currentLimit == null ? null : Number(currentLimit);
  return {
    direction: direction,
    limitChanged: haveLim
      && (oldLim == null || !isFinite(oldLim) || Math.abs(lim - oldLim) > PAID_EPSILON),
  };
}

/* The amounts a card row shows, resolved together so the headline and the
   smaller companion figures can never disagree.
     due     — what to pay this period: the goal the paid-goal policy names
               (minimum / recommended / full), with a per-card recommended
               payment overriding it. A loan's is its scheduled payment.
     current — live balance, the one utilization is measured against
     owed    — the same goal less what's been paid (0 if skipped)
     statement — the statement balance, or null when the row already shows it

   `due` used to be the raw statement balance, which read "$0.00" — in the
   settled green, no less — on a 0% promo card whose statement is clear but
   which still needs its monthly payoff installment to land on time. The two
   now share one goal, so `due` is the target and `owed` is what's left of it.

   That left the statement balance itself with nowhere to go whenever the goal
   isn't the balance — the minimum policy, a promo card, a per-card override —
   so `statement` carries it back. It resolves to null when it would only
   repeat `due` or `current`, and on loans, which have a principal rather than
   a statement. Deciding that here keeps the three clients from drifting. */
export function cardAmounts(card, mk) {
  if (!card) return { due: 0, current: 0, owed: 0, statement: null };
  mk = mk || currentPeriodKey();
  var due = goalAmountFor('card', String(card.id), mk);
  var current = liveCardBalance(card);
  var statement = parseFloat(card.balance) || 0;
  var redundant = (card.type || 'card') === 'loan'
    || Math.abs(statement - due) <= PAID_EPSILON
    || Math.abs(statement - current) <= PAID_EPSILON;
  return {
    due: due,
    current: current,
    owed: remainingForItem('card', String(card.id), mk),
    statement: redundant ? null : statement,
  };
}

// The other two amounts, in a stable order, for the companion lines.
// `mode` is a value from cardHeadlineMode().
export function otherCardAmounts(mode) {
  return ['due', 'current', 'owed'].filter(function (k) { return k !== mode; });
}

export function promoNeeded(card) {
  var bal    = parseFloat(card.promoBalance) || parseFloat(card.balance) || 0;
  var months = monthsUntil(card.promoEndDate);
  return months <= 0 ? bal : bal / months;
}

/* Bank rows carry the Plaid `accountId` they came from; a card carries the
   account the user linked it to. Attribution is resolved at read time on
   purpose — re-pointing a card at another account re-attributes its whole
   history rather than stranding rows tagged with a stale card id. */
export function cardForTransaction(tx, cardList) {
  var acct = tx && tx.accountId;
  if (!acct) return null;
  var list = cardList || cards;
  for (var i = 0; i < list.length; i++) {
    if (list[i].plaidAccountId && String(list[i].plaidAccountId) === String(acct)) return list[i];
  }
  return null;
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

/* ── Pay targets ─────────────────────────────────────────────
   A pay target is what an item should reach *this period* — its minimum,
   its recommendation, the whole balance — and `payTargetRemaining` is
   what's left of it after the payments already recorded. Card payments
   decrement the live balance, so balance-derived targets add this
   period's payments back: the target itself holds still while the
   remainder shrinks as installments land. */

// The card as it stood at the start of the period, payments undone.
function cardAtPeriodStart(card, paid) {
  if (!(paid > 0)) return card;
  var start = Object.assign({}, card);
  start.balance = (parseFloat(card.balance) || 0) + paid;
  if (card.promoBalance !== null && card.promoBalance !== undefined && card.promoBalance !== '') {
    start.promoBalance = (parseFloat(card.promoBalance) || 0) + paid;
  }
  return start;
}

// This period's target for one pay preset, before payments are subtracted:
//   full        → a bill's whole amount (the only kind a bill has)
//   minimum     → the card's minimum payment
//   recommended → the payoff-aware recommendation
//   monthly     → a loan's scheduled payment
//   payoff      → the whole start-of-period balance (a loan's principal)
export function payTargetAmount(kind, type, refId, mk) {
  mk = mk || currentPeriodKey();
  if (type === 'bill') {
    var b = bills.find(function (x) { return String(x.id) === String(refId); });
    return b ? parseFloat(b.amount || 0) : 0;
  }
  var c = cards.find(function (x) { return String(x.id) === String(refId); });
  if (!c) return 0;
  if (kind === 'minimum') return parseFloat(c.minPayment || 0);
  if (kind === 'monthly') {
    var override = parseFloat(c.recommendedPayment || 0);
    return override > 0 ? override : parseFloat(c.minPayment || 0);
  }
  var start = cardAtPeriodStart(c, paidAmount('card', String(refId), mk));
  if (kind === 'payoff') return parseFloat(start.balance || 0);
  return recommendedAmount(start);
}

// What's left toward a target after this period's payments (never below 0).
export function payTargetRemaining(kind, type, refId, mk) {
  mk = mk || currentPeriodKey();
  return Math.max(0, payTargetAmount(kind, type, refId, mk) - paidAmount(type, refId, mk));
}

// The active fully-paid policy, defaulting to "recommended".
export function paidGoalPolicy() {
  var g = settings && settings.paidGoal;
  return (g === 'minimum' || g === 'full') ? g : 'recommended';
}

// The fully-paid goal for a bill/card this month, under the active
// policy — the pay target the policy names. Bills always target their
// full amount. Cards vary:
//   minimum     → the minimum payment
//   recommended → the payoff-aware recommended amount
//   full        → the start-of-month balance (payoff)
export function goalAmountFor(type, refId, mk) {
  mk = mk || currentPeriodKey();
  if (type === 'bill') return payTargetAmount('full', type, refId, mk);
  var c = cards.find(function (x) { return String(x.id) === String(refId); });
  if (!c) return 0;
  // Loans: the monthly obligation is the scheduled payment under every policy
  // — never the full principal (which would leave the row perpetually "unpaid"
  // and wreck remaining-balance totals). A per-loan override still wins.
  if ((c.type || 'card') === 'loan') return payTargetAmount('monthly', type, refId, mk);
  var policy = paidGoalPolicy();
  var kind = policy === 'minimum' ? 'minimum' : (policy === 'full' ? 'payoff' : 'recommended');
  return payTargetAmount(kind, type, refId, mk);
}

// Amount still owed toward the goal this period (0 once the goal is met).
// A skipped item owes nothing.
export function remainingForItem(type, refId, mk) {
  mk = mk || currentPeriodKey();
  if (isSkipped(type, refId, mk)) return 0;
  return Math.max(0, goalAmountFor(type, refId, mk) - paidAmount(type, refId, mk));
}

// True when a money field has actually been filled in. Blank ('', null,
// undefined, whitespace) means "not set"; an explicit 0 is a real answer
// meaning "nothing is due". parseFloat cannot tell those apart — both come out
// 0 — so this reads the raw stored value instead.
export function amountIsSet(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return !isNaN(parseFloat(v));
}

// True when an item has no amount to measure against: the field that drives
// its goal was never filled in, and nothing has been paid toward it. That is
// unfinished setup — a bill saved without an amount, a loan without its
// monthly payment — not a settled debt.
//
// It has to be separate from "paid", because a zero goal satisfies
// `remaining <= 0` on its own: a mortgage with a blank monthly payment read
// "Paid this month" every month, with no payment record behind it, and the
// row's Undo had nothing to remove (it deletes a payment record), so the state
// could not be cleared from the UI at all.
//
// Only the field the active goal actually reads counts. A balance-derived goal
// (the recommended / full policies on a credit card) legitimately reaches 0
// when the card is paid off — that is "nothing due", not missing setup.
export function needsAmount(type, refId, mk) {
  mk = mk || currentPeriodKey();
  if (isSkipped(type, refId, mk)) return false;
  if (paidAmount(type, refId, mk) > PAID_EPSILON) return false;

  if (type === 'bill') {
    var b = bills.find(function (x) { return String(x.id) === String(refId); });
    return !!b && !amountIsSet(b.amount);
  }
  var c = cards.find(function (x) { return String(x.id) === String(refId); });
  if (!c) return false;
  if ((c.type || 'card') === 'loan') {
    // An override only drives the goal while it is above zero (see
    // payTargetAmount 'monthly'); otherwise the scheduled payment does.
    if (parseFloat(c.recommendedPayment || 0) > 0) return false;
    return !amountIsSet(c.minPayment);
  }
  return paidGoalPolicy() === 'minimum' && !amountIsSet(c.minPayment);
}

// True once nothing remains toward the goal. An item with no amount set is
// never "paid" — see needsAmount.
export function isFullyPaid(type, refId, mk) {
  mk = mk || currentPeriodKey();
  if (needsAmount(type, refId, mk)) return false;
  return remainingForItem(type, refId, mk) <= PAID_EPSILON;
}

// True when an item is settled because there is genuinely nothing to pay — an
// amount deliberately set to 0 — rather than because a payment was recorded.
// Lets a row say "Nothing due" instead of claiming credit for a payment that
// never happened. Derived, so there is no extra state to keep in sync.
export function nothingDue(type, refId, mk) {
  mk = mk || currentPeriodKey();
  if (isSkipped(type, refId, mk)) return false;
  return isFullyPaid(type, refId, mk) && paidAmount(type, refId, mk) <= PAID_EPSILON;
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
