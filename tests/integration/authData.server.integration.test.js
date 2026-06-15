import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

describe('integration — auth signup and data sync', () => {
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

  it('signs up, verifies email, saves data, and reads it back', async () => {
    const email = `integration-${Date.now()}@test.com`;
    const password = 'integration1';

    const signup = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        loginStartedAt: Date.now() - 5000,
        captchaToken: 'test',
      }),
    });

    expect(signup.status).toBe(201);
    const session = await signup.json();
    const cookie = cookieFrom(signup.headers.get('set-cookie'));
    expect(session.csrfToken).toBeTruthy();

    const db = ctx.db();
    const user = db.findUserByEmail(email);
    db.setEmailVerified(user.id, Date.now());

    const payload = {
      bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 1, frequency: 'Monthly' }],
      cards: [{ id: 'c1', name: 'Visa', balance: 500, minPayment: 25, dueDay: 20 }],
      payments: [{ id: 'p1', type: 'bill', refId: 'b1', amount: 1500, date: '2026-06-01', monthKey: '2026-06' }],
      settings: { income: 5000, billReminders: true, timezone: 'America/New_York' },
    };

    const put = await fetch(`${base}/api/data`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': session.csrfToken,
        Cookie: cookie,
      },
      body: JSON.stringify(payload),
    });
    expect(put.status).toBe(200);

    const get = await fetch(`${base}/api/data`, {
      headers: { Cookie: cookie },
    });
    expect(get.status).toBe(200);
    const data = await get.json();
    expect(data.email).toBe(email);
    expect(data.bills[0].name).toBe('Rent');
    expect(data.cards[0].name).toBe('Visa');
    expect(data.payments[0].amount).toBe(1500);
    expect(data.settings.income).toBe(5000);
    expect(data.entitlement).toBeTruthy();
  });

  it('rejects unverified sessions from the data API', async () => {
    const email = `unverified-${Date.now()}@test.com`;

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

    const get = await fetch(`${base}/api/data`, { headers: { Cookie: cookie } });
    expect(get.status).toBe(403);
    expect(await get.json()).toEqual({ error: 'email-unverified' });
    expect(session.user.emailVerified).toBe(false);
  });
});
