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

/* ═══════════════════════════════════════════════════════════
   Depository accounts — the Balances tab.

   The same manual-first contract as cards, applied to `data.accounts`
   (what you own) instead of `data.cards` (what you owe). Plaid reports a
   depository/investment `current` as a positive amount held, so it maps
   straight onto `account.balance` with no sign gymnastics.

   Matching is deliberately weaker than the card path because an Account
   has no `lastDigits` or `issuer` field to lean on — only a free-text
   name. So tier 2 reads the last-4 out of the name, and tier 3 requires
   a *distinctive* shared word: "checking" and "savings" are on every
   account at the bank and so are stopwords here. As with cards, a
   proposal needs EXACTLY ONE candidate, which is what keeps two savings
   accounts at the same bank from being guessed at.
═══════════════════════════════════════════════════════════ */

// Plaid account types that belong on the Balances tab. Credit and loan
// are the cards' business and are matched by balanceProposals above.
const ASSET_PLAID_TYPES = new Set(['depository', 'investment', 'brokerage']);

/** True when a Plaid account is an asset (a balance you hold), not a debt. */
function isAssetAccount(account) {
  return ASSET_PLAID_TYPES.has(String((account && account.type) || '').toLowerCase());
}

// Words that describe what nearly every bank account IS, and so tell two of
// them apart not at all. "Chase Total Checking" vs a user's "Chase Checking"
// must not match on "checking" — that would pair any account with any other.
const ACCOUNT_NAME_STOPWORDS = new Set([
  'checking', 'chequing', 'savings', 'saving', 'deposit', 'deposits',
  'money', 'market', 'brokerage', 'investment', 'investments', 'retirement',
  'total', 'everyday', 'basic', 'premier', 'advantage', 'select', 'preferred',
  'online', 'interest', 'high', 'yield', 'joint', 'individual', 'fund', 'funds',
]);

// Significant words for an *account* name: the card stopwords plus the ones
// that describe an account's kind rather than its identity.
function accountSignificantWords(v) {
  return significantWords(v).filter((w) => !ACCOUNT_NAME_STOPWORDS.has(w));
}

/** The Balances-tab `type` a Plaid account implies, or '' when unclear. */
function accountTypeFromPlaid(account) {
  const type = String((account && account.type) || '').toLowerCase();
  const subtype = String((account && account.subtype) || '').toLowerCase();
  if (type === 'investment' || type === 'brokerage') return 'investment';
  if (type !== 'depository') return '';
  if (subtype === 'checking') return 'checking';
  if (subtype === 'savings' || subtype === 'cd' || subtype === 'money market') return 'savings';
  if (subtype === 'cash management' || subtype === 'prepaid') return 'cash';
  return '';
}

// An account whose stored type can't be what Plaid is describing is never a
// candidate — a house is not a chequing account. An empty type on either side
// is treated as "unknown", which stays eligible rather than being ruled out.
function accountTypeCompatible(acct, plaidAccount) {
  const implied = accountTypeFromPlaid(plaidAccount);
  const stored = String((acct && acct.type) || '').toLowerCase();
  if (!implied || !stored) return true;
  if (implied === stored) return true;
  // Checking/savings/cash are near enough that a user's label shouldn't veto
  // an otherwise solid match; property never is.
  const liquid = new Set(['checking', 'savings', 'cash', 'other']);
  return liquid.has(implied) && liquid.has(stored);
}

/** True when the user asked that this account never be matched to a bank. */
function accountOptedOut(acct) {
  return String((acct && acct.plaidAccountId) || '') === NO_LINK;
}

function accountIsLinkedTo(acct, plaidAccount) {
  const linked = acct && acct.plaidAccountId;
  if (accountOptedOut(acct)) return false;
  const id = accountIdOf(plaidAccount);
  return !!linked && !!id && String(linked) === id;
}

// Mirrors linkIsLive for accounts: a pin to a bank that's since been removed
// must not bar the account from ever matching again.
function accountLinkIsLive(acct, known) {
  const linked = acct && acct.plaidAccountId;
  if (!linked) return false;
  if (accountOptedOut(acct)) return true;
  if (!known) return true;
  return known.has(String(linked));
}

/** Tier 2: the account name carries the Plaid mask's last four digits. */
function accountMatchesMask(acct, mask) {
  const m4 = last4(mask);
  if (!m4) return false;
  return String((acct && acct.name) || '').includes(m4);
}

/** Tier 3: a distinctive word shared with the Plaid account or its bank. */
function accountMatchesName(acct, plaidAccount, institutionName) {
  const own = new Set(accountSignificantWords(acct && acct.name));
  if (!own.size) return false;
  const bankText = [plaidAccount && plaidAccount.name, plaidAccount && plaidAccount.official_name]
    .filter(Boolean).join(' ');
  if (accountSignificantWords(bankText).some((w) => own.has(w))) return true;
  // "Ally Savings" ↔ institution "Ally": the bank's own name is distinctive
  // even when the product name shares nothing.
  const inst = canonIssuer(institutionName);
  if (!inst) return false;
  return [...own].some((w) => {
    const c = canonIssuer(w);
    return !!c && (c === inst || inst.includes(c) || c.includes(inst));
  });
}

/**
 * The single stored account that owns `plaidAccount`, or null when it's
 * ambiguous or unknown. Same three tiers as matchCardToAccount.
 */
function matchAccountToPlaid(accounts, plaidAccount, institutionName, knownAccountIds) {
  const list = Array.isArray(accounts) ? accounts : [];

  const explicit = list.filter((a) => accountIsLinkedTo(a, plaidAccount));
  if (explicit.length) return explicit.length === 1 ? explicit[0] : null;

  const free = list.filter((a) => !accountLinkIsLive(a, knownAccountIds)
    && accountTypeCompatible(a, plaidAccount));

  const byDigits = free.filter((a) => accountMatchesMask(a, plaidAccount && plaidAccount.mask));
  if (byDigits.length === 1) return byDigits[0];
  if (byDigits.length > 1) {
    const narrowed = byDigits.filter((a) => accountMatchesName(a, plaidAccount, institutionName));
    return narrowed.length === 1 ? narrowed[0] : null;
  }

  const soft = free.filter((a) => accountMatchesName(a, plaidAccount, institutionName));
  return soft.length === 1 ? soft[0] : null;
}

/** Stable id for Accept/Decline memory on an asset account. */
function accountBalanceFingerprint(accountId, proposedBalance) {
  return 'acct:' + String(accountId) + ':' + Number(proposedBalance).toFixed(2);
}

/**
 * Proposals: [{ id, proposedBalance, fingerprint }] for each Plaid asset
 * account that maps to EXACTLY ONE stored account. Skips fingerprints the
 * user already resolved, and skips when the stored balance already matches.
 *
 * @param {object} [opts] `{ institutionName, knownAccountIds }` — as for
 *   balanceProposals.
 */
function accountBalanceProposals(accounts, plaidAccounts, resolvedFingerprints, opts) {
  const list = (accounts || []).filter(Boolean);
  const institutionName = (opts && opts.institutionName) || '';
  const knownAccountIds = opts && opts.knownAccountIds;
  const resolved = new Set((resolvedFingerprints || []).map(String));
  const out = [];
  (plaidAccounts || []).forEach((a) => {
    if (!a || !isAssetAccount(a)) return;
    const proposedBalance = num((a.balances || {}).current);
    if (proposedBalance == null) return;
    const acct = matchAccountToPlaid(list, a, institutionName, knownAccountIds);
    if (!acct) return;
    const fingerprint = accountBalanceFingerprint(acct.id, proposedBalance);
    if (resolved.has(fingerprint)) return;
    const stored = Number(acct.balance);
    if (Number.isFinite(stored) && Math.abs(stored - proposedBalance) < 0.005) return;
    out.push({ id: acct.id, proposedBalance, fingerprint });
  });
  return out;
}

/**
 * Apply accepted account proposals: writes `balance` only — never the name or
 * type, which are the user's own labels. Returns a NEW array + whether
 * anything changed.
 */
function applyAcceptedAccountBalance(accounts, proposals) {
  const byId = new Map((proposals || []).map((p) => [String(p.id), p]));
  let changed = false;
  const next = (accounts || []).map((a) => {
    const p = byId.get(String(a.id));
    if (!p) return a;
    const proposed = p.proposedBalance;
    if (proposed == null || !Number.isFinite(Number(proposed))) return a;
    if (Number(a.balance) === Number(proposed)) return a;
    changed = true;
    return { ...a, balance: Number(proposed) };
  });
  return { accounts: next, changed };
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
  // ── Balances tab (asset accounts) ──
  isAssetAccount,
  accountTypeFromPlaid,
  accountTypeCompatible,
  accountOptedOut,
  accountIsLinkedTo,
  accountLinkIsLive,
  accountMatchesMask,
  accountMatchesName,
  matchAccountToPlaid,
  accountBalanceFingerprint,
  accountBalanceProposals,
  applyAcceptedAccountBalance,
};
