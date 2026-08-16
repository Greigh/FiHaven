/* ═══════════════════════════════════════════════════════════
   plaidBalanceReview.js — Accept / Decline bank Current Balance
   proposals. Manual-first: never writes Statement Balance.
═══════════════════════════════════════════════════════════ */

import { accounts, cards, settings, save } from './storage.svelte.js';
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

/* ═══════════════════════════════════════════════════════════
   Asset accounts — the Balances tab.

   A separate queue (`settings.plaidAccountProposals`) from the card one, so a
   client that predates the Balances tab never meets a proposal naming a row it
   can't find. The resolved-fingerprint memory is shared: one capped list of
   decisions covers both, and the account fingerprints are prefixed "acct:" so
   they can't collide with a card's.
═══════════════════════════════════════════════════════════ */

export function accountBalanceFingerprint(accountId, proposedBalance) {
  return 'acct:' + String(accountId) + ':' + Number(proposedBalance).toFixed(2);
}

export function pendingAccountProposals() {
  const list = Array.isArray(settings.plaidAccountProposals)
    ? settings.plaidAccountProposals
    : [];
  const resolved = new Set(
    (Array.isArray(settings.plaidBalanceResolved) ? settings.plaidBalanceResolved : [])
      .map((r) => (r && r.fingerprint) || r)
      .filter(Boolean)
  );
  return list.filter((p) => p && p.fingerprint && !resolved.has(p.fingerprint));
}

/* Resolve a stored account proposal against the account it names: what's
   there now, what the bank says, and which way the balance moves. `current`
   is null when the account is gone, leaving nothing to compare. */
export function accountProposalComparison(proposal, accountList) {
  const list = Array.isArray(accountList) ? accountList : accounts;
  const acct = list.find((a) => String(a.id) === String(proposal.id));
  const proposed = Number.isFinite(Number(proposal.proposedBalance))
    ? Number(proposal.proposedBalance) : 0;
  const current = acct ? (parseFloat(acct.balance) || 0) : null;
  let direction = 'same';
  if (current != null && Math.abs(proposed - current) >= 0.005) {
    direction = proposed > current ? 'up' : 'down';
  }
  return { current, proposed, direction, name: acct ? acct.name : '' };
}

function rememberAccountResolved(fingerprint, decision) {
  const list = Array.isArray(settings.plaidBalanceResolved)
    ? settings.plaidBalanceResolved.slice()
    : [];
  list.push({ fingerprint, decision, at: new Date().toISOString() });
  settings.plaidBalanceResolved = list.slice(-RESOLVED_CAP);
  settings.plaidAccountProposals = (settings.plaidAccountProposals || [])
    .filter((p) => p && p.fingerprint !== fingerprint);
  save('fh_settings', settings);
}

/** Accept: set the account's balance to the bank's figure. Nothing else —
    the name and type are the user's own labels and are never overwritten. */
export function acceptAccountProposal(proposal) {
  if (!proposal || !proposal.fingerprint) return false;
  const acct = accounts.find((a) => String(a.id) === String(proposal.id));
  if (!acct) {
    rememberAccountResolved(proposal.fingerprint, 'decline');
    return false;
  }
  const proposed = proposal.proposedBalance;
  if (proposed == null || !Number.isFinite(Number(proposed))) return false;
  acct.balance = Number(proposed);
  save('fh_accounts', accounts);
  rememberAccountResolved(proposal.fingerprint, 'accept');
  return true;
}

export function declineAccountProposal(proposal) {
  if (!proposal || !proposal.fingerprint) return false;
  rememberAccountResolved(proposal.fingerprint, 'decline');
  return true;
}

export function acceptAllAccountProposals(list) {
  (list || pendingAccountProposals()).forEach(acceptAccountProposal);
}

export function declineAllAccountProposals(list) {
  (list || pendingAccountProposals()).forEach(declineAccountProposal);
}
