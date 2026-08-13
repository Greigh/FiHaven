/* ═══════════════════════════════════════════════════════════
   paidGoal.js — server port of the pay-target / fully-paid-goal
   logic in client/js/utils.js (payTargetAmount, recommendedAmount,
   goalAmountFor, needsAmount).

   A "goal" is what an item should reach THIS PERIOD. Bills carry a
   single amount, so their goal is always that amount. Cards vary with
   the global settings.paidGoal policy:

     minimum     → the card's minimum payment
     recommended → the payoff-aware recommendation (the default)
     full        → the whole start-of-period balance

   Loans are the exception under every policy: the obligation is the
   scheduled monthly payment, never the full principal.

   ── Why this file exists ────────────────────────────────────
   The scheduler's autopay auto-mark used a card's `minPayment` flat,
   while every client marks the policy goal. On a "recommended" or
   "full" account the server therefore wrote a payment for the wrong
   amount — real money misreported in History and fed into
   recentPaymentAverage, which seeds the rollover prefill.

   ── This is a FOURTH copy (utils.js / Schedule.kt / Schedule.swift) ──
   Kept honest by server/paidGoal.test.js, which runs this module and
   client/js/utils.js over the same matrix of cards, policies and paid
   amounts and fails on ANY divergence. The Kotlin and Swift ports have
   no such guard — change all four together.

   `today` is passed in rather than read from the clock: the server has
   no single "today", every user has their own timezone.
═════════════════════════════════════════════════════════════ */

'use strict';

/* True when a money field was actually filled in. Blank ('' / null /
   undefined) means "not set", which is different from an explicit 0.
   Mirrors amountIsSet in client/js/utils.js. */
function amountIsSet(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return !isNaN(parseFloat(v));
}

/** The active fully-paid policy, defaulting to "recommended". */
function paidGoalPolicy(settings) {
  const g = settings && settings.paidGoal;
  return (g === 'minimum' || g === 'full') ? g : 'recommended';
}

/* Whole months from `today` to `dateStr`, floored at 0. Month-granular on
   purpose (mirrors monthsUntil in utils.js): the promo spread is a
   "payments remaining" count, not a day count. */
function monthsUntil(dateStr, today) {
  if (!dateStr) return 0;
  const parts = String(dateStr).split('-').map(Number);
  if (!parts[0] || !parts[1]) return 0;
  return Math.max(0, (parts[0] - today.getFullYear()) * 12 + ((parts[1] - 1) - today.getMonth()));
}

/* What a promo card must pay each month to clear the promo balance before the
   0% window closes. Once the window has passed, the whole balance. */
function promoNeeded(card, today) {
  const bal = parseFloat(card.promoBalance) || parseFloat(card.balance) || 0;
  const months = monthsUntil(card.promoEndDate, today);
  return months <= 0 ? bal : bal / months;
}

/* The "recommended" payment for a card. A per-card override wins when set;
   otherwise promo cards spread the balance to clear it before the promo ends
   (never below the minimum), and non-promo cards recommend paying off the
   balance — but only when a positive APR makes that the smart move. */
function recommendedAmount(card, today) {
  const override = parseFloat(card.recommendedPayment || 0);
  if (override > 0) return override;
  const min = parseFloat(card.minPayment || 0);
  // Loans: the scheduled monthly payment, never the whole principal — you
  // rarely clear a mortgage in one go.
  if ((card.type || 'card') === 'loan') return min;
  if (card.hasPromo) return Math.max(min, promoNeeded(card, today));
  // 0% interest and no active promo: carrying a balance costs nothing, so the
  // recommendation is the minimum, not the whole balance.
  if ((parseFloat(card.regularAPR) || 0) <= 0) return min;
  return parseFloat(card.balance || 0);
}

/* The card as it stood at the start of the period, payments undone. Card
   payments decrement the live balance, so balance-derived targets add this
   period's payments back: the target holds still while the remainder shrinks
   as installments land. */
function cardAtPeriodStart(card, paid) {
  if (!(paid > 0)) return card;
  const start = Object.assign({}, card);
  start.balance = (parseFloat(card.balance) || 0) + paid;
  if (card.promoBalance !== null && card.promoBalance !== undefined && card.promoBalance !== '') {
    start.promoBalance = (parseFloat(card.promoBalance) || 0) + paid;
  }
  return start;
}

/* This period's target for one pay preset, before payments are subtracted:
     minimum     → the card's minimum payment
     recommended → the payoff-aware recommendation
     monthly     → a loan's scheduled payment
     payoff      → the whole start-of-period balance */
function payTargetAmount(kind, card, paid, today) {
  if (kind === 'minimum') return parseFloat(card.minPayment || 0);
  if (kind === 'monthly') {
    const override = parseFloat(card.recommendedPayment || 0);
    return override > 0 ? override : parseFloat(card.minPayment || 0);
  }
  const start = cardAtPeriodStart(card, paid);
  if (kind === 'payoff') return parseFloat(start.balance || 0);
  return recommendedAmount(start, today);
}

/** A card's fully-paid goal this period, under `policy`. */
function goalAmountForCard(card, policy, paid, today) {
  // Loans: the monthly obligation is the scheduled payment under every policy
  // — never the full principal, which would leave the row perpetually unpaid.
  // A per-loan override still wins.
  if ((card.type || 'card') === 'loan') return payTargetAmount('monthly', card, paid, today);
  const kind = policy === 'minimum' ? 'minimum' : (policy === 'full' ? 'payoff' : 'recommended');
  return payTargetAmount(kind, card, paid, today);
}

/* True when a card has no amount to measure against, so there is nothing to
   auto-mark. Only the field the active goal actually READS counts: a
   balance-derived goal (recommended / full) legitimately reaches 0 once the
   card is paid off, which is "nothing due" rather than missing setup.

   Callers must have already excluded skipped and part-paid items — the clients
   fold those into needsAmount, the scheduler checks them first. */
function cardNeedsAmount(card, policy) {
  if ((card.type || 'card') === 'loan') {
    // An override only drives the goal while it is above zero (see the
    // 'monthly' target); otherwise the scheduled payment does.
    if (parseFloat(card.recommendedPayment || 0) > 0) return false;
    return !amountIsSet(card.minPayment);
  }
  return policy === 'minimum' && !amountIsSet(card.minPayment);
}

module.exports = {
  amountIsSet,
  paidGoalPolicy,
  monthsUntil,
  promoNeeded,
  recommendedAmount,
  payTargetAmount,
  goalAmountForCard,
  cardNeedsAmount,
};
