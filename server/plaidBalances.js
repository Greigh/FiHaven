/* ═══════════════════════════════════════════════════════════
   plaidBalances.js — opt-in, conservative balance sync.

   FiHaven is manual-first: by default a linked bank NEVER changes
   the balances you typed (Plaid balances live only in the bank panel).
   When the user opts in (`settings.plaidUpdateBalances`), we may update
   a card's owed balance from the bank — but only when we can identify
   the card UNAMBIGUOUSLY by its last-4 mask. A mask that matches zero
   or several cards is skipped, so we never overwrite the wrong card.

   Pure + server-only (operates on raw Plaid account shapes), so it's
   unit-tested directly.
═══════════════════════════════════════════════════════════ */

'use strict';

// Last 4 digits of a mask/account number, or '' when there aren't four.
function last4(mask) {
  const m = String(mask == null ? '' : mask).replace(/\D/g, '');
  return m.length >= 4 ? m.slice(-4) : '';
}

// A card "owns" a Plaid account when the card's name carries the account's
// last-4 mask (e.g. "Amex Gold ••1009" or "Chase 4321"). Deliberately strict:
// the only signal FiHaven cards reliably store is the name.
function cardMatchesMask(card, mask) {
  const m4 = last4(mask);
  if (!m4) return false;
  return String((card && card.name) || '').includes(m4);
}

// Balance updates to apply: [{ id, balance }] for each Plaid credit/loan
// account that maps to EXACTLY ONE card by mask. `balance` is the positive
// amount owed (FiHaven stores card balances as a positive debt). Depository
// (checking/savings) accounts are ignored — they aren't FiHaven cards.
function balanceUpdates(cards, accounts) {
  const list = cards || [];
  const out = [];
  (accounts || []).forEach((a) => {
    if (!a) return;
    const type = String(a.type || '').toLowerCase();
    if (type !== 'credit' && type !== 'loan') return;
    const owed = Number((a.balances || {}).current);
    if (!Number.isFinite(owed)) return;
    const m4 = last4(a.mask);
    if (!m4) return;
    const hits = list.filter((c) => cardMatchesMask(c, a.mask));
    if (hits.length === 1) out.push({ id: hits[0].id, balance: Math.abs(owed) });
  });
  return out;
}

// Apply the updates to a cards array, returning a NEW array (and whether
// anything changed). Only the balance field is touched.
function applyBalanceUpdates(cards, updates) {
  const byId = new Map((updates || []).map((u) => [String(u.id), u.balance]));
  let changed = false;
  const next = (cards || []).map((c) => {
    if (byId.has(String(c.id))) {
      const b = byId.get(String(c.id));
      if (Number(c.balance) !== b) { changed = true; return { ...c, balance: b }; }
    }
    return c;
  });
  return { cards: next, changed };
}

module.exports = { last4, cardMatchesMask, balanceUpdates, applyBalanceUpdates };
