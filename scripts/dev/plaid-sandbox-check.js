#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   scripts/dev/plaid-sandbox-check.js — one-off Plaid SANDBOX
   connectivity check (not wired into the app).

   Proves the server pipeline end-to-end without the browser/Link UI:
     link token → sandbox public_token → exchange → accounts+balances → tx sync

   Run from repo root:
     npm run plaid:sandbox

   Loads .env from the repo root (PLAID_CLIENT_ID + PLAID_SANDBOX_SECRET).
═════════════════════════════════════════════════════════════════ */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require('plaid');

const CLIENT_ID = process.env.PLAID_CLIENT_ID || process.env.PLAID_SANDBOX_CLIENT_ID;
const SECRET = process.env.PLAID_SANDBOX_SECRET || process.env.PLAID_SECRET;

if (!CLIENT_ID || !SECRET) {
  console.error('Missing sandbox creds (PLAID_CLIENT_ID + PLAID_SANDBOX_SECRET).');
  process.exit(1);
}

// Pin the server helpers to sandbox before requiring them — `.env` says
// PLAID_ENV=production, and server/plaid.js builds its client lazily from it.
process.env.PLAID_ENV = 'sandbox';
const plaid = require('../../server/plaid');

const client = new PlaidApi(new Configuration({
  basePath: PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': CLIENT_ID,
      'PLAID-SECRET': SECRET,
      'Plaid-Version': '2020-09-14',
    },
  },
}));

(async () => {
  try {
    const lt = await client.linkTokenCreate({
      user: { client_user_id: 'sandbox-check-user' },
      client_name: 'FiHaven',
      language: 'en',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
    });
    console.log('✓ linkTokenCreate    →', lt.data.link_token.slice(0, 24) + '…');

    const pt = await client.sandboxPublicTokenCreate({
      institution_id: 'ins_109508',
      initial_products: [Products.Transactions],
    });
    console.log('✓ sandboxPublicToken →', pt.data.public_token.slice(0, 24) + '…');

    const ex = await client.itemPublicTokenExchange({ public_token: pt.data.public_token });
    console.log('✓ exchange           → item_id', ex.data.item_id);

    // Go through the server helper, not the SDK directly. Calling
    // accountsBalanceGet here while the server called it through getAccounts is
    // how a production-only INVALID_PRODUCT (no paid Balance entitlement) passed
    // this check: sandbox grants every product, so the direct call never failed.
    const acct = await plaid.getAccounts(ex.data.access_token);
    console.log('✓ getAccounts        →', acct.accounts.length, 'accounts:');
    acct.accounts.forEach((a) =>
      console.log('    -', a.name, '(' + a.subtype + ')', 'bal', a.balances.current, a.balances.iso_currency_code));

    let cursor = null;
    let added = 0;
    let more = true;
    let guard = 0;
    while (more && guard++ < 5) {
      const s = await client.transactionsSync({
        access_token: ex.data.access_token,
        cursor: cursor || undefined,
      });
      added += (s.data.added || []).length;
      cursor = s.data.next_cursor;
      more = s.data.has_more;
    }
    console.log('✓ transactionsSync   →', added, 'added (cursor advanced)');

    await client.itemRemove({ access_token: ex.data.access_token });
    console.log('✓ itemRemove         → cleaned up');
    console.log('\nALL SANDBOX CHECKS PASSED');
  } catch (e) {
    const d = e?.response?.data;
    console.error('✗ FAILED:', d ? JSON.stringify(d) : e.message);
    process.exit(2);
  }
})();
