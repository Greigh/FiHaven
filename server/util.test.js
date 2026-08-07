import { describe, it, expect, vi } from 'vitest';
import {
  MIN_PASSWORD,
  MAX_PASSWORD,
  BCRYPT_COST,
  ACTIVE_BCRYPT_COST,
  normalizeEmail,
  isValidEmail,
  checkPasswordPolicy,
  sendError,
} from './util';

describe('util — email helpers', () => {
  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
    expect(normalizeEmail(null)).toBe('');
  });

  it('isValidEmail accepts common addresses and rejects junk', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('@missing.local')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('a'.repeat(250) + '@x.com')).toBe(false);
  });
});

describe('util — checkPasswordPolicy', () => {
  it('accepts a strong password', () => {
    expect(checkPasswordPolicy('correcthorse1', 'user@example.com')).toBeNull();
  });

  it('rejects passwords that are too short or too long', () => {
    expect(checkPasswordPolicy('short1', 'user@example.com')).toBe('weak-password');
    expect(checkPasswordPolicy('a'.repeat(MAX_PASSWORD + 1) + '1', 'user@example.com')).toBe('weak-password');
  });

  it('requires letters and numbers', () => {
    expect(checkPasswordPolicy('alllettersonly', 'user@example.com')).toBe('weak-password');
    expect(checkPasswordPolicy('1234567890', 'user@example.com')).toBe('weak-password');
  });

  it('rejects a password that matches the email local part', () => {
    expect(checkPasswordPolicy('user123456', 'user123456@example.com')).toBe('weak-password');
  });

  it('exports password constants', () => {
    expect(MIN_PASSWORD).toBe(10);
    expect(MAX_PASSWORD).toBe(128);
    // The shipped cost. Nothing may lower this — it is the KDF's strength.
    expect(BCRYPT_COST).toBe(12);
  });

  // Hashing runs at a reduced cost under test (see util.js) because cost 12 is
  // ~197ms of *blocking* CPU per hash, and the integration suite pays it on
  // every file import and every signup. The escape hatch takes BOTH the
  // runner's own VITEST marker and NODE_ENV, so it cannot be reached in
  // production — `NODE_ENV=test` is far too easy to set by accident for it to
  // be the only thing standing between a deployment and a cost-4 password.
  it('reduces the hashing cost only inside a real test run', async () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.VITEST).toBe('true');
    expect(ACTIVE_BCRYPT_COST).toBe(4);

    const costWith = async (env) => {
      const prev = { VITEST: process.env.VITEST, NODE_ENV: process.env.NODE_ENV };
      for (const [k, v] of Object.entries(env)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      vi.resetModules();
      try {
        return (await import('./util')).ACTIVE_BCRYPT_COST;
      } finally {
        Object.assign(process.env, prev);
        vi.resetModules();
      }
    };

    expect(await costWith({ NODE_ENV: 'production' })).toBe(BCRYPT_COST);
    expect(await costWith({ NODE_ENV: 'development' })).toBe(BCRYPT_COST);
    expect(await costWith({ NODE_ENV: undefined })).toBe(BCRYPT_COST);
    // The case that matters: a stray NODE_ENV=test on a real server, with no
    // test runner anywhere. The KDF must not weaken.
    expect(await costWith({ VITEST: undefined })).toBe(BCRYPT_COST);
    expect(await costWith({ VITEST: 'false' })).toBe(BCRYPT_COST);
  });
});

describe('util — sendError', () => {
  it('returns a JSON error response with the given status', () => {
    const res = {
      status: (code) => ({
        json: (body) => ({ status: code, body }),
      }),
    };
    const out = sendError(res, 400, 'invalid-input');
    expect(out.status).toBe(400);
    expect(out.body).toEqual({ error: 'invalid-input' });
  });
});
