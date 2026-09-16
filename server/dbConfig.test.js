import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

describe('db.js configuration & push device capping', () => {
  let tmpDb;
  let dbApi;

  beforeEach(() => {
    tmpDb = path.join(os.tmpdir(), `fihaven-dbtest-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    process.env.FIHAVEN_TEST_DB_PATH = tmpDb;
    delete require.cache[require.resolve('./db')];
    dbApi = require('./db');
  });

  afterEach(() => {
    try {
      dbApi.db.close();
      if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
      const wal = `${tmpDb}-wal`;
      const shm = `${tmpDb}-shm`;
      if (fs.existsSync(wal)) fs.unlinkSync(wal);
      if (fs.existsSync(shm)) fs.unlinkSync(shm);
    } catch (_) {}
  });

  it('sets busy_timeout to 5000 ms', () => {
    const timeout = dbApi.db.pragma('busy_timeout', { simple: true });
    expect(timeout).toBe(5000);
  });

  it('sets foreign_keys to ON and journal_mode to WAL', () => {
    expect(dbApi.db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(String(dbApi.db.pragma('journal_mode', { simple: true })).toLowerCase()).toBe('wal');
  });

  it('caps push devices at 10 per user, evicting the oldest on overflow', () => {
    const user = dbApi.createUser('pushtest@test.com', 'hash');
    for (let i = 1; i <= 12; i++) {
      dbApi.upsertPushDevice(user.id, 'ios', `token-${i}`);
    }

    const devices = dbApi.listPushDevices(user.id);
    expect(devices.length).toBe(10);
    const tokens = devices.map((d) => d.token);
    expect(tokens).not.toContain('token-1');
    expect(tokens).not.toContain('token-2');
    expect(tokens).toContain('token-12');
    expect(tokens).toContain('token-3');
  });
});
