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

describe('tokens.js', () => {
  const dbMock = {
    deleteEmailTokensByPurpose: vi.fn(),
    insertEmailToken: vi.fn(),
    findEmailTokenByHash: vi.fn(),
    markEmailTokenUsed: vi.fn(),
  };
  let tokens;

  beforeEach(() => {
    Object.values(dbMock).forEach((fn) => fn.mockClear());
    clearModule('./tokens');
    clearModule('./db');
    stubModule('./db', dbMock);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    tokens = require('./tokens');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hash() is deterministic SHA-256 hex', () => {
    expect(tokens.hash('abc')).toBe(tokens.hash('abc'));
    expect(tokens.hash('abc')).toMatch(/^[a-f0-9]{64}$/);
    expect(tokens.hash('abc')).not.toBe(tokens.hash('def'));
  });

  it('issue() replaces prior tokens and stores only the hash', () => {
    const raw = tokens.issue(42, 'verify-email');

    expect(typeof raw).toBe('string');
    expect(raw.length).toBeGreaterThan(20);
    expect(dbMock.deleteEmailTokensByPurpose).toHaveBeenCalledWith(42, 'verify-email');
    expect(dbMock.insertEmailToken).toHaveBeenCalledOnce();

    const inserted = dbMock.insertEmailToken.mock.calls[0][0];
    expect(inserted.user_id).toBe(42);
    expect(inserted.purpose).toBe('verify-email');
    expect(inserted.token_hash).toBe(tokens.hash(raw));
    expect(inserted.token_hash).not.toBe(raw);
    expect(inserted.expires_at).toBe(inserted.created_at + 24 * 60 * 60 * 1000);
  });

  it('check() returns null for missing, wrong-purpose, used, or expired tokens', () => {
    expect(tokens.check('', 'password-reset')).toBeNull();
    expect(tokens.check('missing', 'password-reset')).toBeNull();

    const raw = 'reset-token';
    dbMock.findEmailTokenByHash.mockReturnValueOnce({
      id: 1,
      user_id: 7,
      purpose: 'verify-email',
      used_at: null,
      expires_at: Date.now() + 60_000,
    });
    expect(tokens.check(raw, 'password-reset')).toBeNull();

    dbMock.findEmailTokenByHash.mockReturnValueOnce({
      id: 2,
      user_id: 7,
      purpose: 'password-reset',
      used_at: Date.now(),
      expires_at: Date.now() + 60_000,
    });
    expect(tokens.check(raw, 'password-reset')).toBeNull();

    dbMock.findEmailTokenByHash.mockReturnValueOnce({
      id: 3,
      user_id: 7,
      purpose: 'password-reset',
      used_at: null,
      expires_at: Date.now() - 1,
    });
    expect(tokens.check(raw, 'password-reset')).toBeNull();
  });

  it('check() returns id and userId for a valid token without consuming it', () => {
    const raw = 'good-token';
    dbMock.findEmailTokenByHash.mockReturnValueOnce({
      id: 99,
      user_id: 7,
      purpose: 'password-reset',
      used_at: null,
      expires_at: Date.now() + 60_000,
    });

    expect(tokens.check(raw, 'password-reset')).toEqual({ id: 99, userId: 7 });
    expect(dbMock.markEmailTokenUsed).not.toHaveBeenCalled();
  });

  it('consume() marks the token used at the current time', () => {
    tokens.consume(55);
    expect(dbMock.markEmailTokenUsed).toHaveBeenCalledWith(55, Date.now());
  });
});
