import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

const require = createRequire(import.meta.url);

describe('integration — email verification token flow', () => {
  let ctx;
  let base;
  let server;

  beforeAll(async () => {
    ctx = createTestServer();
    ({ base, server } = await listen(ctx.app));
  });

  afterAll(() => {
    server?.close();
    ctx?.close();
  });

  it('verifies email via token and unlocks the data API', async () => {
    const email = `verify-${Date.now()}@test.com`;
    const db = ctx.db();
    const tokens = require('../../server/tokens');

    const signup = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'integration1',
        loginStartedAt: Date.now() - 5000,
        captchaToken: 'test',
      }),
    });
    expect(signup.status).toBe(201);
    const cookie = cookieFrom(signup.headers.get('set-cookie'));

    const blocked = await fetch(`${base}/api/data`, { headers: { Cookie: cookie } });
    expect(blocked.status).toBe(403);

    const user = db.findUserByEmail(email);
    const raw = tokens.issue(user.id, 'verify-email');

    const verify = await fetch(`${base}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: raw }),
    });
    expect(verify.status).toBe(200);
    expect(await verify.json()).toEqual({ ok: true });

    const get = await fetch(`${base}/api/data`, { headers: { Cookie: cookie } });
    expect(get.status).toBe(200);
    expect((await get.json()).email).toBe(email);
  });

  it('rejects replayed verification tokens', async () => {
    const email = `replay-${Date.now()}@test.com`;
    const db = ctx.db();
    const tokens = require('../../server/tokens');

    await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'integration1',
        loginStartedAt: Date.now() - 5000,
        captchaToken: 'test',
      }),
    });

    const user = db.findUserByEmail(email);
    const raw = tokens.issue(user.id, 'verify-email');

    const first = await fetch(`${base}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: raw }),
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${base}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: raw }),
    });
    expect(second.status).toBe(400);
    expect(await second.json()).toEqual({ error: 'invalid-token' });
  });
});
