/* ═══════════════════════════════════════════════════════════
   plaidAccounts.js — the linked-bank account list, for anything
   outside the Settings bank panel that needs to name an account.

   The card editor uses it to let someone pin a card to a specific
   account when digit matching can't get there on its own (American
   Express reports an account mask that differs from the number printed
   on the card, so no heuristic will ever connect the two).

   `/api/plaid/status` returns an empty item list for Free users and for
   anyone with no bank linked, so callers can treat "no accounts" as
   "don't show the picker" without checking entitlement themselves.
═════════════════════════════════════════════════════════════════ */

/* Stored in `plaidAccountId` to mean "never match this card to a bank".
   Clearing the picker back to Match automatically isn't a "no" — the next sync
   just pins the card again — so the refusal needs somewhere to live. It rides
   in the existing field because a separate flag would be dropped by native
   clients that predate it. Kept in sync with NO_LINK in server/plaidBalances.js. */
export const PLAID_LINK_NONE = 'none';

let cache = null;      // resolved account list
let inFlight = null;   // de-dupe concurrent callers

/** Human label for a picker row: "Amex · Platinum Card ····72002". */
function labelFor(institutionName, a) {
  const parts = [institutionName || 'Bank'];
  if (a.name) parts.push(a.name);
  const line = parts.join(' · ');
  return a.mask ? line + ' ····' + a.mask : line;
}

/**
 * Every credit/loan account across linked banks, newest link first.
 * Depository accounts are omitted: a card is never a chequing account,
 * and offering one only invites a link that proposes nonsense balances.
 *
 * @returns {Promise<Array<{accountId,label,institutionName,name,mask,type,subtype}>>}
 */
export function loadPlaidAccounts() {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;

  inFlight = fetch('/api/plaid/status', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const out = [];
      ((data && data.items) || []).forEach((item) => {
        (item.accounts || []).forEach((a) => {
          const type = String(a.type || '').toLowerCase();
          if (type !== 'credit' && type !== 'loan') return;
          out.push({
            accountId: a.accountId,
            label: labelFor(item.institutionName, a),
            institutionName: item.institutionName || '',
            name: a.name || '',
            mask: a.mask || '',
            type: a.type || '',
            subtype: a.subtype || '',
          });
        });
      });
      cache = out;
      return out;
    })
    .catch(() => [])
    .finally(() => { inFlight = null; });

  return inFlight;
}

/** Forget the cached list — call after linking or removing a bank. */
export function clearPlaidAccountCache() {
  cache = null;
}
