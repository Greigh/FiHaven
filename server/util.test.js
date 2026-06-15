import { describe, it, expect } from 'vitest';
import {
  MIN_PASSWORD,
  MAX_PASSWORD,
  BCRYPT_COST,
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
    expect(BCRYPT_COST).toBe(12);
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
