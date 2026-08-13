/* ═══════════════════════════════════════════════════════════
   plaidBalanceReview.js — Accept / Decline bank Current Balance
   proposals. Manual-first: never writes Statement Balance.
═══════════════════════════════════════════════════════════ */

import { cards, settings, save } from './storage.svelte.js';
import { liveCardBalance, balanceProposalChange } from './utils.js';

const RESOLVED_CAP = 200;

/* Resolve a stored proposal against the card it names: the live balance it
   would replace, the figure it proposes, and — from the shared comparison in
   utils.js — which way the debt moves and whether the limit really changed.
   `current` is null when the card is gone, which leaves nothing to compare
   against. */
export function proposalComparison(proposal, cardList) {
  const list = Array.isArray(cardList) ? cardList : cards;
  const card = list.find((c) => String(c.id) === String(proposal.id));
  const raw = proposal.proposedCurrent != null ? proposal.proposedCurrent : proposal.balance;
  const proposed = Number.isFinite(Number(raw)) ? Number(raw) : 0;
  const current = card ? liveCardBalance(card) : null;
  const limit = Number.isFinite(Number(proposal.limit)) && proposal.limit != null
    ? Number(proposal.limit) : null;
  const cardLimit = card && Number.isFinite(parseFloat(card.limit)) && parseFloat(card.limit) > 0
    ? parseFloat(card.limit) : null;
  const change = balanceProposalChange(current, proposed, cardLimit, limit);
  return {
    current,
    proposed,
    direction: change.direction,
    limit,
    currentLimit: cardLimit,
    limitChanged: change.limitChanged,
  };
}

export function balanceFingerprint(cardId, proposedCurrent, limit) {
  const lim = limit != null && Number.isFinite(Number(limit)) ? String(Number(limit)) : '';
  return String(cardId) + ':' + Number(proposedCurrent).toFixed(2) + ':' + lim;
}

export function pendingBalanceProposals() {
  const list = Array.isArray(settings.plaidBalanceProposals)
    ? settings.plaidBalanceProposals
    : [];
  const resolved = new Set(
    (Array.isArray(settings.plaidBalanceResolved) ? settings.plaidBalanceResolved : [])
      .map((r) => (r && r.fingerprint) || r)
      .filter(Boolean)
  );
  return list.filter((p) => p && p.fingerprint && !resolved.has(p.fingerprint));
}

function rememberResolved(fingerprint, decision) {
  const list = Array.isArray(settings.plaidBalanceResolved)
    ? settings.plaidBalanceResolved.slice()
    : [];
  list.push({ fingerprint, decision, at: new Date().toISOString() });
  settings.plaidBalanceResolved = list.slice(-RESOLVED_CAP);
  settings.plaidBalanceProposals = (settings.plaidBalanceProposals || [])
    .filter((p) => p && p.fingerprint !== fingerprint);
  save('fh_settings', settings);
}

/** Accept: set Current Balance (+ optional limit). Never touches statement balance. */
export function acceptBalanceProposal(proposal) {
  if (!proposal || !proposal.fingerprint) return false;
  const card = cards.find((c) => String(c.id) === String(proposal.id));
  if (!card) {
    rememberResolved(proposal.fingerprint, 'decline');
    return false;
  }
  const proposed = proposal.proposedCurrent != null
    ? proposal.proposedCurrent
    : proposal.balance;
  if (proposed == null || !Number.isFinite(Number(proposed))) return false;
  card.currentBalance = Number(proposed);
  if (proposal.limit != null && Number.isFinite(Number(proposal.limit))) {
    card.limit = Number(proposal.limit);
  }
  save('fh_cards', cards);
  rememberResolved(proposal.fingerprint, 'accept');
  return true;
}

export function declineBalanceProposal(proposal) {
  if (!proposal || !proposal.fingerprint) return false;
  rememberResolved(proposal.fingerprint, 'decline');
  return true;
}

export function acceptAllBalanceProposals(list) {
  (list || pendingBalanceProposals()).forEach(acceptBalanceProposal);
}

export function declineAllBalanceProposals(list) {
  (list || pendingBalanceProposals()).forEach(declineBalanceProposal);
}

export function plaidBalanceMode() {
  const m = settings.plaidBalanceMode;
  return m === 'prompt' ? 'prompt' : 'review';
}
