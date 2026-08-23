/* ═══════════════════════════════════════════════════════════
   plaidMerge.js — fold a Plaid transactionsSync diff into the
   user's transactions. Pure: no database, no network.

   Two rules make this safe, and both matter:

   1. ADDITIVE. Manual rows (anything without source:'plaid') are never
      touched. FiHaven is manual-entry-first; Plaid is a safety net, not the
      source of truth.

   2. THE OPT-IN GATE GUARDS THE CURSOR. Bank import is off by default. Plaid's
      sync cursor is destructive — advance it and those transactions are never
      offered again. So when the gate is off we import nothing AND report it, so
      the caller leaves the cursor alone. Get this wrong and a user who enables
      the toggle later finds an empty Spending tab forever, because their
      history was silently consumed while they weren't looking.
═════════════════════════════════════════════════════════════════ */

'use strict';

const MAX_PLAID_TX = 500; // bound stored bank rows; manual rows are never capped

// Money moved between the user's own accounts — a credit-card payment, a
// sweep to savings. It lands in the transaction feed like everything else but
// is NOT spending: the purchases a card payment settles were already counted
// when they posted, so totalling it again double-counts them. Every spend
// total on every platform skips this category (see countsAsSpending).
const TRANSFER_CATEGORY = 'Transfer';

// Plaid's `personal_finance_category.detailed` values that mean a transfer.
// Card payments are the ones that actually distort a budget; the savings /
// account-to-account pair are the same idea and are excluded for the same
// reason.
const TRANSFER_DETAILED = [
  'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
  'TRANSFER_OUT_ACCOUNT_TRANSFER',
  'TRANSFER_OUT_SAVINGS',
];

// Fallback for banks that hand Plaid a weak category (they end up under
// LOAN_PAYMENTS or TRANSFER_OUT generally). Both halves must match, so a
// "PAYMENT" to a utility or a charge at "CARD SHOP" is not swept up.
const CARD_WORD = /\b(card|crd|cc|visa|mastercard|amex|discover)\b/i;
const PAYMENT_WORD = /\b(pmt|pymt|paymt|payment|autopay|epay)\b/i;

function looksLikeCardPayment(name) {
  const s = String(name || '');
  return CARD_WORD.test(s) && PAYMENT_WORD.test(s);
}

function isTransferTx(t) {
  const pfc = (t && t.personal_finance_category) || {};
  const detailed = pfc.detailed || '';
  if (TRANSFER_DETAILED.includes(detailed)) return true;
  const primary = pfc.primary || '';
  if (primary !== 'LOAN_PAYMENTS' && primary !== 'TRANSFER_OUT') return false;
  return looksLikeCardPayment(t && (t.merchant_name || t.name));
}

// Bank descriptors banks tack fields onto: "BILT CARD PMT~Future Amount:
// 4070.00~REF 90210". Raw, that wraps to three lines in a transaction row and
// buries the part a human reads. Keep the leading name, drop the machine
// fields, and stop shouting.
const KEEP_UPPER = new Set(['ATM', 'ACH', 'USA', 'US', 'LLC', 'INC', 'CO', 'TV', 'DVD', 'IT', 'AAA', 'BP', 'HEB', 'CVS', 'AMEX']);
const EXPAND = { PMT: 'Payment', PYMT: 'Payment', PAYMT: 'Payment', XFER: 'Transfer', TRNSFR: 'Transfer', PURCH: 'Purchase', DEP: 'Deposit', WD: 'Withdrawal' };

function titleCaseWord(w) {
  const bare = w.replace(/[^A-Za-z]/g, '');
  // hasOwn, not a truthy lookup: a word like "CONSTRUCTOR" would otherwise
  // find Object.prototype.constructor and splice a function's source into the
  // name. Only all-caps words reach here today, so no prototype key can
  // actually match — but that is an accident, not a guarantee.
  if (Object.hasOwn(EXPAND, bare)) return w.replace(bare, EXPAND[bare]);
  if (KEEP_UPPER.has(bare)) return w;
  // Capitalize after any non-letter too, so "TST*THE DINER" reads as
  // "Tst*The Diner" rather than "Tst*the diner".
  return w.toLowerCase().replace(/(^|[^a-z])([a-z])/g, (_, pre, c) => pre + c.toUpperCase());
}

function cleanMerchant(raw) {
  const original = String(raw == null ? '' : raw).trim();
  if (!original) return '';
  // Everything after the first tilde is the bank's own bookkeeping.
  let s = original.split('~')[0];
  // Collapse runs FIRST. The patterns below are anchored and would otherwise
  // have to walk a long stretch of whitespace, and `\s*#?\s*` in particular
  // could split one run between two quantifiers in as many ways as it is long.
  // A bank descriptor never gets near that, but the cost of not relying on it
  // is one line.
  s = s.replace(/\s+/g, ' ');
  // Payment-processor prefixes ("SQ *BLUE BOTTLE", "TST* THE DINER").
  s = s.replace(/^[A-Za-z]{2,6} ?\* ?/, '');
  // Trailing trace / auth / reference numbers and masked card tails. One
  // character class rather than `\s*#?\s*`, so there is a single way to match.
  s = s.replace(/ (?:ref|trace|auth|conf|id|acct|account)[ #]*[\w-]+$/i, '');
  s = s.replace(/\s+[x*#]{2,}\d{2,}$/i, '');
  s = s.replace(/\s+\d{6,}$/, '');
  s = s.replace(/\s+#\s*\d+$/, ''); // store number: "COSTCO WHSE #1234"
  s = s.replace(/\s+/g, ' ').replace(/[\s.,;:#*_-]+$/, '').trim();
  // ALL-CAPS descriptors read as shouting next to "Costco" and "Amazon".
  if (s && s === s.toUpperCase() && /[A-Z]/.test(s)) {
    s = s.split(' ').map(titleCaseWord).join(' ');
  }
  // Never clean a name away entirely — a descriptor that is all reference
  // number is still better than a blank row.
  return s || original;
}

function mapPlaidCategory(pfc) {
  const primary = (pfc && pfc.primary) || '';
  const detailed = (pfc && pfc.detailed) || '';
  if (TRANSFER_DETAILED.includes(detailed)) return TRANSFER_CATEGORY;
  if (detailed.includes('GROCERIES')) return 'Groceries';
  switch (primary) {
    case 'FOOD_AND_DRINK': return 'Dining';
    case 'GENERAL_MERCHANDISE': return 'Shopping';
    case 'TRANSPORTATION': return 'Transport';
    case 'TRAVEL': return 'Transport';
    case 'ENTERTAINMENT': return 'Entertainment';
    case 'MEDICAL':
    case 'PERSONAL_CARE': return 'Health';
    case 'RENT_AND_UTILITIES':
    case 'LOAN_PAYMENTS':
    case 'BANK_FEES': return 'Bills';
    default: return 'Other';
  }
}

function toLocalTx(t) {
  return {
    id: 'plaid-' + t.transaction_id,
    date: t.date || '',
    amount: Math.abs(t.amount) || 0,
    category: isTransferTx(t) ? TRANSFER_CATEGORY : mapPlaidCategory(t.personal_finance_category),
    // What the IMPORTER chose, kept alongside the live category so a later
    // pass can tell "we picked this" from "the user re-filed it" (retidyStored).
    autoCategory: isTransferTx(t) ? TRANSFER_CATEGORY : mapPlaidCategory(t.personal_finance_category),
    merchant: cleanMerchant(t.merchant_name || t.name) || 'Bank transaction',
    note: '',
    source: 'plaid',
    plaidId: t.transaction_id,
    pending: !!t.pending,
    // Which linked account the charge came from. Stored rather than resolved
    // to a card id so that re-pointing a card at a different account
    // re-attributes its whole history instead of stranding it.
    accountId: t.account_id || '',
  };
}

// Plaid only re-sends a transaction when the BANK changes it, so a row
// imported before the descriptor tidy-up keeps its raw name and its old
// category forever. Re-tidy stored rows as they pass back through the merge —
// but conservatively: a name the user rewrote and a category they re-picked by
// hand must survive untouched.
//   • the name is only re-cleaned when it still looks machine-written (packed
//     fields, a trailing reference number, or ALL CAPS),
//   • the category only moves when the row still carries the category the
//     IMPORTER gave it (`autoCategory`).
//
// `autoCategory` is what makes the second rule honest. Inferring "the user
// hasn't touched this" from the category being 'Bills' or 'Other' was wrong in
// both directions: those are values a user can pick too, so someone who
// deliberately filed a card payment under Bills had it flipped to Transfer —
// and flipped again on every subsequent sync, so their correction could never
// stick. Rows imported before the field existed carry no record, so they get
// that old guess exactly once and are then stamped, which makes the next edit
// authoritative.
function looksRaw(name) {
  const s = String(name || '');
  if (!s) return false;
  return s.includes('~') || /\d{4,}$/.test(s) || (s === s.toUpperCase() && /[A-Z]/.test(s));
}

function retidyStored(t) {
  const out = { ...t };
  if (looksRaw(out.merchant)) {
    const cleaned = cleanMerchant(out.merchant);
    if (cleaned) out.merchant = cleaned;
  }
  const stamped = typeof out.autoCategory === 'string' && out.autoCategory !== '';
  const untouched = stamped
    ? out.category === out.autoCategory
    : (out.category === 'Bills' || out.category === 'Other');
  if (untouched && looksLikeCardPayment(t.merchant)) {
    out.category = TRANSFER_CATEGORY;
    // This re-file is the importer's, so it becomes the new baseline — without
    // this, a user moving the row back would land on `category ===
    // autoCategory` again and get flipped a second time.
    out.autoCategory = TRANSFER_CATEGORY;
  } else if (!stamped) {
    // Legacy row left as it was: stamp it so a later hand edit reads as one.
    out.autoCategory = out.category;
  }
  return out;
}

/**
 * @param {object} settings   the user's settings (the `plaidUpdatePurchases` gate)
 * @param {Array}  existing   the user's current transactions (manual + bank)
 * @param {object} sync       a Plaid transactionsSync diff { added, modified, removed }
 * @returns {{transactions: Array|null, merged: boolean}}
 *   `merged:false` means nothing was imported and the caller MUST NOT advance
 *   the sync cursor. `transactions:null` means there is nothing to write.
 */
function mergeTransactions(settings, existing, sync) {
  if (!sync) return { transactions: null, merged: true };
  const added = sync.added || [];
  const modified = sync.modified || [];
  const removed = sync.removed || [];
  // Nothing to do — but the cursor may still advance past an empty page.
  if (!added.length && !modified.length && !removed.length) {
    return { transactions: null, merged: true };
  }

  if (!(settings && settings.plaidUpdatePurchases)) {
    return { transactions: null, merged: false };
  }

  // Bank rows the user explicitly declined. The cursor is destructive, but a
  // declined charge can still come back: a pending transaction re-posts under a
  // NEW transaction_id that points at the old one via pending_transaction_id. So
  // we suppress by both ids and never re-add either — a decline is permanent.
  const hidden = new Set(
    (settings && Array.isArray(settings.plaidHidden) ? settings.plaidHidden : []).map(String),
  );
  const isHidden = (t) =>
    hidden.has(String(t.transaction_id)) ||
    (t.pending_transaction_id != null && hidden.has(String(t.pending_transaction_id)));

  const all = Array.isArray(existing) ? existing.slice() : [];
  const manual = all.filter((t) => t.source !== 'plaid');
  const bank = new Map();
  // Drop any already-stored bank row the user has since declined (e.g. declined
  // on another device) as we fold in the diff.
  all.filter((t) => t.source === 'plaid' && !hidden.has(String(t.plaidId || t.id)))
    .forEach((t) => bank.set(t.plaidId || t.id, retidyStored(t)));

  removed.forEach((r) => { const id = r.transaction_id || r; bank.delete(id); });
  [...added, ...modified].forEach((t) => {
    // Plaid signs outflows positive; anything <= 0 is money coming IN, which
    // isn't spending, so it never belongs in Spending.
    if ((t.amount || 0) <= 0) { bank.delete(t.transaction_id); return; }
    if (isHidden(t)) { bank.delete(t.transaction_id); return; }
    bank.set(t.transaction_id, toLocalTx(t));
  });

  let bankRows = Array.from(bank.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (bankRows.length > MAX_PLAID_TX) bankRows = bankRows.slice(0, MAX_PLAID_TX);

  return { transactions: manual.concat(bankRows), merged: true };
}

module.exports = {
  mergeTransactions,
  mapPlaidCategory,
  toLocalTx,
  cleanMerchant,
  retidyStored,
  isTransferTx,
  MAX_PLAID_TX,
  TRANSFER_CATEGORY,
};
