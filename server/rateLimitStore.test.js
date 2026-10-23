import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

/* The express-rate-limit store is backed by SQLite so every cluster worker
   counts against the same bucket. These run against a scratch DB to prove
   the upsert transaction returns exact running totals and honours the
   fixed window. */

describe('SqliteRateLimitStore', () => {
  let tmpDb;
  let dbApi;
  let SqliteRateLimitStore;

  beforeEach(() => {
    tmpDb = path.join(os.tmpdir(), `fihaven-rltest-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    process.env.FIHAVEN_TEST_DB_PATH = tmpDb;
    delete require.cache[require.resolve('./db')];
    dbApi = require('./db');
    delete require.cache[require.resolve('./rateLimitStore')];
    SqliteRateLimitStore = require('./rateLimitStore').SqliteRateLimitStore;
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

  it('increments and reports the running total with a reset time', async () => {
    const store = new SqliteRateLimitStore('api');
    store.init({ windowMs: 60_000 });

    const first = await store.increment('1.2.3.4');
    const second = await store.increment('1.2.3.4');

    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(second.resetTime.getTime()).toBe(first.resetTime.getTime());
  });

  it('keeps tiers separate — a hit on auth does not count against api', async () => {
    const api = new SqliteRateLimitStore('api');
    const auth = new SqliteRateLimitStore('auth');
    api.init({ windowMs: 60_000 });
    auth.init({ windowMs: 60_000 });

    await auth.increment('1.2.3.4');
    const res = await api.increment('1.2.3.4');

    expect(res.totalHits).toBe(1);
  });

  it('opens a fresh window once reset_at has passed', async () => {
    const store = new SqliteRateLimitStore('api');
    store.init({ windowMs: 1 }); // 1ms window
    await store.increment('1.2.3.4');
    await new Promise((r) => setTimeout(r, 5));

    const res = await store.increment('1.2.3.4');
    expect(res.totalHits).toBe(1); // window rolled, counter reset
  });

  it('decrement never takes a bucket below zero', async () => {
    const store = new SqliteRateLimitStore('api');
    store.init({ windowMs: 60_000 });
    await store.increment('1.2.3.4');
    await store.decrement('1.2.3.4');
    await store.decrement('1.2.3.4');
    await store.decrement('1.2.3.4'); // no row → no-op, no -1

    const res = await store.increment('1.2.3.4');
    expect(res.totalHits).toBe(1);
  });

  it('resetKey drops the bucket entirely', async () => {
    const store = new SqliteRateLimitStore('api');
    store.init({ windowMs: 60_000 });
    await store.increment('1.2.3.4');
    await store.resetKey('1.2.3.4');

    const res = await store.increment('1.2.3.4');
    expect(res.totalHits).toBe(1);
  });

  it('pruneRateLimitHits sweeps expired rows only', async () => {
    const store = new SqliteRateLimitStore('api');
    store.init({ windowMs: 1 });
    await store.increment('old');
    const fresh = new SqliteRateLimitStore('api2');
    fresh.init({ windowMs: 60_000 });
    await fresh.increment('new');
    await new Promise((r) => setTimeout(r, 5));

    expect(dbApi.pruneRateLimitHits(Date.now())).toBe(1);
    const res = await fresh.increment('new');
    expect(res.totalHits).toBe(2); // live row untouched
  });
});
