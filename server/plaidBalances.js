/* ═══════════════════════════════════════════════════════════
   plaidBalances.js — opt-in, manual-first balance suggestions.

   FiHaven is manual-first: by default a linked bank NEVER changes
   the balances you typed (Plaid balances live only in the bank panel).
   When the user opts in (`settings.plaidUpdateBalances`), sync builds
   *proposals* for Current Balance (and credit limit when Plaid reports
   one) — never Statement Balance. The client Accepts or Declines each
   proposal; declined/accepted fingerprints are never re-prompted until
   the bank figure changes.

   Matching runs in three tiers, most trustworthy first:

     1. EXPLICIT — `card.plaidAccountId`, set by the user in the card
        editor. Always wins, needs no mask, and can never be overridden
        by a guess. Some issuers make this the only workable route:
        American Express reports the *account* mask, which routinely
        differs from the digits printed on the card, so no amount of
        digit matching will ever connect the two.
     2. DIGITS — `card.lastDigits` ("Ends in"), with the card name as a
        fallback for older entries that baked the mask into the name.
     3. ISSUER + NAME — only when digits are absent or ambiguous: the
        card's issuer must match the institution AND a meaningful word
        must be shared with the Plaid account name ("Gold" in "Amex Gold
        Card" vs "Gold Card"). Never enough on its own to beat digits.

   A card already linked to some other account is never auto-claimed, and
   a proposal still requires EXACTLY ONE candidate — so a second Amex card
   makes FiHaven ask rather than guess.

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

/* ── Tier 3: issuer + name ────────────────────────────────────
   Deliberately weak on its own. It only ever runs when digits gave no
   answer, and both halves must agree. */

// Banks trade under several names — "Amex" on the card, "American Express"
// from Plaid. Fold both to one token so the comparison is meaningful.
const ISSUER_ALIASES = [
  [/^(amex|americanexpress)$/, 'amex'],
  [/^(bofa|boa|bankofamerica)$/, 'bankofamerica'],
  [/^(capone|capitalone)$/, 'capitalone'],
  [/^(chase|jpmorgan|jpmorganchase)$/, 'chase'],
  [/^(citi|citibank|citigroup)$/, 'citi'],
  [/^(wellsfargo|wf)$/, 'wellsfargo'],
  [/^(usbank|usbancorp)$/, 'usbank'],
  [/^(barclays|barclaycard|barclaysus)$/, 'barclays'],
  [/^(goldmansachs|goldman|marcus)$/, 'goldmansachs'],
];

// Lowercase, drop punctuation and the filler words that appear on one side
// but not the other ("Bank of America, N.A." vs "Bank of America").
function canonIssuer(v) {
  const base = String(v == null ? '' : v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(n a|na|inc|llc|the|bank|banking|cards?|credit|services?|company|co)\b/g, ' ')
    .replace(/\s+/g, '');
  for (const [re, canon] of ISSUER_ALIASES) if (re.test(base)) return canon;
  return base;
}

function issuerMatchesInstitution(cardIssuer, institutionName) {
  const a = canonIssuer(cardIssuer);
  const b = canonIssuer(institutionName);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

// Words that appear on nearly every card and so distinguish nothing. The
// product line ("gold", "sapphire", "preferred") is what carries meaning,
// so anything not listed here stays significant.
const NAME_STOPWORDS = new Set([
  'card', 'cards', 'credit', 'account', 'the', 'and', 'bank', 'rewards',
  'reward', 'visa', 'mastercard', 'amex', 'discover', 'signature', 'world',
  'elite', 'plus', 'my', 'personal', 'business',
]);

function significantWords(v) {
  return String(v == null ? '' : v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3 && !NAME_STOPWORDS.has(w) && !/^\d+$/.test(w));
}

// True when the card name and the Plaid account name share a meaningful
// word. "Gold Card" ↔ "Amex Gold Card" matches on "gold"; "Gold Card" ↔
// "Platinum Card" shares only stopwords, so it does not.
function nameOverlaps(card, account) {
  const cardWords = new Set(significantWords(card && card.name));
  if (!cardWords.size) return false;
  const accountText = [account && account.name, account && account.official_name]
    .filter(Boolean).join(' ');
  return significantWords(accountText).some((w) => cardWords.has(w));
}

/** Tier-3 candidate: same issuer AND a shared product word. */
function cardMatchesIssuerAndName(card, account, institutionName) {
  if (!card || !account) return false;
  if (!issuerMatchesInstitution(card.issuer, institutionName)) return false;
  return nameOverlaps(card, account);
}

// Plaid's raw account shape uses account_id; the client-facing shape uses
// accountId. Accept either so callers don't have to normalize first.
function accountIdOf(account) {
  if (!account) return '';
  return String(account.account_id || account.accountId || '');
}

/* The "leave this card alone" sentinel, stored in `plaidAccountId` itself.
   A real Plaid account id is a long opaque string, so this can't collide.

   It rides in the existing field rather than a new `plaidLinkOptOut` flag on
   purpose: native Bill/Card are fixed structs that drop fields they don't know,
   so a new key would be silently stripped by any client build that predates it
   — and the opt-out would revert on the user's next save from that device.
   Every client already round-trips `plaidAccountId` untouched.

   Without this, "no" was not expressible: clearing the picker back to Match
   automatically just let the next sync pin the card again. */
const NO_LINK = 'none';

/** True when the user asked that this card never be matched to a bank. */
function cardOptedOut(card) {
  return String((card && card.plaidAccountId) || '') === NO_LINK;
}

/** True when the user has explicitly linked this card to this account. */
function cardIsLinkedTo(card, account) {
  const linked = card && card.plaidAccountId;
  if (cardOptedOut(card)) return false;
  const id = accountIdOf(account);
  return !!linked && !!id && String(linked) === id;
}

/**
 * True when a card's pin should keep it out of the auto-matching pool.
 *
 * That covers a pin to an account the user actually has, and the opt-out
 * sentinel. It deliberately does NOT cover a pin to an account that's gone:
 * disconnecting a bank (or relinking one, which mints fresh account ids)
 * leaves a pin pointing at nothing, and treating that as "spoken for" would
 * bar the card from ever matching again. `known` is the set of every account
 * id across ALL the user's banks — omit it and a pin is trusted as-is, which
 * is the right default for a caller that only knows about one bank.
 */
function linkIsLive(card, known) {
  const linked = card && card.plaidAccountId;
  if (!linked) return false;
  if (cardOptedOut(card)) return true;   // an intentional "no" outlives any bank
  if (!known) return true;
  return known.has(String(linked));
}

/**
 * The single card that owns `account`, or null when it's ambiguous or
 * unknown. `institutionName` enables tier 3 and may be omitted.
 * `knownAccountIds` (a Set) marks which pins are still live.
 */
function matchCardToAccount(cards, account, institutionName, knownAccountIds) {
  const list = Array.isArray(cards) ? cards : [];

  const explicit = list.filter((c) => cardIsLinkedTo(c, account));
  if (explicit.length) return explicit.length === 1 ? explicit[0] : null;

  // A card pinned to some *other* live account is spoken for — never
  // auto-claim it. A pin to an account that no longer exists is dead weight,
  // so that card goes back in the pool.
  const free = list.filter((c) => !linkIsLive(c, knownAccountIds));

  const byDigits = free.filter((c) => cardMatchesMask(c, account && account.mask));
  if (byDigits.length === 1) return byDigits[0];

  // Digits tied between several cards: let issuer + name break the tie.
  if (byDigits.length > 1) {
    const narrowed = byDigits.filter((c) => cardMatchesIssuerAndName(c, account, institutionName));
    return narrowed.length === 1 ? narrowed[0] : null;
  }

  // No digit evidence at all (Amex, or an institution that reports no mask).
  const soft = free.filter((c) => cardMatchesIssuerAndName(c, account, institutionName));
  return soft.length === 1 ? soft[0] : null;
}

// A real number, or null. `Number(null)` is 0, so the plain Number() check let
// an account whose balance the bank didn't report propose a $0 balance — and a
// stored snapshot writes those absent figures as an explicit null.
function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * What the card actually owes, from a Plaid `balances` object.
 *
 * Plaid reports `current` on a credit line as a POSITIVE amount owed, so a
 * negative figure means one of two opposite things: you're ahead (a refund or
 * overpayment left a credit balance), or the issuer reports what's owed with
 * the sign flipped. This used to take the absolute value, which read an
 * overpaid card as debt — being $50 ahead was proposed as owing $50.
 *
 * `limit - available` is Plaid's own identity for a credit line, so when the
 * bank reports both it settles which case this is. With nothing to corroborate,
 * Plaid's documented meaning wins: a negative balance is a credit, not debt.
 *
 * @returns {number|null} amount owed (never negative), or null if unusable.
 */
function owedFromBalances(bal) {
  const b = bal || {};
  const current = num(b.current);
  if (current == null) return null;
  if (current >= 0) return current;

  const limit = num(b.limit);
  const available = num(b.available);
  if (limit != null && available != null) {
    const owed = Math.round((limit - available) * 100) / 100;
    // The line agrees with |current| → the issuer flipped the sign, not a credit.
    if (Math.abs(owed - Math.abs(current)) < 0.005) return Math.abs(current);
    return Math.max(0, owed);
  }
  return 0;
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
 *
 * Archived cards are skipped: the user has put them away, and a review queue
 * that asks about a card they can't see on the Cards tab is unanswerable.
 *
 * @param {object} [opts] `{ institutionName, knownAccountIds }` — the first
 *   enables tier-3 issuer matching, the second (a Set of every account id the
 *   user has linked) lets a pin to a removed account be ignored.
 */
function balanceProposals(cards, accounts, resolvedFingerprints, opts) {
  const list = (cards || []).filter((c) => c && !c.archived);
  const institutionName = (opts && opts.institutionName) || '';
  const knownAccountIds = opts && opts.knownAccountIds;
  const resolved = new Set((resolvedFingerprints || []).map(String));
  const out = [];
  (accounts || []).forEach((a) => {
    if (!a) return;
    // An explicit link is trusted for *which* card, but a chequing account's
    // balance is still not a card balance — the type gate stays either way.
    const type = String(a.type || '').toLowerCase();
    if (type !== 'credit' && type !== 'loan') return;
    const bal = a.balances || {};
    const proposedCurrent = owedFromBalances(bal);
    if (proposedCurrent == null) return;
    const card = matchCardToAccount(list, a, institutionName, knownAccountIds);
    if (!card) return;
    const limitNum = num(bal.limit);
    const limit = limitNum != null && limitNum > 0 ? limitNum : undefined;
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
  NO_LINK,
  cardOptedOut,
  last4,
  cardMatchesMask,
  cardMatchesIssuerAndName,
  issuerMatchesInstitution,
  cardIsLinkedTo,
  linkIsLive,
  accountIdOf,
  matchCardToAccount,
  owedFromBalances,
  balanceFingerprint,
  balanceProposals,
  balanceUpdates,
  applyAcceptedCurrentBalance,
  applyBalanceUpdates,
};
