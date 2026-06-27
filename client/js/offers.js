/* ═══════════════════════════════════════════════════════════
   offers.js — card-linked offers tracker (Amex Offers, Chase
   Offers, BofA Deals…). FiHaven can't auto-activate offers
   (issuer activation APIs are private), so this is a manual
   tracker: add the offers you've activated and FiHaven keeps the
   expiry in front of you so you actually use them before they
   lapse. Offers live on the card (`card.offers`); "used" is a flag
   toggled from the Rewards tab.

   Pure helpers here are mirrored by Offers.swift / Offers.kt.
═══════════════════════════════════════════════════════════ */

import { today } from './tz.js';

const DAY = 864e5;

function parseYmd(s) {
  if (!s) return null;
  const p = String(s).split('-').map(Number);
  if (p.length < 3 || !p[0] || !p[1] || !p[2]) return null;
  return new Date(p[0], p[1] - 1, p[2]);
}

// Whole days until an offer expires (negative once past). null when the
// offer has no expiry date.
export function offerDaysLeft(offer, date) {
  const end = parseYmd(offer.expires);
  if (!end) return null;
  const now = date || today();
  return Math.round((end - now) / DAY);
}

// An offer is expired once its expiry date is in the past.
export function offerExpired(offer, date) {
  const d = offerDaysLeft(offer, date);
  return d != null && d < 0;
}

// Every still-actionable offer across all cards: not used and not expired,
// flattened with its card and days-left, soonest expiry first. Offers with
// no expiry sort last.
export function activeOffers(cards, date) {
  const now = date || today();
  const out = [];
  (cards || []).forEach((c) => {
    (c.offers || []).forEach((o) => {
      if (o.used) return;
      const daysLeft = offerDaysLeft(o, now);
      if (daysLeft != null && daysLeft < 0) return;   // expired
      out.push({ card: c, offer: o, daysLeft });
    });
  });
  out.sort((a, b) => {
    if (a.daysLeft == null) return 1;
    if (b.daysLeft == null) return -1;
    return a.daysLeft - b.daysLeft;
  });
  return out;
}

// How many active offers expire within `withinDays` (default a week) —
// the "use these soon" nudge count.
export function offersExpiringSoon(cards, withinDays, date) {
  const limit = withinDays == null ? 7 : withinDays;
  return activeOffers(cards, date)
    .filter((x) => x.daysLeft != null && x.daysLeft <= limit).length;
}

/* ── Plaid-assisted "looks like you used this" detection ──────────
   When bank transactions are synced (Plaid) or entered manually, we can
   spot a charge at an offer's merchant and nudge the user to mark the
   offer used. It's a SUGGESTION only — the user still confirms, because
   a charge at the merchant doesn't guarantee the offer's terms were met
   (minimum spend, eligible products…). FiHaven never auto-marks. */

// Normalize a merchant string for fuzzy matching: lowercase, alphanumerics
// only ("Amex Travel #123" → "amextravel123").
function normMerchant(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// The most recent transaction that looks like it satisfies `offer`, or null.
// Matches a positive-amount charge whose merchant contains (or is contained
// by) the offer's merchant, dated within the last `windowDays` (default 60)
// and not in the future. Skips used offers.
export function offerLikelyUsedTx(offer, transactions, date, windowDays) {
  if (!offer || offer.used) return null;
  const m = normMerchant(offer.merchant);
  if (m.length < 3) return null;
  const now = date || today();
  const span = (windowDays == null ? 60 : windowDays) * DAY;
  const start = new Date(now.getTime() - span);
  let best = null;
  let bestDate = null;
  (transactions || []).forEach((t) => {
    if ((Number(t.amount) || 0) <= 0) return;
    const tm = normMerchant(t.merchant);
    if (tm.length < 3) return;
    if (!tm.includes(m) && !m.includes(tm)) return;
    const td = parseYmd(t.date);
    if (!td || td < start || td > now) return;
    if (!bestDate || td > bestDate) { best = t; bestDate = td; }
  });
  return best;
}

// For every active (unused, unexpired) offer across all cards, any matching
// transaction that suggests it was used — { card, offer, tx }. Drives the
// "looks like you used this offer" prompt on the Rewards tab.
export function offerUseSuggestions(cards, transactions, date) {
  const out = [];
  (cards || []).forEach((c) => {
    (c.offers || []).forEach((o) => {
      if (o.used || offerExpired(o, date)) return;
      const tx = offerLikelyUsedTx(o, transactions, date);
      if (tx) out.push({ card: c, offer: o, tx });
    });
  });
  return out;
}

export function newOfferId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
