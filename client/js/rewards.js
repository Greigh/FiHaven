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

// True while a card is inside an active 0% promo window (today < end).
export function inActivePromo(card) {
  if (!card.hasPromo || !card.promoEndDate) return false;
  var end = new Date(card.promoEndDate);
  if (isNaN(end)) return false;
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
    var entry = { card: c, rate: effectiveRate(c, category) };
    if (inActivePromo(c)) {
      entry.reason = promoReason(c);
      excluded.push(entry);
    } else {
      eligible.push(entry);
    }
  });
  eligible.sort(function (a, b) { return b.rate - a.rate; });
  excluded.sort(function (a, b) { return b.rate - a.rate; });
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
