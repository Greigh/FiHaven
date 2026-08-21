import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

// GET /api/account/export is offered on all three clients as the account's
// full backup — "All data (JSON)" on the web, "Export data" on iOS and
// Android. It carried only bills/cards/payments/settings, so net-worth
// accounts, savings goals, and imported bank transactions were silently
// absent, and the Settings page's JSON restore could not bring back what the
// file never held.

describe('integration — the JSON export is the whole account', () => {
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
    const email = `export-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const r = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, password: 'exportbackup1!', loginStartedAt: Date.now() - 5000, captchaToken: 'test',
      }),
    });
    const session = await r.json();
    const cookie = cookieFrom(r.headers.get('set-cookie'));
    const user = ctx.db().findUserByEmail(email);
    ctx.db().setEmailVerified(user.id, Date.now());
    return { cookie, csrf: session.csrfToken };
  }

  const seeded = {
    bills: [{ id: 'b1', name: 'Gas', amount: 40 }],
    cards: [{ id: 'c1', name: 'Amex', balance: 100 }],
    payments: [{ id: 'p1', type: 'bill', refId: 'b1', amount: 40 }],
    accounts: [{ id: 'a1', name: 'Checking', balance: 500 }],
    goals: [{ id: 'g1', name: 'Trip', target: 1000, saved: 100 }],
    transactions: [{ id: 't1', date: '2026-07-01', amount: 12.5, category: 'Dining' }],
    settings: { income: 3000, currency: 'USD' },
  };

  it('carries every list the account holds, not just bills/cards/payments', async () => {
    const u = await makeUser();
    await fetch(`${base}/api/data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': u.csrf, Cookie: u.cookie },
      body: JSON.stringify(seeded),
    });

    const res = await fetch(`${base}/api/account/export`, { headers: { Cookie: u.cookie } });
    expect(res.ok).toBe(true);
    const backup = await res.json();

    expect(backup.bills).toEqual(seeded.bills);
    expect(backup.cards).toEqual(seeded.cards);
    expect(backup.payments).toEqual(seeded.payments);
    expect(backup.accounts).toEqual(seeded.accounts);
    expect(backup.goals).toEqual(seeded.goals);
    expect(backup.transactions).toEqual(seeded.transactions);
    expect(backup.settings).toMatchObject(seeded.settings);
  });

  it('round-trips: restoring the file into an empty account rebuilds it', async () => {
    const source = await makeUser();
    await fetch(`${base}/api/data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': source.csrf, Cookie: source.cookie },
      body: JSON.stringify(seeded),
    });
    const backup = await fetch(`${base}/api/account/export`, {
      headers: { Cookie: source.cookie },
    }).then((r) => r.json());

    // A second account restores from that file the way the Settings importer
    // does — the parsed lists, straight back through PUT /api/data.
    const target = await makeUser();
    await fetch(`${base}/api/data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': target.csrf, Cookie: target.cookie },
      body: JSON.stringify({
        bills: backup.bills,
        cards: backup.cards,
        payments: backup.payments,
        accounts: backup.accounts,
        goals: backup.goals,
        transactions: backup.transactions,
        settings: backup.settings,
      }),
    });

    const restored = await fetch(`${base}/api/data`, {
      headers: { Cookie: target.cookie },
    }).then((r) => r.json());

    expect(restored.accounts).toEqual(seeded.accounts);
    expect(restored.goals).toEqual(seeded.goals);
    expect(restored.transactions).toEqual(seeded.transactions);
  });
});
