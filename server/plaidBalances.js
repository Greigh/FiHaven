/* ═══════════════════════════════════════════════════════════
   plaidBalances.js — opt-in, conservative balance sync.

   FiHaven is manual-first: by default a linked bank NEVER changes
   the balances you typed (Plaid balances live only in the bank panel).
   When the user opts in (`settings.plaidUpdateBalances`), we may update
   a card's owed balance (and credit limit, when Plaid reports one) from
   the bank — but only when we can identify the card UNAMBIGUOUSLY by its
   last-digits mask. A mask that matches zero or several cards is skipped,
   so we never overwrite the wrong card.

   Matching prefers `card.lastDigits` (the "Ends in" field); the card
   name is a fallback for older entries that baked the mask into the name.

   Pure + server-only (operates on raw Plaid account shapes), so it's
   unit-tested directly.
═══════════════════════════════════════════════════════════ */

'use strict';

// Last 4 digits of a mask/account number, or '' when there aren't four.
function last4(mask) {
  const m = String(mask == null ? '' : mask).replace(/\D/g, '');
  return m.length >= 4 ? m.slice(-4) : '';
}

// Digits-only form of a last-digits / mask string (Amex may be 5).
function digitsOnly(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}

// True when card lastDigits and a Plaid mask refer to the same account.
// Handles Amex 4↔5 (e.g. card "10091" vs Plaid "0091" / "1009").
function lastDigitsMatch(cardDigits, mask) {
  const d = digitsOnly(cardDigits);
  const m = digitsOnly(mask);
  if (d.length < 4 || m.length < 4) return false;
  if (d === m || d.endsWith(m) || m.endsWith(d)) return true;
  return d.slice(-4) === m.slice(-4);
}

// A card "owns" a Plaid account when its Ends-in last digits match the
// account mask, or (fallback) the card name contains the last-4.
function cardMatchesMask(card, mask) {
  const m4 = last4(mask);
  if (!m4) return false;
  if (lastDigitsMatch(card && card.lastDigits, mask)) return true;
  return String((card && card.name) || '').includes(m4);
}

// Updates to apply: [{ id, balance, limit? }] for each Plaid credit/loan
// account that maps to EXACTLY ONE card by mask. `balance` is the positive
// amount owed (FiHaven stores card balances as a positive debt). `limit` is
// included only when Plaid reports a finite credit limit — never clear a
// typed limit when the bank omits one. Depository accounts are ignored.
function balanceUpdates(cards, accounts) {
  const list = cards || [];
  const out = [];
  (accounts || []).forEach((a) => {
    if (!a) return;
    const type = String(a.type || '').toLowerCase();
    if (type !== 'credit' && type !== 'loan') return;
    const bal = a.balances || {};
    const owed = Number(bal.current);
    if (!Number.isFinite(owed)) return;
    const m4 = last4(a.mask);
    if (!m4) return;
    const hits = list.filter((c) => cardMatchesMask(c, a.mask));
    if (hits.length !== 1) return;
    const update = { id: hits[0].id, balance: Math.abs(owed) };
    const limit = Number(bal.limit);
    if (Number.isFinite(limit) && limit > 0) update.limit = limit;
    out.push(update);
  });
  return out;
}

// Apply the updates to a cards array, returning a NEW array (and whether
// anything changed). Only balance (and limit when present) are touched.
function applyBalanceUpdates(cards, updates) {
  const byId = new Map((updates || []).map((u) => [String(u.id), u]));
  let changed = false;
  const next = (cards || []).map((c) => {
    const u = byId.get(String(c.id));
    if (!u) return c;
    let nextCard = c;
    if (Number(c.balance) !== u.balance) {
      changed = true;
      nextCard = { ...nextCard, balance: u.balance };
    }
    if (u.limit != null && Number(c.limit) !== u.limit) {
      changed = true;
      nextCard = { ...nextCard, limit: u.limit };
    }
    return nextCard;
  });
  return { cards: next, changed };
}

module.exports = { last4, cardMatchesMask, balanceUpdates, applyBalanceUpdates };
