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

/** True when the user has explicitly linked this card to this account. */
function cardIsLinkedTo(card, account) {
  const linked = card && card.plaidAccountId;
  const id = accountIdOf(account);
  return !!linked && !!id && String(linked) === id;
}

/**
 * The single card that owns `account`, or null when it's ambiguous or
 * unknown. `institutionName` enables tier 3 and may be omitted.
 */
function matchCardToAccount(cards, account, institutionName) {
  const list = Array.isArray(cards) ? cards : [];

  const explicit = list.filter((c) => cardIsLinkedTo(c, account));
  if (explicit.length) return explicit.length === 1 ? explicit[0] : null;

  // A card pinned to some *other* account is spoken for — never auto-claim it.
  const free = list.filter((c) => !(c && c.plaidAccountId));

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
 * @param {object} [opts] `{ institutionName }` enables tier-3 issuer matching.
 */
function balanceProposals(cards, accounts, resolvedFingerprints, opts) {
  const list = cards || [];
  const institutionName = (opts && opts.institutionName) || '';
  const resolved = new Set((resolvedFingerprints || []).map(String));
  const out = [];
  (accounts || []).forEach((a) => {
    if (!a) return;
    // An explicit link is trusted for *which* card, but a chequing account's
    // balance is still not a card balance — the type gate stays either way.
    const type = String(a.type || '').toLowerCase();
    if (type !== 'credit' && type !== 'loan') return;
    const bal = a.balances || {};
    const owed = Number(bal.current);
    if (!Number.isFinite(owed)) return;
    const card = matchCardToAccount(list, a, institutionName);
    if (!card) return;
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
  cardMatchesIssuerAndName,
  issuerMatchesInstitution,
  cardIsLinkedTo,
  accountIdOf,
  matchCardToAccount,
  balanceFingerprint,
  balanceProposals,
  balanceUpdates,
  applyAcceptedCurrentBalance,
  applyBalanceUpdates,
};
