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

describe('oauthHandoff', () => {
  const prevOrigin = process.env.PUBLIC_ORIGIN;
  const store = new Map();
  const dbMock = {
    deleteExpiredOAuthHandoffs: vi.fn(() => 0),
    insertOAuthHandoff: vi.fn((row) => {
      store.set(row.code_hash, { ...row, used_at: null });
    }),
    findOAuthHandoffByHash: vi.fn((hash) => store.get(hash) || undefined),
    markOAuthHandoffUsed: vi.fn((hash, ts) => {
      const row = store.get(hash);
      if (!row || row.used_at) return 0;
      row.used_at = ts;
      return 1;
    }),
  };
  let oauthHandoff;

  beforeEach(() => {
    store.clear();
    Object.values(dbMock).forEach((fn) => fn.mockClear());
    clearModule('./oauthHandoff');
    clearModule('./db');
    stubModule('./db', dbMock);
    process.env.PUBLIC_ORIGIN = 'https://fihaven.app';
    oauthHandoff = require('./oauthHandoff');
  });

  afterEach(() => {
    if (prevOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = prevOrigin;
    clearModule('./oauthHandoff');
    clearModule('./db');
  });

  it('returns a Custom-Tab-safe fihaven:// URL with a one-time code (no idToken)', () => {
    const code = oauthHandoff.create({
      provider: 'apple',
      idToken: 'fake.jwt.token',
      name: 'Ada',
      state: 's1',
    });
    expect(code).toMatch(/^[a-f0-9]{64}$/);
    const url = oauthHandoff.appReturnUrl('apple', { code, state: 's1' });
    expect(url).toBe(`fihaven://oauth/apple?code=${code}&state=s1`);
    expect(url).not.toContain('idToken');
    expect(oauthHandoff.httpsReturnUrl('apple', { code, state: 's1' }))
      .toBe(`https://fihaven.app/oauth/apple?code=${code}&state=s1`);
    expect(dbMock.insertOAuthHandoff).toHaveBeenCalledOnce();
  });

  it('consumes a handoff once and rejects reuse / bad state', () => {
    const code = oauthHandoff.create({
      provider: 'google',
      idToken: 'google.jwt',
      state: 'csrf',
    });
    const first = oauthHandoff.consume({ provider: 'google', code, state: 'csrf' });
    expect(first).toEqual({ idToken: 'google.jwt', name: null, state: 'csrf' });

    expect(() => oauthHandoff.consume({ provider: 'google', code, state: 'csrf' }))
      .toThrow(/handoff-used/);

    const code2 = oauthHandoff.create({
      provider: 'google',
      idToken: 'google.jwt.2',
      state: 'csrf',
    });
    expect(() => oauthHandoff.consume({ provider: 'google', code: code2, state: 'wrong' }))
      .toThrow(/handoff-mismatch/);
  });

  it('rejects provider mismatch and expired / missing codes', () => {
    const code = oauthHandoff.create({
      provider: 'apple',
      idToken: 'apple.jwt',
      state: 's',
    });
    expect(() => oauthHandoff.consume({ provider: 'google', code, state: 's' }))
      .toThrow(/handoff-mismatch/);

    expect(() => oauthHandoff.consume({ provider: 'apple', code: 'deadbeef', state: 's' }))
      .toThrow(/handoff-invalid/);

    expect(() => oauthHandoff.create({ provider: 'apple', idToken: '' }))
      .toThrow(/missing-id-token/);

    // Expire by rewriting the stored row's expires_at.
    const code3 = oauthHandoff.create({
      provider: 'apple',
      idToken: 'apple.jwt.3',
      state: 's',
    });
    const row = [...store.values()].find((r) => r.id_token === 'apple.jwt.3');
    expect(row).toBeTruthy();
    row.expires_at = Date.now() - 1;
    expect(() => oauthHandoff.consume({ provider: 'apple', code: code3, state: 's' }))
      .toThrow(/handoff-expired/);
  });

  it('always uses the custom scheme for Custom Tab returns', () => {
    delete process.env.PUBLIC_ORIGIN;
    const url = oauthHandoff.appReturnUrl('apple', { code: 'abc', state: 's' });
    expect(url).toBe('fihaven://oauth/apple?code=abc&state=s');
    expect(oauthHandoff.httpsReturnUrl('apple', { code: 'abc', state: 's' })).toBeNull();
  });
});
