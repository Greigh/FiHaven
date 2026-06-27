/* ═══════════════════════════════════════════════════════════
   perks.js — card credits & perks tracker.

   A perk is a recurring statement credit (e.g. "$10 Uber Cash",
   "$50 hotel credit") that resets every cycle. Each cycle the user
   logs how much of the credit they've used; what's left is money on
   the table. Usage is stored per (card, perk, cycle) in
   settings.perkUsage so it round-trips with the rest of the data and
   is pruned to recent cycles (same approach as settings.autopayDone).

   Pure helpers here are mirrored by Perks.swift / Perks.kt in the
   native cores — change all three together and update each test set.
═══════════════════════════════════════════════════════════ */

import { settings, save } from './storage.svelte.js';
import { today } from './tz.js';

export const PERK_FREQUENCIES = ['monthly', 'quarterly', 'semiannual', 'annual'];

// Quarter (1–4), half (1–2) for a 0-based month.
function quarterOf(month) { return Math.floor(month / 3) + 1; }
function halfOf(month) { return Math.floor(month / 6) + 1; }

// The key identifying which cycle a date falls in, for a frequency.
// monthly → "YYYY-MM", quarterly → "YYYY-Qn", semiannual → "YYYY-Hn",
// annual → "YYYY". Summing usage under this key gives the cycle total.
export function perkCycleKey(frequency, date) {
  const d = date || today();
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (frequency) {
    case 'quarterly':  return y + '-Q' + quarterOf(m);
    case 'semiannual': return y + '-H' + halfOf(m);
    case 'annual':     return String(y);
    default:           return y + '-' + String(m + 1).padStart(2, '0');
  }
}

// [start, end) Date bounds of the cycle a date falls in. Used for the
// "expires in N days" countdown.
export function perkCycleBounds(frequency, date) {
  const d = date || today();
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (frequency) {
    case 'quarterly': {
      const qm = (quarterOf(m) - 1) * 3;
      return { start: new Date(y, qm, 1), end: new Date(y, qm + 3, 1) };
    }
    case 'semiannual': {
      const hm = (halfOf(m) - 1) * 6;
      return { start: new Date(y, hm, 1), end: new Date(y, hm + 6, 1) };
    }
    case 'annual':
      return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
    default:
      return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
  }
}

// Whole days left in the current cycle (0 on the last day).
export function perkExpiresInDays(frequency, date) {
  const d = date || today();
  const { end } = perkCycleBounds(frequency, d);
  return Math.max(0, Math.round((end - d) / 864e5) - 1);
}

function usageMap() {
  return (settings.perkUsage && typeof settings.perkUsage === 'object')
    ? settings.perkUsage : {};
}

export function perkUsageKey(cardId, perkId, frequency, date) {
  return String(cardId) + ':' + String(perkId) + ':' + perkCycleKey(frequency, date);
}

// Amount of this perk's credit already logged as used this cycle.
export function perkUsed(cardId, perk, date) {
  const v = usageMap()[perkUsageKey(cardId, perk.id, perk.frequency, date)];
  return Number(v) || 0;
}

// Credit still available this cycle (never negative, capped at the perk's value).
export function perkRemaining(cardId, perk, date) {
  const amount = Number(perk.amount) || 0;
  return Math.max(0, amount - Math.min(perkUsed(cardId, perk, date), amount));
}

// Dollars left unused across every perk on every card — the headline
// "you're leaving $X on the table" figure.
export function unrealizedCreditTotal(cards, date) {
  let total = 0;
  (cards || []).forEach((c) => {
    (c.perks || []).forEach((p) => { total += perkRemaining(c.id, p, date); });
  });
  return total;
}

// How many times a perk's cycle recurs in a year.
export function cyclesPerYear(frequency) {
  return { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 }[frequency] || 1;
}

// Annual cash value of a card's perks if every credit is fully used —
// the most a card's perks are worth in a year.
export function perksAnnualValue(card) {
  return (card.perks || []).reduce(
    (s, p) => s + (Number(p.amount) || 0) * cyclesPerYear(p.frequency), 0);
}

// Annualized value of the credits the user is ACTUALLY capturing, taking
// this cycle's logged usage as typical (used × cycles-per-year). Capped at
// each perk's value so an over-entry can't inflate it.
export function perksCapturedAnnual(card, date) {
  return (card.perks || []).reduce((s, p) => {
    const amt = Number(p.amount) || 0;
    const used = Math.min(perkUsed(card.id, p, date), amt);
    return s + used * cyclesPerYear(p.frequency);
  }, 0);
}

// "Is this annual fee worth it?" — compares the fee against the value the
// card returns: its perks (both full potential and what's actually being
// captured) plus, optionally, an estimate of rewards earned from spend.
// Returns null for fee-free cards.
//
// `rewardsEstimate` is an optional annual rewards figure the caller computes
// from category spend (rewards.cardRewardsEstimateAnnual). When omitted the
// verdict is framed on perks alone — the concrete data we always have — so
// behaviour is unchanged for callers that don't pass it.
export function cardFeeAssessment(card, date, rewardsEstimate = 0) {
  const fee = Number(card.annualFee) || 0;
  if (fee <= 0) return null;
  const potential = perksAnnualValue(card);
  const captured = perksCapturedAnnual(card, date);
  const rewards = Math.max(0, Number(rewardsEstimate) || 0);
  const value = captured + rewards;          // what the card returns today
  let verdict;
  if (value >= fee) verdict = 'keep';                  // already pays for itself
  else if (potential + rewards >= fee) verdict = 'optimize'; // would, if you used the credits
  else verdict = 'review';                             // perks + rewards don't cover it
  return { fee, potential, captured, rewards, value, net: value - fee, verdict };
}

// Record how much of a perk's credit has been used this cycle. Clamped to
// [0, perk amount]. Prunes usage entries from cycles older than last year so
// the map can't grow without bound, then persists.
export function setPerkUsage(cardId, perk, amount, date) {
  const d = date || today();
  const map = { ...usageMap() };
  const cap = Number(perk.amount) || 0;
  const clamped = Math.max(0, Math.min(Number(amount) || 0, cap));
  const key = perkUsageKey(cardId, perk.id, perk.frequency, d);

  if (clamped > 0) map[key] = clamped; else delete map[key];

  // Drop anything two+ calendar years old. Every key starts "YYYY…".
  const minYear = d.getFullYear() - 1;
  Object.keys(map).forEach((k) => {
    const y = parseInt(k.split(':').pop(), 10);
    if (y && y < minYear) delete map[k];
  });

  settings.perkUsage = map;
  save('fh_settings', settings);
}

export function newPerkId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
