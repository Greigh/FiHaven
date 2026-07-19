import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import appleJws from './appleJws.js';
import { assertProductionSafe } from './securityConfig.js';

describe('appleJws', () => {
  beforeEach(() => appleJws._resetCache());

  it('loads Apple Root CA - G3 with the expected fingerprint', () => {
    const roots = appleJws._loadRootCerts();
    expect(roots.length).toBeGreaterThanOrEqual(1);
    const fp = roots[0].fingerprint256.replace(/:/g, '').toLowerCase();
    expect(fp).toBe(appleJws.APPLE_ROOT_SHA256);
  });

  it('decodePayloadUnsafe reads claims without verifying', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'ES256' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ productId: 'x', originalTransactionId: '1' })).toString('base64url');
    const jws = `${header}.${payload}.fakesig`;
    expect(appleJws.decodePayloadUnsafe(jws)).toEqual({
      productId: 'x',
      originalTransactionId: '1',
    });
  });

  it('verifyAndDecode rejects forged payloads missing a trusted x5c chain', () => {
    // Self-signed ES256 JWT — must not verify as Apple.
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      productId: 'app.fihaven.pro.monthly',
      originalTransactionId: 'forged',
      expiresDate: Date.now() + 86400000,
    })).toString('base64url');
    const data = `${header}.${payload}`;
    const sig = crypto.sign(undefined, Buffer.from(data), { key: privateKey, dsaEncoding: 'ieee-p1363' });
    const jws = `${data}.${sig.toString('base64url')}`;
    expect(() => appleJws.verifyAndDecode(jws)).toThrow();
    // Public key unused but proves we could have signed locally.
    expect(publicKey.type).toBe('public');
  });

  it('verifyAndDecode rejects missing x5c even with ES256 header', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'ES256' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ productId: 'x' })).toString('base64url');
    expect(() => appleJws.verifyAndDecode(`${header}.${payload}.aa`)).toThrow(/missing-x5c|malformed/);
  });
});

describe('securityConfig.assertProductionSafe', () => {
  const prev = { ...process.env };

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in prev)) delete process.env[k];
    }
    Object.assign(process.env, prev);
  });

  it('is a no-op outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.PUBLIC_ORIGIN;
    expect(() => assertProductionSafe()).not.toThrow();
  });

  it('requires https PUBLIC_ORIGIN in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PUBLIC_ORIGIN;
    process.env.IAP_VERIFY_MODE = 'production';
    process.env.OAUTH_VERIFY_MODE = 'production';
    expect(() => assertProductionSafe()).toThrow(/PUBLIC_ORIGIN/);
  });

  it('rejects dev-trust modes in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = 'https://fihaven.app';
    process.env.IAP_VERIFY_MODE = 'dev-trust';
    process.env.OAUTH_VERIFY_MODE = 'production';
    expect(() => assertProductionSafe()).toThrow(/IAP_VERIFY_MODE/);
  });

  it('passes a sane production config', () => {
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_ORIGIN = 'https://fihaven.app';
    process.env.IAP_VERIFY_MODE = 'production';
    process.env.OAUTH_VERIFY_MODE = 'production';
    delete process.env.DISABLE_RATE_LIMIT;
    expect(() => assertProductionSafe()).not.toThrow();
  });
});
