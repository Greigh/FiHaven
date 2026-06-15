import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

const require = createRequire(import.meta.url);

async function signupVerified(base, db, tokens, label) {
  const email = `${label}-${Date.now()}@test.com`;
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
  const session = await signup.json();
  const cookie = cookieFrom(signup.headers.get('set-cookie'));
  const user = db.findUserByEmail(email);
  const raw = tokens.issue(user.id, 'verify-email');
  await fetch(`${base}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: raw }),
  });
  return { email, cookie, csrfToken: session.csrfToken };
}

describe('integration — auth security (CSRF + bearer)', () => {
  let ctx;
  let base;
  let server;
  let db;
  let tokens;

  beforeAll(async () => {
    ctx = createTestServer();
    ({ base, server } = await listen(ctx.app));
    db = ctx.db();
    tokens = require('../../server/tokens');
  });

  afterAll(() => {
    server?.close();
    ctx?.close();
  });

  it('rejects data writes without a CSRF token for cookie sessions', async () => {
    const { cookie } = await signupVerified(base, db, tokens, 'csrf');

    const put = await fetch(`${base}/api/data`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({ bills: [], cards: [], payments: [], settings: {} }),
    });

    expect(put.status).toBe(403);
    expect(await put.json()).toEqual({ error: 'bad-csrf-token' });
  });

  it('allows native Bearer sessions to PUT data without CSRF', async () => {
    const email = `bearer-${Date.now()}@test.com`;

    const signup = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Mode': 'token',
      },
      body: JSON.stringify({
        email,
        password: 'integration1',
        loginStartedAt: Date.now() - 5000,
        captchaToken: 'test',
      }),
    });
    const session = await signup.json();
    expect(session.token).toBeTruthy();

    const user = db.findUserByEmail(email);
    const raw = tokens.issue(user.id, 'verify-email');
    await fetch(`${base}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: raw }),
    });

    const payload = {
      bills: [{ id: 'b1', name: 'Phone', amount: 80, dueDay: 10, frequency: 'Monthly' }],
      cards: [],
      payments: [],
      settings: { income: 4000 },
    };

    const put = await fetch(`${base}/api/data`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify(payload),
    });
    expect(put.status).toBe(200);

    const get = await fetch(`${base}/api/data`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    expect(get.status).toBe(200);
    const data = await get.json();
    expect(data.bills[0].name).toBe('Phone');
  });

  it('resets a password with a single-use emailed token', async () => {
    const email = `reset-${Date.now()}@test.com`;

    await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'oldpassword1',
        loginStartedAt: Date.now() - 5000,
        captchaToken: 'test',
      }),
    });

    const user = db.findUserByEmail(email);
    const raw = tokens.issue(user.id, 'password-reset');

    const reset = await fetch(`${base}/api/auth/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: raw, password: 'newpassword1' }),
    });
    expect(reset.status).toBe(200);

    const badLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'oldpassword1',
        loginStartedAt: Date.now() - 5000,
        captchaToken: 'test',
      }),
    });
    expect(badLogin.status).toBe(401);

    const goodLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'newpassword1',
        loginStartedAt: Date.now() - 5000,
        captchaToken: 'test',
      }),
    });
    expect(goodLogin.status).toBe(200);
  });
});
