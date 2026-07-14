import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

// PUT /api/data replaces the whole record. The web Settings page saves a
// *partial* snapshot (bills/cards/payments/settings only) for things like the
// currency, the timezone, and the bank-import toggles — which used to blow away
// the user's transactions, net-worth accounts, and savings goals.
//
// An absent key must therefore mean "leave it alone". An explicitly-sent []
// still clears the list, so deleting everything continues to work.

describe('integration — PUT /api/data must not drop omitted lists', () => {
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

  async function makeUser() {
    const email = `partial-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const r = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, password: 'partialsave1', loginStartedAt: Date.now() - 5000, captchaToken: 'test',
      }),
    });
    const session = await r.json();
    const cookie = cookieFrom(r.headers.get('set-cookie'));
    const user = ctx.db().findUserByEmail(email);
    ctx.db().setEmailVerified(user.id, Date.now());
    return { email, cookie, csrf: session.csrfToken };
  }

  const put = (u, body) => fetch(`${base}/api/data`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': u.csrf, Cookie: u.cookie },
    body: JSON.stringify(body),
  });

  const get = (u) => fetch(`${base}/api/data`, { headers: { Cookie: u.cookie } }).then((r) => r.json());

  const seeded = {
    bills: [{ id: 'b1', name: 'Gas', amount: 40 }],
    cards: [{ id: 'c1', name: 'Amex', balance: 100 }],
    payments: [{ id: 'p1', type: 'bill', refId: 'b1', amount: 40 }],
    accounts: [{ id: 'a1', name: 'Checking', balance: 500 }],
    goals: [{ id: 'g1', name: 'Trip', target: 1000, saved: 100 }],
    transactions: [{ id: 't1', date: '2026-07-01', amount: 12.5, category: 'Dining' }],
    settings: { income: 3000 },
  };

  it('a settings-only save keeps transactions, accounts, and goals', async () => {
    const u = await makeUser();
    await put(u, seeded);

    // Exactly what the web Settings page sends when you change the currency or
    // flip a bank-import toggle: no transactions/accounts/goals keys at all.
    const res = await put(u, {
      bills: seeded.bills,
      cards: seeded.cards,
      payments: seeded.payments,
      settings: { income: 3000, currency: 'EUR', plaidUpdatePurchases: true },
    });
    expect(res.status).toBe(200);

    const after = await get(u);
    expect(after.settings.currency).toBe('EUR');
    expect(after.settings.plaidUpdatePurchases).toBe(true);
    // The lists the client never mentioned must survive.
    expect(after.transactions).toHaveLength(1);
    expect(after.transactions[0].id).toBe('t1');
    expect(after.accounts).toHaveLength(1);
    expect(after.goals).toHaveLength(1);
    // And the ones it did send are still right.
    expect(after.bills).toHaveLength(1);
    expect(after.cards).toHaveLength(1);
  });

  it('an explicit empty array still clears a list (deleting everything works)', async () => {
    const u = await makeUser();
    await put(u, seeded);

    const res = await put(u, { ...seeded, transactions: [] });
    expect(res.status).toBe(200);

    const after = await get(u);
    expect(after.transactions).toEqual([]);
    // Untouched neighbours stay put.
    expect(after.accounts).toHaveLength(1);
    expect(after.goals).toHaveLength(1);
  });
});
