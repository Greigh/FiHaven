/**
 * Unit tests for user_data encode/decode (AES-256-GCM + plaintext migrate).
 * Loads db.js against a temp SQLite file so we don't touch production data/.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const serverDir = path.dirname(fileURLToPath(import.meta.url));

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fihaven-userdata-'));
const dbPath = path.join(tmpDir, 'test.db');
const keyHex = crypto.randomBytes(32).toString('hex');

process.env.FIHAVEN_TEST_DB_PATH = dbPath;
process.env.MFA_ENCRYPTION_KEY = keyHex;

// Clear any cached copies so this key/DB win.
for (const rel of ['./db', './mfa']) {
  try {
    delete require.cache[require.resolve(rel, { paths: [serverDir] })];
  } catch (_) {
    /* not loaded */
  }
}

const dbApi = require('./db');
const mfa = require('./mfa');

describe('user_data encryption', () => {
  let userId;

  beforeAll(() => {
    const email = `crypto-${Date.now()}@example.com`;
    const created = dbApi.createUser(email, 'x');
    userId = created.id;
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {
      /* best-effort */
    }
  });

  it('encodeUserDataBlob does not store plaintext JSON', () => {
    const blob = dbApi.encodeUserDataBlob({
      bills: [{ id: 'b1', name: 'Rent' }],
      cards: [],
      payments: [],
      accounts: [],
      goals: [],
      transactions: [],
      settings: { currency: 'USD' },
    });
    expect(blob.trim().startsWith('{')).toBe(false);
    expect(() => JSON.parse(blob)).toThrow();
    const round = JSON.parse(mfa.decrypt(blob));
    expect(round.bills[0].name).toBe('Rent');
  });

  it('round-trips through upsertUserData / getUserData', () => {
    const payload = {
      bills: [{ id: 'b1', name: 'Power', amount: 120 }],
      cards: [{ id: 'c1', name: 'Visa' }],
      payments: [{ id: 'p1', amount: 50 }],
      accounts: [],
      goals: [],
      transactions: [],
      settings: { timezone: 'UTC' },
    };
    dbApi.upsertUserData(userId, payload);
    const got = dbApi.getUserData(userId);
    expect(got.bills).toEqual(payload.bills);
    expect(got.cards).toEqual(payload.cards);
    expect(got.payments).toEqual(payload.payments);
    expect(got.settings.timezone).toBe('UTC');

    // Raw cell must be ciphertext
    const row = dbApi.db.prepare('SELECT data FROM user_data WHERE user_id = ?').get(userId);
    expect(row.data.trim().startsWith('{')).toBe(false);
  });

  it('decodeUserDataBlob reads legacy plaintext JSON', () => {
    const plain = JSON.stringify({
      bills: [{ id: 'legacy', name: 'Internet' }],
      cards: [],
      payments: [],
      settings: { currency: 'CAD' },
    });
    const decoded = dbApi.decodeUserDataBlob(plain);
    expect(decoded.bills[0].name).toBe('Internet');
    expect(decoded.settings.currency).toBe('CAD');
    expect(decoded.accounts).toEqual([]);
  });

  it('getUserData migrates plaintext on next write', () => {
    const plain = JSON.stringify({
      bills: [{ id: 'm1', name: 'Migrate Me' }],
      cards: [],
      payments: [],
      accounts: [],
      goals: [],
      transactions: [],
      settings: {},
    });
    dbApi.db.prepare(
      `INSERT INTO user_data (user_id, data, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ).run(userId, plain, Date.now());

    const before = dbApi.getUserData(userId);
    expect(before.bills[0].name).toBe('Migrate Me');

    dbApi.upsertUserData(userId, before);
    const raw = dbApi.db.prepare('SELECT data FROM user_data WHERE user_id = ?').get(userId);
    expect(raw.data.trim().startsWith('{')).toBe(false);
    expect(dbApi.getUserData(userId).bills[0].name).toBe('Migrate Me');
  });

  it('corrupt blob returns empty defaults', () => {
    expect(dbApi.decodeUserDataBlob('not-valid-ciphertext!!!')).toEqual({
      bills: [],
      cards: [],
      payments: [],
      accounts: [],
      goals: [],
      transactions: [],
      settings: {},
    });
    expect(dbApi.decodeUserDataBlob('{not json')).toEqual({
      bills: [],
      cards: [],
      payments: [],
      accounts: [],
      goals: [],
      transactions: [],
      settings: {},
    });
  });
});
