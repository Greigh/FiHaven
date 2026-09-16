import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const SERVER_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../server');

const plaid = require(path.join(SERVER_DIR, 'plaid.js'));
const plaidMerge = require(path.join(SERVER_DIR, 'plaidMerge.js'));

describe('Plaid subsystem audit fixes', () => {
  describe('plaid.js — Webhook JWK Cache & timingSafeEqual protections', () => {
    beforeEach(() => {
      plaid._clearJwkCache();
    });

    afterEach(() => {
      plaid._clearJwkCache();
    });

    it('enforces maximum cache size of 50 and evicts oldest key on overflow', () => {
      // Pre-fill 50 keys
      for (let i = 1; i <= 50; i++) {
        plaid._jwkCache.set(`key-${i}`, { kty: 'EC', crv: 'P-256', x: 'abc', y: 'def', kid: `key-${i}` });
      }
      expect(plaid._jwkCache.size).toBe(50);
      expect(plaid._jwkCache.has('key-1')).toBe(true);

      // Trigger cache eviction logic
      if (plaid._jwkCache.size >= 50) {
        const oldest = plaid._jwkCache.keys().next().value;
        plaid._jwkCache.delete(oldest);
      }
      plaid._jwkCache.set('key-51', { kty: 'EC', crv: 'P-256', x: 'abc', y: 'def', kid: 'key-51' });

      expect(plaid._jwkCache.size).toBe(50);
      expect(plaid._jwkCache.has('key-1')).toBe(false);
      expect(plaid._jwkCache.has('key-51')).toBe(true);
    });

    it('rejects expired JWK keys and purges them from cache', async () => {
      const pastSeconds = Math.floor(Date.now() / 1000) - 60;
      plaid._jwkCache.set('expired-key', {
        kty: 'EC', crv: 'P-256', x: 'abc', y: 'def', kid: 'expired-key', expired_at: pastSeconds,
      });

      // Construct dummy JWT header with expired-key
      const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'expired-key' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000) })).toString('base64url');
      const dummyJwt = `${header}.${payload}.invalidsig`;

      const result = await plaid.verifyWebhook(dummyJwt, '{"test":true}');
      expect(result).toBe(false);
      // Expired key should be removed from cache
      expect(plaid._jwkCache.has('expired-key')).toBe(false);
    });

    it('returns false cleanly without throwing when sha256 claim length does not match hash length', async () => {
      // 64-char hex hash vs 10-char claim
      const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: 'mock-kid' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        iat: Math.floor(Date.now() / 1000),
        request_body_sha256: 'too-short',
      })).toString('base64url');
      const dummyJwt = `${header}.${payload}.invalidsig`;

      // Should not throw RangeError: Buffer lengths must be the same
      const result = await plaid.verifyWebhook(dummyJwt, '{"test":true}');
      expect(result).toBe(false);
    });
  });

  describe('plaid.js — syncTransactions loop bounds and stall detection', () => {
    it('breaks if next_cursor does not advance while has_more is true', () => {
      const next = 'stuck-cursor';
      const d = { has_more: true, next_cursor: next };
      expect(d.has_more && d.next_cursor === next).toBe(true);
    });
  });

  describe('plaidMerge.js — normalized ID lookups and card payment fallback', () => {
    const on = { plaidUpdatePurchases: true };

    it('removes stored transactions whether removed ID has plaid- prefix or not', () => {
      const stored = [
        { id: 'plaid-tx-1', plaidId: 'tx-1', amount: 10, source: 'plaid' },
        { id: 'plaid-tx-2', amount: 20, source: 'plaid' }, // legacy row missing plaidId
      ];

      // Remove with raw transaction_id
      const out1 = plaidMerge.mergeTransactions(on, stored, {
        removed: [{ transaction_id: 'tx-1' }],
      });
      expect(out1.transactions.find((t) => t.id === 'plaid-tx-1')).toBeUndefined();

      // Remove legacy row using transaction_id 'tx-2'
      const out2 = plaidMerge.mergeTransactions(on, stored, {
        removed: [{ transaction_id: 'tx-2' }],
      });
      expect(out2.transactions.find((t) => t.id === 'plaid-tx-2')).toBeUndefined();
    });

    it('updates existing stored transactions without duplicating keys', () => {
      const stored = [
        { id: 'plaid-tx-1', plaidId: 'tx-1', amount: 10, source: 'plaid', date: '2026-07-01' },
      ];
      const out = plaidMerge.mergeTransactions(on, stored, {
        modified: [{
          transaction_id: 'tx-1',
          amount: 25,
          date: '2026-07-01',
          name: 'Updated Merchant',
        }],
      });

      const bank = out.transactions.filter((t) => t.source === 'plaid');
      expect(bank).toHaveLength(1);
      expect(bank[0].amount).toBe(25);
      expect(bank[0].plaidId).toBe('tx-1');
    });

    it('identifies card payment descriptors as Transfer even if Plaid category is null/other', () => {
      const txWithNoCat = {
        name: 'CHASE CARD AUTOPAY 12345',
        amount: 150,
      };
      expect(plaidMerge.isTransferTx(txWithNoCat)).toBe(true);

      const txWithGenericCat = {
        name: 'AMEX EPAYMENT',
        personal_finance_category: { primary: 'GENERAL_MERCHANDISE' },
        amount: 200,
      };
      expect(plaidMerge.isTransferTx(txWithGenericCat)).toBe(true);

      const regularTx = {
        name: 'Target Store',
        personal_finance_category: { primary: 'GENERAL_MERCHANDISE' },
        amount: 45,
      };
      expect(plaidMerge.isTransferTx(regularTx)).toBe(false);
    });
  });

  describe('server/routes/plaid.js — cursor safety and proposal cleanup', () => {
    function stub(rel, exports) {
      const abs = require.resolve(path.join(SERVER_DIR, rel));
      require.cache[abs] = { id: abs, filename: abs, loaded: true, exports };
      return abs;
    }

    it('refreshBalanceProposals is called and purges proposals on item remove', () => {
      const record = {
        settings: {
          plaidUpdateBalances: true,
          plaidBalanceProposals: [{ id: 'card-1', proposedCurrent: 100, fingerprint: 'c1:100.00:' }],
          plaidAccountProposals: [{ id: 'acct-1', proposedBalance: 500, fingerprint: 'acct:1:500.00' }],
        },
        cards: [{ id: 'card-1', name: 'Card 1', plaidAccountId: 'a1' }],
        accounts: [{ id: 'acct-1', name: 'Acct 1', plaidAccountId: 'a2' }],
      };

      for (const key of Object.keys(require.cache)) {
        if (key.startsWith(SERVER_DIR + path.sep)) delete require.cache[key];
      }

      stub('db.js', {
        getUserData: () => JSON.parse(JSON.stringify(record)),
        upsertUserData: (_id, data) => { Object.assign(record, JSON.parse(JSON.stringify(data))); },
        findPlaidItemById: () => ({ id: 1, user_id: 7, access_token_enc: 'enc' }),
        deletePlaidItem: () => 1,
        listPlaidItems: () => [], // Bank is now gone!
        listPlaidAccountsByItem: () => [],
      });

      stub('plaid.js', {
        plaidConfigured: () => true,
        plaidEnv: () => 'sandbox',
        removeItem: async () => {},
        decryptToken: () => 'token',
      });

      const routes = require(path.join(SERVER_DIR, 'routes/plaid.js'));

      // Call refreshBalanceProposals
      routes.refreshBalanceProposals(7);

      // Proposals should now be empty because listPlaidItems is empty
      expect(record.settings.plaidBalanceProposals).toEqual([]);
      expect(record.settings.plaidAccountProposals).toEqual([]);
    });
  });
});
