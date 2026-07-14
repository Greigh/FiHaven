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

function mapPlaidCategory(pfc) {
  const primary = (pfc && pfc.primary) || '';
  const detailed = (pfc && pfc.detailed) || '';
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
    category: mapPlaidCategory(t.personal_finance_category),
    merchant: t.merchant_name || t.name || 'Bank transaction',
    note: '',
    source: 'plaid',
    plaidId: t.transaction_id,
    pending: !!t.pending,
  };
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

  const all = Array.isArray(existing) ? existing.slice() : [];
  const manual = all.filter((t) => t.source !== 'plaid');
  const bank = new Map();
  all.filter((t) => t.source === 'plaid').forEach((t) => bank.set(t.plaidId || t.id, t));

  removed.forEach((r) => { const id = r.transaction_id || r; bank.delete(id); });
  [...added, ...modified].forEach((t) => {
    // Plaid signs outflows positive; anything <= 0 is money coming IN, which
    // isn't spending, so it never belongs in Spending.
    if ((t.amount || 0) <= 0) { bank.delete(t.transaction_id); return; }
    bank.set(t.transaction_id, toLocalTx(t));
  });

  let bankRows = Array.from(bank.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (bankRows.length > MAX_PLAID_TX) bankRows = bankRows.slice(0, MAX_PLAID_TX);

  return { transactions: manual.concat(bankRows), merged: true };
}

module.exports = { mergeTransactions, mapPlaidCategory, toLocalTx, MAX_PLAID_TX };
