/* The bank-balance review queue is ONE settings key shared by every linked
   bank. Building it from just the accounts of the item that happened to sync
   meant each bank's sync erased the previous bank's proposals, so only the
   last-synced institution's cards ever showed an Accept button. */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const SERVER_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function stub(rel, exports) {
  const abs = require.resolve(path.join(SERVER_DIR, rel));
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports };
  return abs;
}

// A fake DB holding one user record plus two linked banks. Accounts are stored
// as the plaintext legacy columns so the stubbed decryptToken never matters.
function makeDb(cards, settings, accounts = []) {
  const record = { bills: [], cards, payments: [], accounts, goals: [], transactions: [], settings };
  return {
    record,
    getUserData: () => JSON.parse(JSON.stringify(record)),
    upsertUserData: (_id, data) => { Object.assign(record, JSON.parse(JSON.stringify(data))); },
    listPlaidItems: () => [
      { id: 1, institution_name: 'American Express' },
      { id: 2, institution_name: 'Wells Fargo' },
    ],
    listPlaidAccountsByItem: (pk) => (pk === 1
      ? [{ account_id: 'amex-1', name: 'Gold Card', mask: '1009', type: 'credit', subtype: 'credit card', current_balance: 412.55, limit_balance: null }]
      : [{ account_id: 'bilt-1', name: 'Bilt Mastercard', mask: '4242', type: 'credit', subtype: 'credit card', current_balance: 89.1, limit_balance: 5000 }]),
  };
}

let routes;
let db;

function load(cards, settings, accounts = []) {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(SERVER_DIR + path.sep)) delete require.cache[key];
  }
  db = makeDb(cards, settings, accounts);
  stub('db.js', db);
  stub('plaid.js', {
    plaidConfigured: () => true,
    plaidEnv: () => 'sandbox',
    encryptToken: (v) => v,
    decryptToken: (v) => v,
  });
  routes = require(path.join(SERVER_DIR, 'routes/plaid.js'));
}

const CARDS = [
  { id: 'c-amex', name: 'Amex Gold', issuer: 'Amex', lastDigits: '1009', currentBalance: 0 },
  { id: 'c-bilt', name: 'Bilt Mastercard', issuer: 'Wells Fargo', lastDigits: '4242', currentBalance: 0 },
];

describe('refreshBalanceProposals', () => {
  beforeEach(() => { routes = null; });

  it('proposes for cards at every linked bank, not just the last one synced', () => {
    load(CARDS, { plaidUpdateBalances: true });
    routes.refreshBalanceProposals(7);

    const proposed = db.record.settings.plaidBalanceProposals;
    expect(proposed.map((p) => p.id).sort()).toEqual(['c-amex', 'c-bilt']);
    const amex = proposed.find((p) => p.id === 'c-amex');
    expect(amex.proposedCurrent).toBe(412.55);
    expect(amex.limit).toBeUndefined();
    expect(proposed.find((p) => p.id === 'c-bilt')).toMatchObject({ proposedCurrent: 89.1, limit: 5000 });
  });

  it('never proposes twice for one card, even when two banks both claim it', () => {
    // The same last-4 shows up at both institutions. One card can only hold one
    // Current Balance, so the first bank claims it and the second is ignored —
    // two rows for one card would just be an unresolvable queue.
    load([{ id: 'c-dupe', name: 'Card', lastDigits: '1009', currentBalance: 0 }],
         { plaidUpdateBalances: true });
    db.listPlaidAccountsByItem = (pk) => [{
      account_id: 'acct-' + pk,
      name: 'Card',
      mask: '1009',
      type: 'credit',
      subtype: 'credit card',
      current_balance: pk === 1 ? 412.55 : 77,
      limit_balance: null,
    }];
    routes.refreshBalanceProposals(7);
    expect(db.record.settings.plaidBalanceProposals).toEqual([
      { id: 'c-dupe', proposedCurrent: 412.55, fingerprint: 'c-dupe:412.55:' },
    ]);
  });

  it('skips figures the user already accepted or declined', () => {
    load(CARDS, {
      plaidUpdateBalances: true,
      plaidBalanceResolved: [{ fingerprint: 'c-amex:412.55:', decision: 'decline' }],
    });
    routes.refreshBalanceProposals(7);
    expect(db.record.settings.plaidBalanceProposals.map((p) => p.id)).toEqual(['c-bilt']);
  });

  // A pin survives the bank it pointed at. Relinking mints new account ids, so
  // the old pin is dead weight — and it used to bar the card from the matching
  // pool for good, silently, with no way to tell from the UI.
  it('re-matches a card pinned to an account from a bank that is gone', () => {
    load([{ id: 'c-bilt', name: 'Bilt Mastercard', lastDigits: '4242', currentBalance: 0, plaidAccountId: 'dead-acct' }],
         { plaidUpdateBalances: true });
    routes.refreshBalanceProposals(7);
    expect(db.record.settings.plaidBalanceProposals).toEqual([
      { id: 'c-bilt', proposedCurrent: 89.1, limit: 5000, fingerprint: 'c-bilt:89.10:5000' },
    ]);
  });

  it('leaves a card pinned to a live account at another bank alone', () => {
    load([{ id: 'c-bilt', name: 'Bilt Mastercard', lastDigits: '4242', currentBalance: 0, plaidAccountId: 'amex-1' }],
         { plaidUpdateBalances: true });
    routes.refreshBalanceProposals(7);
    // Pinned to the Amex account: that account's balance is proposed, and the
    // digit match at Wells Fargo is correctly ignored.
    expect(db.record.settings.plaidBalanceProposals).toEqual([
      { id: 'c-bilt', proposedCurrent: 412.55, fingerprint: 'c-bilt:412.55:' },
    ]);
  });

  it('skips an account whose balance the bank did not report', () => {
    load([{ id: 'c-x', name: 'Card', lastDigits: '1009', currentBalance: 0 }], { plaidUpdateBalances: true });
    db.listPlaidAccountsByItem = (pk) => (pk === 1
      ? [{ account_id: 'a1', name: 'Card', mask: '1009', type: 'credit', current_balance: null, limit_balance: null }]
      : []);
    routes.refreshBalanceProposals(7);
    // Nothing proposed, and no pointless write of an empty list.
    expect(db.record.settings.plaidBalanceProposals || []).toEqual([]);
  });

  it('clears the queue when the user has not opted in', () => {
    load(CARDS, { plaidUpdateBalances: false, plaidBalanceProposals: [{ id: 'c-bilt', fingerprint: 'x' }] });
    routes.refreshBalanceProposals(7);
    expect(db.record.settings.plaidBalanceProposals).toEqual([]);
  });
});

/* Matching used to be ephemeral — recomputed each sync, never written down. But
   spending attribution resolves a bank charge to a card by `plaidAccountId`
   alone, so an auto-matched card got balance proposals while its purchases went
   unattributed, and the editor's picker still read "Match automatically". */
describe('autoLinkCards', () => {
  it('writes a confident match onto the card', () => {
    load(CARDS, {});
    routes.autoLinkCards(7);
    const byId = Object.fromEntries(db.record.cards.map((c) => [c.id, c.plaidAccountId]));
    expect(byId).toEqual({ 'c-amex': 'amex-1', 'c-bilt': 'bilt-1' });
  });

  it('runs regardless of the balance-suggestions opt-in', () => {
    // Attribution is a separate concern from proposing balances.
    load(CARDS, { plaidUpdateBalances: false });
    routes.autoLinkCards(7);
    expect(db.record.cards.every((c) => c.plaidAccountId)).toBe(true);
  });

  it('never overwrites a pin the user made', () => {
    load([{ id: 'c-amex', name: 'Amex Gold', lastDigits: '1009', plaidAccountId: 'bilt-1' }], {});
    routes.autoLinkCards(7);
    expect(db.record.cards[0].plaidAccountId).toBe('bilt-1');
  });

  it('repairs a pin left behind by a bank that is gone', () => {
    load([{ id: 'c-bilt', name: 'Bilt', lastDigits: '4242', plaidAccountId: 'dead-acct' }], {});
    routes.autoLinkCards(7);
    expect(db.record.cards[0].plaidAccountId).toBe('bilt-1');
  });

  it('leaves an ambiguous card alone rather than guessing', () => {
    load([{ id: 'c-a', name: 'Card A', lastDigits: '1009' },
          { id: 'c-b', name: 'Card B', lastDigits: '1009' }], {});
    routes.autoLinkCards(7);
    expect(db.record.cards.every((c) => !c.plaidAccountId)).toBe(true);
  });

  it('honours the "don\'t link this card" opt-out, and keeps honouring it', () => {
    load([{ id: 'c-amex', name: 'Amex Gold', lastDigits: '1009', plaidAccountId: 'none' }], {});
    routes.autoLinkCards(7);
    expect(db.record.cards[0].plaidAccountId).toBe('none');
    // Still refused on the next sync — the whole point of a durable no.
    routes.autoLinkCards(7);
    expect(db.record.cards[0].plaidAccountId).toBe('none');
  });

  it('proposes no balance for an opted-out card', () => {
    load([{ id: 'c-amex', name: 'Amex Gold', lastDigits: '1009', currentBalance: 0, plaidAccountId: 'none' }],
         { plaidUpdateBalances: true });
    routes.refreshBalanceProposals(7);
    expect(db.record.settings.plaidBalanceProposals || []).toEqual([]);
  });

  it('does not pin archived cards', () => {
    load([{ id: 'c-old', name: 'Amex Gold', lastDigits: '1009', archived: true }], {});
    routes.autoLinkCards(7);
    expect(db.record.cards[0].plaidAccountId).toBeUndefined();
  });

  it('writes nothing when there is nothing new to link', () => {
    load([{ id: 'c-amex', name: 'Amex Gold', lastDigits: '1009', plaidAccountId: 'amex-1' }], {});
    let writes = 0;
    const real = db.upsertUserData;
    db.upsertUserData = (...args) => { writes += 1; return real(...args); };
    routes.autoLinkCards(7);
    expect(writes).toBe(0);
  });
});

/* The Balances tab (asset accounts) runs the same pin-then-propose path as
   cards, against `data.accounts`. It matters that syncing a bank builds the
   account queue too — the Accept/Decline review on that tab is the only place a
   depository balance gets reconciled. */
describe('asset accounts — autoLinkAssetAccounts + account proposals', () => {
  beforeEach(() => { routes = null; });

  // One linked bank (item 1) with a checking account the user could plausibly
  // have typed by hand.
  function loadWithBank(accounts, settings) {
    load([], settings, accounts);
    db.listPlaidItems = () => [{ id: 1, institution_name: 'Ally Bank' }];
    db.listPlaidAccountsByItem = () => [{
      account_id: 'ally-chk', name: 'Ally Interest Checking', mask: '8842',
      type: 'depository', subtype: 'checking', current_balance: 3120.44, limit_balance: null,
    }];
  }

  it('pins a confident name match onto the account', () => {
    loadWithBank([{ id: 'a1', name: 'Ally Checking', type: 'checking', balance: 2000 }], {});
    routes.autoLinkAssetAccounts(7);
    expect(db.record.accounts[0].plaidAccountId).toBe('ally-chk');
  });

  it('proposes the bank figure once the account is linked (explicitly or auto)', () => {
    loadWithBank(
      [{ id: 'a1', name: 'Checking', type: 'checking', balance: 2000, plaidAccountId: 'ally-chk' }],
      { plaidUpdateBalances: true },
    );
    routes.refreshBalanceProposals(7);
    expect(db.record.settings.plaidAccountProposals).toEqual([
      { id: 'a1', proposedBalance: 3120.44, fingerprint: 'acct:a1:3120.44' },
    ]);
  });

  it('a name too generic to match leaves the account unlinked and unproposed', () => {
    // This is the case the editor's picker exists for: no digits, no issuer,
    // and "checking" is on every account at the bank.
    loadWithBank([{ id: 'a1', name: 'Checking', type: 'checking', balance: 2000 }],
      { plaidUpdateBalances: true });
    routes.autoLinkAssetAccounts(7);
    routes.refreshBalanceProposals(7);
    expect(db.record.accounts[0].plaidAccountId).toBeUndefined();
    expect(db.record.settings.plaidAccountProposals || []).toEqual([]);
  });

  it('does not re-propose a figure the user already answered', () => {
    loadWithBank(
      [{ id: 'a1', name: 'Checking', type: 'checking', balance: 2000, plaidAccountId: 'ally-chk' }],
      { plaidUpdateBalances: true, plaidBalanceResolved: [{ fingerprint: 'acct:a1:3120.44', decision: 'decline' }] },
    );
    routes.refreshBalanceProposals(7);
    expect(db.record.settings.plaidAccountProposals || []).toEqual([]);
  });

  it('clears the account queue when the user has not opted in', () => {
    loadWithBank(
      [{ id: 'a1', name: 'Checking', type: 'checking', balance: 2000, plaidAccountId: 'ally-chk' }],
      { plaidUpdateBalances: false, plaidAccountProposals: [{ id: 'a1', fingerprint: 'x' }] },
    );
    routes.refreshBalanceProposals(7);
    expect(db.record.settings.plaidAccountProposals).toEqual([]);
  });

  it('honours the "don\'t link this account" opt-out', () => {
    loadWithBank([{ id: 'a1', name: 'Ally Checking', type: 'checking', balance: 2000, plaidAccountId: 'none' }],
      { plaidUpdateBalances: true });
    routes.autoLinkAssetAccounts(7);
    routes.refreshBalanceProposals(7);
    expect(db.record.accounts[0].plaidAccountId).toBe('none');
    expect(db.record.settings.plaidAccountProposals || []).toEqual([]);
  });
});
