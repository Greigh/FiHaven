import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTestServer, listen, cookieFrom, clearServerCache } from './helpers/testServer.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

/*
 * Session ids used to be the `sessions` primary key in plaintext, while every
 * other secret the server keeps was already protected at rest: email tokens
 * and OAuth handoff codes are SHA-256 hashed, Plaid access tokens and the user
 * data blob are encrypted. So a copy of cleartab.db — a leaked backup, a
 * compromised host, some future SQL read primitive — was a working set of
 * logins. Native clients made that worse: their Bearer sessions last 30 days.
 *
 * Only the hash is persisted now, so the file is no longer a credential store.
 * These tests read the actual database rather than a mock, because the claim
 * being made is about what ends up on disk.
 */
describe('integration — sessions are hashed at rest', () => {
  let ctx;
  let base;
  let server;
  let sql;

  beforeAll(async () => {
    ctx = createTestServer();
    ({ base, server } = await listen(ctx.app));
    // A second, read-only connection to the same file: this is the attacker's
    // view, not the app's.
    sql = new Database(ctx.dbPath, { readonly: true });
  });

  afterAll(() => {
    sql?.close();
    server?.close();
    ctx?.close();
  });

  async function signup(label, headers = {}) {
    const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const res = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        email,
        password: 'integration1!',
        loginStartedAt: Date.now() - 5000,
        captchaToken: 'test',
      }),
    });
    const body = await res.json();
    return { email, body, cookie: cookieFrom(res.headers.get('set-cookie')) };
  }

  const rawCookieId = (cookie) => decodeURIComponent(cookie.split('=').slice(1).join('='));

  it('never writes the raw cookie session id to the database', async () => {
    const { cookie } = await signup('at-rest');
    const raw = rawCookieId(cookie);
    expect(raw).not.toBe('');

    const rows = sql.prepare('SELECT * FROM sessions').all();
    expect(rows.length).toBeGreaterThan(0);

    // The stored key is the hash of what the browser holds.
    expect(rows.some((r) => r.id_hash === sha256(raw))).toBe(true);
    // And the credential itself appears in no column of no row — not under a
    // different name, not alongside the hash.
    for (const row of rows) {
      for (const value of Object.values(row)) {
        expect(String(value)).not.toContain(raw);
      }
    }
  });

  it('leaves no copy of the id anywhere in the database file', async () => {
    const { cookie } = await signup('file-scan');
    const raw = rawCookieId(cookie);

    // WAL mode means fresh writes may still be in the -wal file, so search the
    // whole set. A hit in any of them is a leak.
    const bytes = ['', '-wal', '-shm']
      .map((suffix) => ctx.dbPath + suffix)
      .filter((f) => fs.existsSync(f))
      .map((f) => fs.readFileSync(f).toString('latin1'))
      .join('');

    expect(bytes).not.toContain(raw);
    expect(bytes).toContain(sha256(raw));
  });

  it('still authenticates the client holding the raw id', async () => {
    const { cookie, email } = await signup('works');
    const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } });
    expect((await me.json()).user.email).toBe(email);
  });

  it('does not accept the stored hash as a session id', async () => {
    const { cookie } = await signup('replay');
    const raw = rawCookieId(cookie);
    const stored = sha256(raw);

    // This is the whole point of the change: what a database reader walks away
    // with is not a login. Presenting it just hashes again and misses.
    const asCookie = await fetch(`${base}/api/auth/me`, {
      headers: { Cookie: `fh_test_sid=${stored}` },
    });
    expect((await asCookie.json()).user).toBeNull();

    const asBearer = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${stored}` },
    });
    expect((await asBearer.json()).user).toBeNull();
  });

  it('hashes native Bearer tokens too, and they keep working', async () => {
    const { body, email } = await signup('native', { 'x-auth-mode': 'token' });
    const token = body.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const me = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await me.json()).user.email).toBe(email);

    const row = sql.prepare('SELECT * FROM sessions WHERE id_hash = ?').get(sha256(token));
    expect(row).toBeTruthy();
    // The 30-day TTL is what made the plaintext row worth stealing.
    expect(row.expires_at - row.created_at).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('logout still deletes the right row', async () => {
    const { cookie, body } = await signup('logout');
    const stored = sha256(rawCookieId(cookie));
    expect(sql.prepare('SELECT 1 FROM sessions WHERE id_hash = ?').get(stored)).toBeTruthy();

    const out = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie, 'x-csrf-token': body.csrfToken },
    });
    expect(out.status).toBe(204);
    expect(sql.prepare('SELECT 1 FROM sessions WHERE id_hash = ?').get(stored)).toBeUndefined();
  });

  it('a password change logs out other devices but keeps the current one', async () => {
    // deleteOtherSessions identifies "this session" by its stored hash. Get
    // that wrong and it either logs the caller out too or spares everyone.
    const { email, cookie, body } = await signup('rotate');
    const second = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-mode': 'token' },
      body: JSON.stringify({
        email,
        password: 'integration1!',
        loginStartedAt: Date.now() - 5000,
        captchaToken: 'test',
      }),
    });
    const otherToken = (await second.json()).token;

    const change = await fetch(`${base}/api/account/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'x-csrf-token': body.csrfToken,
      },
      body: JSON.stringify({ currentPassword: 'integration1!', newPassword: 'integration2!' }),
    });
    expect(change.status).toBe(200);

    const stillMe = await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } });
    expect((await stillMe.json()).user.email).toBe(email);

    const evicted = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    expect((await evicted.json()).user).toBeNull();
  });
});

/*
 * The old rows can't be rehashed — that needs the raw id, which is exactly what
 * we refuse to keep — so the migration drops them, logging every signed-in
 * device out once. Worth a test: an install that skipped it would keep serving
 * plaintext sessions from a table the new statements can't even address.
 */
describe('integration — migrating a pre-hash database', () => {
  let dbPath;
  let previous;

  // Build a database in the old shape the honest way: let db.js create the
  // current schema, then put `sessions` back the way it used to be and seed a
  // plaintext row. Hand-writing the whole legacy schema would drift from the
  // real one and test a fiction.
  beforeAll(() => {
    dbPath = path.join(os.tmpdir(), `fihaven-legacy-${process.pid}-${Date.now()}.db`);
    previous = process.env.FIHAVEN_TEST_DB_PATH;
    process.env.FIHAVEN_TEST_DB_PATH = dbPath;
    clearServerCache();
    require('../../server/db');
    clearServerCache();

    const legacy = new Database(dbPath);
    legacy.exec(`
      DROP TABLE sessions;
      CREATE TABLE sessions (
        id          TEXT PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf_token  TEXT NOT NULL,
        created_at  INTEGER NOT NULL,
        expires_at  INTEGER NOT NULL,
        user_agent  TEXT,
        ip          TEXT
      );
      INSERT INTO users (email, password_hash, created_at) VALUES ('old@test.com', 'x', 1);
      INSERT INTO sessions VALUES ('plaintext-session-id', 1, 'csrf', 1, 99999999999999, NULL, NULL);
    `);
    legacy.close();
  });

  afterAll(() => {
    clearServerCache();
    if (previous === undefined) delete process.env.FIHAVEN_TEST_DB_PATH;
    else process.env.FIHAVEN_TEST_DB_PATH = previous;
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(dbPath + suffix)) fs.unlinkSync(dbPath + suffix);
    }
  });

  it('rekeys the table to id_hash and drops the unconvertible rows', () => {
    // db.js runs its migrations at require time, so loading it is the upgrade.
    process.env.FIHAVEN_TEST_DB_PATH = dbPath;
    clearServerCache();
    require('../../server/db');

    const check = new Database(dbPath, { readonly: true });
    const cols = check.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
    expect(cols).toContain('id_hash');
    expect(cols).not.toContain('id');
    // The plaintext session is gone, not carried forward.
    expect(check.prepare('SELECT COUNT(*) AS n FROM sessions').get().n).toBe(0);
    // Everything else survives — this drops sessions, not accounts.
    expect(check.prepare('SELECT COUNT(*) AS n FROM users').get().n).toBe(1);
    check.close();
  });

  it('is idempotent — a second load leaves the table alone', () => {
    const check = new Database(dbPath);
    check.prepare(
      `INSERT INTO sessions (id_hash, user_id, csrf_token, created_at, expires_at)
       VALUES (?, 1, 'csrf', 1, 99999999999999)`,
    ).run(sha256('kept'));
    check.close();

    clearServerCache();
    require('../../server/db');

    const after = new Database(dbPath, { readonly: true });
    // A migration that re-ran would drop this row and log everyone out on
    // every restart.
    expect(after.prepare('SELECT COUNT(*) AS n FROM sessions').get().n).toBe(1);
    after.close();
  });
});
