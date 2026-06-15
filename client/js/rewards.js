/* ═══════════════════════════════════════════════════════════
   rewards.js — "which card should I use?" optimizer.

   Pure ranking helpers (mirrored by Rewards.swift / Rewards.kt in
   the native cores) plus a one-line Svelte mount. For a spending
   category, ranks the cards by their effective reward rate.

   A card inside an active 0% promo window is deliberately EXCLUDED
   from recommendations: the payoff engine pays 0% balances last, so
   new rewards spend there just grows untouched and starts accruing
   interest once the promo ends — no reward rate is worth that.
═══════════════════════════════════════════════════════════ */

import { mount } from 'svelte';
import RewardsView from '../svelte/RewardsView.svelte';
import { setRenderer } from './utils.js';

// A card's reward rate for a category: the per-category multiplier when
// set (> 0), otherwise the card's flat base rate.
export function effectiveRate(card, category) {
  var cats = card.rewardCategories || {};
  var v = parseFloat(cats[category]);
  if (!isNaN(v) && v > 0) return v;
  return parseFloat(card.rewardBase) || 0;
}

// Cents per point/mile (default 1 = cash back). Points currencies (Amex MR,
// Chase UR, Bilt, Capital One miles…) are worth more than a cent when redeemed
// well, so this turns a raw multiplier into a real cash-equivalent return.
export function pointValue(card) {
  var v = parseFloat(card.pointValue);
  return (!isNaN(v) && v > 0) ? v : 1;
}

// Cash-equivalent return % for a category: multiplier × point value.
export function effectiveValue(card, category) {
  return effectiveRate(card, category) * pointValue(card);
}

// True while a card is inside an active 0% promo window (today < end).
export function inActivePromo(card) {
  if (!card.hasPromo || !card.promoEndDate) return false;
  var end = new Date(card.promoEndDate);
  if (isNaN(end)) return true; // unparseable end — treat as an active promo window
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  return end >= today;
}

// Rank cards for a spending category. Loans never earn rewards and are
// dropped silently; cards in an active 0% promo are split into `excluded`
// with a human reason so the UI can explain why they're skipped.
export function rankCardsForCategory(category, list) {
  var eligible = [];
  var excluded = [];
  (list || []).forEach(function (c) {
    if ((c.type || 'card') === 'loan') return;
    var rate = effectiveRate(c, category);
    var pv = pointValue(c);
    // `rate` is the raw multiplier; `value` is the cash-equivalent return we
    // rank by, so a points card can out-earn a higher-multiplier cash card.
    var entry = { card: c, rate: rate, pointValue: pv, value: rate * pv };
    if (inActivePromo(c)) {
      entry.reason = promoReason(c);
      excluded.push(entry);
    } else {
      eligible.push(entry);
    }
  });
  eligible.sort(function (a, b) { return b.value - a.value; });
  excluded.sort(function (a, b) { return b.value - a.value; });
  return { eligible: eligible, excluded: excluded };
}

function promoReason(card) {
  var end = new Date(card.promoEndDate);
  var label = isNaN(end)
    ? 'its 0% promo'
    : '0% promo until ' + end.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  return 'Skipped: ' + label + ' — new spend isn’t prioritized for payoff and can accrue interest later.';
}

let instance = null;

export function renderRewards() {
  const target = document.getElementById('rewards-mount');
  if (!target || instance) return;
  instance = mount(RewardsView, { target });
}

setRenderer('rewards', renderRewards);
