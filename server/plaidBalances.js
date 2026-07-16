/* ═══════════════════════════════════════════════════════════
   plaidBalances.js — opt-in, manual-first balance suggestions.

   FiHaven is manual-first: by default a linked bank NEVER changes
   the balances you typed (Plaid balances live only in the bank panel).
   When the user opts in (`settings.plaidUpdateBalances`), sync builds
   *proposals* for Current Balance (and credit limit when Plaid reports
   one) — never Statement Balance. The client Accepts or Declines each
   proposal; declined/accepted fingerprints are never re-prompted until
   the bank figure changes.

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

/** Stable id for Accept/Decline memory: card + rounded current + limit. */
function balanceFingerprint(cardId, proposedCurrent, limit) {
  const lim = limit != null && Number.isFinite(Number(limit)) ? String(Number(limit)) : '';
  return String(cardId) + ':' + Number(proposedCurrent).toFixed(2) + ':' + lim;
}

/**
 * Proposals: [{ id, proposedCurrent, limit?, fingerprint }] for each Plaid
 * credit/loan account that maps to EXACTLY ONE card. Skips fingerprints the
 * user already accepted or declined. Skips when the card's currentBalance
 * (and limit, when proposed) already match.
 */
function balanceProposals(cards, accounts, resolvedFingerprints) {
  const list = cards || [];
  const resolved = new Set((resolvedFingerprints || []).map(String));
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
    const card = hits[0];
    const proposedCurrent = Math.abs(owed);
    const limitNum = Number(bal.limit);
    const limit = Number.isFinite(limitNum) && limitNum > 0 ? limitNum : undefined;
    const fingerprint = balanceFingerprint(card.id, proposedCurrent, limit);
    if (resolved.has(fingerprint)) return;

    const cur = Number(card.currentBalance);
    const curMatches = Number.isFinite(cur) && Math.abs(cur - proposedCurrent) < 0.005;
    const limitMatches = limit == null || Number(card.limit) === limit;
    if (curMatches && limitMatches) return;

    const update = { id: card.id, proposedCurrent, fingerprint };
    if (limit != null) update.limit = limit;
    out.push(update);
  });
  return out;
}

/** @deprecated Use balanceProposals — kept for callers that still expect `balance`. */
function balanceUpdates(cards, accounts) {
  return balanceProposals(cards, accounts, []).map((p) => {
    const u = { id: p.id, balance: p.proposedCurrent, fingerprint: p.fingerprint };
    if (p.limit != null) u.limit = p.limit;
    return u;
  });
}

/**
 * Apply accepted proposals to cards: writes currentBalance (never statement
 * balance) and optional limit. Returns a NEW array + whether anything changed.
 */
function applyAcceptedCurrentBalance(cards, proposals) {
  const byId = new Map((proposals || []).map((u) => [String(u.id), u]));
  let changed = false;
  const next = (cards || []).map((c) => {
    const u = byId.get(String(c.id));
    if (!u) return c;
    const proposed = u.proposedCurrent != null ? u.proposedCurrent : u.balance;
    if (proposed == null || !Number.isFinite(Number(proposed))) return c;
    let nextCard = c;
    if (Number(c.currentBalance) !== Number(proposed)) {
      changed = true;
      nextCard = { ...nextCard, currentBalance: Number(proposed) };
    }
    if (u.limit != null && Number(c.limit) !== u.limit) {
      changed = true;
      nextCard = { ...nextCard, limit: u.limit };
    }
    return nextCard;
  });
  return { cards: next, changed };
}

/** @deprecated Use applyAcceptedCurrentBalance */
function applyBalanceUpdates(cards, updates) {
  const proposals = (updates || []).map((u) => ({
    id: u.id,
    proposedCurrent: u.proposedCurrent != null ? u.proposedCurrent : u.balance,
    limit: u.limit,
  }));
  return applyAcceptedCurrentBalance(cards, proposals);
}

module.exports = {
  last4,
  cardMatchesMask,
  balanceFingerprint,
  balanceProposals,
  balanceUpdates,
  applyAcceptedCurrentBalance,
  applyBalanceUpdates,
};
