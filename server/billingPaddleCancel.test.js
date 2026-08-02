/**
 * Unit tests for cancelPaddleSubscriptionsForUser().
 *
 * This runs on account deletion, so the thing worth pinning is the failure
 * classification: only "already gone at Paddle" may count as cancelled. A
 * rotated API key (401/403) or a rejected request (422) leaves a live
 * subscription billing a deleted account and MUST land in `failed`.
 *
 * Loads db.js against a temp SQLite file so we don't touch production data/.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const serverDir = path.dirname(fileURLToPath(import.meta.url));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fihaven-paddle-cancel-'));
const dbPath = path.join(tmpDir, 'test.db');

process.env.FIHAVEN_TEST_DB_PATH = dbPath;
process.env.PADDLE_API_KEY = 'pdl_test_key';   // paddleConfigured() → true

for (const rel of ['./db', './paddle', './billing']) {
  try {
    delete require.cache[require.resolve(rel, { paths: [serverDir] })];
  } catch (_) {
    /* not loaded */
  }
}

const dbApi = require('./db');
const paddle = require('./paddle');
const billing = require('./billing');

/** A Paddle API error shaped exactly like paddle.js `api()` throws. */
function paddleError(status, code) {
  const err = new Error('paddle-api-error: ' + (code || status));
  err.status = status;
  err.body = code ? { error: { code } } : {};
  return err;
}

let userId;
let calls;

describe('cancelPaddleSubscriptionsForUser', () => {
  const realCancel = paddle.cancelSubscription;

  beforeAll(() => {
    userId = dbApi.createUser(`paddle-cancel-${Date.now()}@example.com`, 'x').id;
  });

  beforeEach(() => {
    calls = [];
    const now = Date.now();
    dbApi.upsertSubscription({
      user_id: userId,
      platform: 'paddle',
      product_id: 'pri_1',
      txn_id: 'sub_1',
      status: 'active',
      expires_at: now + 30 * 24 * 60 * 60 * 1000,
      environment: 'Sandbox',
      auto_renew: 1,
      raw: '{}',
      created_at: now,
      updated_at: now,
    });
  });

  afterAll(() => {
    paddle.cancelSubscription = realCancel;
    try { dbApi.deleteUser(userId); } catch (_) { /* best effort */ }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function stubCancel(impl) {
    paddle.cancelSubscription = async (id, effectiveFrom) => {
      calls.push({ id, effectiveFrom });
      return impl(id);
    };
  }

  it('cancels immediately and reports success', async () => {
    stubCancel(() => ({ id: 'sub_1', status: 'canceled' }));
    const out = await billing.cancelPaddleSubscriptionsForUser(userId);
    expect(out).toEqual({ cancelled: ['sub_1'], failed: [] });
    expect(calls).toEqual([{ id: 'sub_1', effectiveFrom: 'immediately' }]);
  });

  it('treats a 404 / entity_not_found as already cancelled', async () => {
    stubCancel(() => { throw paddleError(404, 'entity_not_found'); });
    const out = await billing.cancelPaddleSubscriptionsForUser(userId);
    expect(out).toEqual({ cancelled: ['sub_1'], failed: [] });
  });

  it('treats an already-canceled subscription as cancelled', async () => {
    stubCancel(() => { throw paddleError(400, 'subscription_update_when_canceled'); });
    const out = await billing.cancelPaddleSubscriptionsForUser(userId);
    expect(out).toEqual({ cancelled: ['sub_1'], failed: [] });
  });

  // The regression this file exists for: these used to be counted as success.
  for (const [status, code] of [
    [401, 'authentication_missing'],
    [403, 'forbidden'],
    [422, 'subscription_locked_renewal_in_progress'],
    [429, 'too_many_requests'],
    [500, null],
  ]) {
    it(`reports a ${status} as failed`, async () => {
      stubCancel(() => { throw paddleError(status, code); });
      const out = await billing.cancelPaddleSubscriptionsForUser(userId);
      expect(out).toEqual({ cancelled: [], failed: ['sub_1'] });
    });
  }
});
