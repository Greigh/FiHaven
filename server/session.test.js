import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Sessions are stored under the SHA-256 of their id, so a test that hands the
// middleware a cookie has to expect the *hash* at the database boundary. These
// are the hashes of the raw ids used below.
const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const HASH = Object.fromEntries(
  ['sess1', 'native-token', 'sess-db-down', 'expired', 'gone'].map((id) => [id, sha256(id)]),
);

const require = createRequire(import.meta.url);
const serverDir = path.dirname(fileURLToPath(import.meta.url));

function stubModule(modulePath, exports) {
  const resolved = require.resolve(modulePath, { paths: [serverDir] });
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
}

function clearModule(modulePath) {
  try {
    delete require.cache[require.resolve(modulePath, { paths: [serverDir] })];
  } catch (_) {
    /* not loaded yet */
  }
}

describe('session.js', () => {
  const dbMock = {
    insertSession: vi.fn(),
    deleteSession: vi.fn(),
    findSession: vi.fn(),
    touchLastSeen: vi.fn(),
  };
  let session;

  beforeEach(() => {
    Object.values(dbMock).forEach((fn) => fn.mockClear());
    clearModule('./session');
    clearModule('./db');
    stubModule('./db', dbMock);
    process.env.SESSION_COOKIE = 'fh_test_sid';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    session = require('./session');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loadSession resolves a valid cookie session into req.user', () => {
    dbMock.findSession.mockReturnValueOnce({
      id_hash: HASH.sess1,
      user_id: 9,
      email: 'user@test.com',
      name: 'User',
      role: 'user',
      email_verified: 1,
      onboarded: 0,
      csrf_token: 'csrf-abc',
      expires_at: Date.now() + 60_000,
    });

    const req = { cookies: { fh_test_sid: 'sess1' }, ip: '127.0.0.1' };
    const next = vi.fn();
    session.loadSession(req, {}, next);

    expect(req.user).toMatchObject({
      id: 9,
      email: 'user@test.com',
      emailVerified: true,
    });
    expect(req.authVia).toBe('cookie');
    expect(next).toHaveBeenCalledOnce();
  });

  it('loadSession accepts Bearer tokens for native clients', () => {
    dbMock.findSession.mockReturnValueOnce({
      id_hash: HASH['native-token'],
      user_id: 3,
      email: 'native@test.com',
      role: 'user',
      email_verified: 1,
      onboarded: 1,
      csrf_token: 'csrf-native',
      expires_at: Date.now() + 60_000,
    });

    const req = {
      cookies: {},
      get: (h) => (h.toLowerCase() === 'authorization' ? 'Bearer native-token' : undefined),
    };
    const next = vi.fn();
    session.loadSession(req, {}, next);

    expect(req.authVia).toBe('bearer');
    expect(req.user.email).toBe('native@test.com');
  });

  it('loadSession stamps last_seen once per throttle window, not per request', () => {
    const row = {
      id_hash: HASH.sess1,
      user_id: 9,
      email: 'user@test.com',
      role: 'user',
      email_verified: 1,
      onboarded: 1,
      csrf_token: 'csrf-abc',
      expires_at: Date.now() + 60 * 60 * 1000,
    };
    dbMock.findSession.mockReturnValue(row);
    const req = () => ({ cookies: { fh_test_sid: 'sess1' } });

    session.loadSession(req(), {}, vi.fn());
    session.loadSession(req(), {}, vi.fn());
    expect(dbMock.touchLastSeen).toHaveBeenCalledOnce();
    expect(dbMock.touchLastSeen).toHaveBeenCalledWith(9, Date.now());

    // Past the window, the next request writes again.
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    session.loadSession(req(), {}, vi.fn());
    expect(dbMock.touchLastSeen).toHaveBeenCalledTimes(2);
  });

  it('loadSession survives a failing last_seen write', () => {
    dbMock.findSession.mockReturnValueOnce({
      id_hash: HASH['sess-db-down'],
      user_id: 42,
      email: 'user@test.com',
      role: 'user',
      email_verified: 1,
      onboarded: 1,
      csrf_token: 'csrf-abc',
      expires_at: Date.now() + 60_000,
    });
    dbMock.touchLastSeen.mockImplementationOnce(() => { throw new Error('db locked'); });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = { cookies: { fh_test_sid: 'sess-db-down' } };
    const next = vi.fn();
    session.loadSession(req, {}, next);

    expect(req.user.id).toBe(42);
    expect(next).toHaveBeenCalledOnce();
    err.mockRestore();
  });

  it('loadSession deletes expired sessions and leaves the request anonymous', () => {
    dbMock.findSession.mockReturnValueOnce({
      id_hash: HASH.expired,
      user_id: 1,
      email: 'old@test.com',
      expires_at: Date.now() - 1,
    });

    const req = { cookies: { fh_test_sid: 'expired' } };
    const next = vi.fn();
    session.loadSession(req, {}, next);

    expect(dbMock.deleteSession).toHaveBeenCalledWith(HASH.expired);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('createSession stores a cookie session with a short TTL', () => {
    const res = { cookie: vi.fn() };
    const req = { get: () => 'TestAgent', ip: '127.0.0.1' };
    const row = session.createSession(res, { id: 5 }, req);

    expect(dbMock.insertSession).toHaveBeenCalledOnce();
    expect(row.user_id).toBe(5);
    expect(row.expires_at).toBe(row.created_at + 12 * 60 * 60 * 1000);
    expect(res.cookie).toHaveBeenCalledWith('fh_test_sid', row.id, expect.objectContaining({ httpOnly: true }));
  });

  it('createSession skips the cookie for token-mode native sessions', () => {
    const res = { cookie: vi.fn() };
    const req = { get: () => 'FiHaven/1.0', ip: '10.0.0.1' };
    const row = session.createSession(res, { id: 8 }, req, { mode: 'token' });

    expect(row.expires_at).toBeGreaterThan(row.created_at + 20 * 24 * 60 * 60 * 1000);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  /*
   * A stolen database used to be a stolen set of logins: the session id was
   * the primary key, in plaintext, so anyone who could read the file — a
   * leaked backup, a compromised host, a SQL read primitive — could replay it
   * straight into an authenticated request. That is worst for native clients,
   * whose Bearer sessions last 30 days.
   *
   * Only the hash goes to the database now. The raw id exists in exactly two
   * places: the response createSession returns, and the client that keeps it.
   */
  it('createSession stores only the hash of the session id, never the id', () => {
    const res = { cookie: vi.fn() };
    const row = session.createSession(res, { id: 5 }, { get: () => 'A', ip: '1.1.1.1' });

    const stored = dbMock.insertSession.mock.calls[0][0];
    expect(stored.id_hash).toBe(sha256(row.id));
    // Nothing in the persisted row is the credential, under any key.
    expect(Object.values(stored)).not.toContain(row.id);
    expect(JSON.stringify(stored)).not.toContain(row.id);
    // The cookie still gets the raw id — that's the half the client keeps.
    expect(res.cookie).toHaveBeenCalledWith('fh_test_sid', row.id, expect.anything());
  });

  it('createSession hands native clients a raw token that is not what is stored', () => {
    const row = session.createSession({ cookie: vi.fn() }, { id: 8 }, { get: () => 'app', ip: null }, { mode: 'token' });
    // routes/auth.js returns row.id as the Bearer token; it must be the raw
    // secret, or every native login would hand back a useless hash.
    expect(row.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(row.id).not.toBe(row.id_hash);
    expect(dbMock.insertSession.mock.calls[0][0].id_hash).toBe(sha256(row.id));
  });

  it('loadSession looks a session up by hash, so a leaked row cannot be replayed', () => {
    dbMock.findSession.mockReturnValueOnce({
      id_hash: HASH.sess1,
      user_id: 9,
      email: 'user@test.com',
      role: 'user',
      email_verified: 1,
      onboarded: 1,
      csrf_token: 'csrf-abc',
      expires_at: Date.now() + 60_000,
    });
    session.loadSession({ cookies: { fh_test_sid: 'sess1' } }, {}, vi.fn());
    expect(dbMock.findSession).toHaveBeenCalledWith(HASH.sess1);

    // Presenting the stored value itself is not a login: it hashes to
    // something else, which is exactly the point.
    dbMock.findSession.mockReturnValueOnce(undefined);
    const req = { cookies: { fh_test_sid: HASH.sess1 } };
    session.loadSession(req, {}, vi.fn());
    expect(dbMock.findSession).toHaveBeenLastCalledWith(sha256(HASH.sess1));
    expect(req.user).toBeUndefined();
  });

  it('req.session carries the stored hash, not a credential', () => {
    dbMock.findSession.mockReturnValueOnce({
      id_hash: HASH.sess1,
      user_id: 9,
      email: 'user@test.com',
      role: 'user',
      email_verified: 1,
      onboarded: 1,
      csrf_token: 'csrf-abc',
      expires_at: Date.now() + 60_000,
    });
    const req = { cookies: { fh_test_sid: 'sess1' } };
    session.loadSession(req, {}, vi.fn());
    // routes/account.js passes req.session.id_hash to deleteOtherSessions;
    // there is deliberately no req.session.id for anything to leak or log.
    expect(req.session.id_hash).toBe(HASH.sess1);
    expect(req.session.id).toBeUndefined();
  });

  it('requireVerified rejects authenticated but unverified users', () => {
    const req = { user: { id: 1, emailVerified: false } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    session.requireVerified(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'email-unverified' });
    expect(next).not.toHaveBeenCalled();
  });

  it('requireCsrf accepts matching header tokens for cookie clients', () => {
    const req = {
      authVia: 'cookie',
      session: { csrf_token: 'abc123' },
      get: (h) => (h.toLowerCase() === 'x-csrf-token' ? 'abc123' : undefined),
    };
    const next = vi.fn();
    session.requireCsrf(req, { status: vi.fn(), json: vi.fn() }, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('requireCsrf rejects missing or mismatched tokens', () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const req = {
      authVia: 'cookie',
      session: { csrf_token: 'abc123' },
      get: () => 'wrong',
    };
    const next = vi.fn();

    session.requireCsrf(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'bad-csrf-token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('requireCsrf skips the header check for Bearer clients', () => {
    const req = { authVia: 'bearer', session: { csrf_token: 'abc123' }, get: () => undefined };
    const next = vi.fn();
    session.requireCsrf(req, { status: vi.fn(), json: vi.fn() }, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('destroySession removes the row and clears the cookie', () => {
    const req = { cookies: { fh_test_sid: 'gone' } };
    const res = { clearCookie: vi.fn() };
    session.destroySession(req, res);
    expect(dbMock.deleteSession).toHaveBeenCalledWith(HASH.gone);
    expect(res.clearCookie).toHaveBeenCalledWith('fh_test_sid', { path: '/' });
  });
});
