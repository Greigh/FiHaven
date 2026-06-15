import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const serverDir = path.dirname(fileURLToPath(import.meta.url));

function clearModule(modulePath) {
  try {
    delete require.cache[require.resolve(modulePath, { paths: [serverDir] })];
  } catch (_) {
    /* not loaded yet */
  }
}

describe('captcha.js', () => {
  let captcha;
  const fetchMock = vi.fn();

  beforeEach(() => {
    clearModule('./captcha');
    process.env.TURNSTILE_SECRET = 'test-secret';
    global.fetch = fetchMock;
    fetchMock.mockReset();
    captcha = require('./captcha');
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('rejects a missing token', async () => {
    await expect(captcha.verifyCaptcha('', '127.0.0.1')).resolves.toEqual({
      ok: false,
      reason: 'missing-captcha',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the token to Turnstile and returns success', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ success: true }),
    });

    const result = await captcha.verifyCaptcha('client-token', '203.0.113.1');

    expect(result).toEqual({ ok: true, reason: '' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(String(opts.body)).toContain('secret=test-secret');
    expect(String(opts.body)).toContain('response=client-token');
    expect(String(opts.body)).toContain('remoteip=203.0.113.1');
  });

  it('returns error codes from Turnstile on failure', async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
    });

    await expect(captcha.verifyCaptcha('bad', null)).resolves.toEqual({
      ok: false,
      reason: 'timeout-or-duplicate',
    });
  });

  it('handles unreachable Turnstile endpoints', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    await expect(captcha.verifyCaptcha('token')).resolves.toEqual({
      ok: false,
      reason: 'captcha-unreachable',
    });
  });
});
