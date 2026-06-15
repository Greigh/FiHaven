import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
      id: 'sess1',
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
      id: 'native-token',
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

  it('loadSession deletes expired sessions and leaves the request anonymous', () => {
    dbMock.findSession.mockReturnValueOnce({
      id: 'expired',
      user_id: 1,
      email: 'old@test.com',
      expires_at: Date.now() - 1,
    });

    const req = { cookies: { fh_test_sid: 'expired' } };
    const next = vi.fn();
    session.loadSession(req, {}, next);

    expect(dbMock.deleteSession).toHaveBeenCalledWith('expired');
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
    expect(dbMock.deleteSession).toHaveBeenCalledWith('gone');
    expect(res.clearCookie).toHaveBeenCalledWith('fh_test_sid', { path: '/' });
  });
});
