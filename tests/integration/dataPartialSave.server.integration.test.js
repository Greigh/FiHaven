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
        email, password: 'partialsave1!', loginStartedAt: Date.now() - 5000, captchaToken: 'test',
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

  // `plaidBalanceProposals` is written by Plaid sync, not by any client. A
  // client saving a snapshot taken before the last sync must not empty the
  // review queue — that left the Accept buttons missing until the next
  // unthrottled sync, up to an hour later.
  it('a stale settings save cannot wipe the bank balance review queue', async () => {
    const u = await makeUser();
    await put(u, { ...seeded, settings: { plaidUpdateBalances: true } });

    // Stand in for a sync: the server writes proposals straight to the record.
    const proposals = [
      { id: 'c1', proposedCurrent: 120, fingerprint: 'c1:120.00:' },
      { id: 'c2', proposedCurrent: 80, fingerprint: 'c2:80.00:' },
    ];
    const user = ctx.db().findUserByEmail(u.email);
    const stored = ctx.db().getUserData(user.id);
    stored.settings.plaidBalanceProposals = proposals;
    ctx.db().upsertUserData(user.id, stored);

    // A client that loaded before the sync: no proposals in its snapshot.
    await put(u, { ...seeded, settings: { plaidUpdateBalances: true, currency: 'EUR' } });
    let after = await get(u);
    expect(after.settings.plaidBalanceProposals).toHaveLength(2);
    expect(after.settings.currency).toBe('EUR');

    // Accepting one resolves it, and only that one leaves the queue.
    await put(u, {
      ...seeded,
      settings: {
        plaidUpdateBalances: true,
        plaidBalanceResolved: [{ fingerprint: 'c1:120.00:', decision: 'accept' }],
      },
    });
    after = await get(u);
    expect(after.settings.plaidBalanceProposals.map((p) => p.id)).toEqual(['c2']);

    // Opting out of balance suggestions empties it.
    await put(u, { ...seeded, settings: { plaidUpdateBalances: false } });
    after = await get(u);
    expect(after.settings.plaidBalanceProposals).toEqual([]);
  });

  // The Balances tab's asset accounts run a SECOND queue, `plaidAccountProposals`,
  // under its own settings key. It was left unprotected while the cards' queue
  // was kept, so every client save erased it and the tab's "Bank sync review"
  // panel was empty essentially always — bank balances never reached an account.
  // These keys are the server's to write. Skipping the ones whose server copy
  // was empty left whatever the client sent in place, so a client could invent
  // proposals for itself — its own account only, but nothing downstream expects
  // a client-authored one.
  it('a client cannot invent proposals the server never wrote', async () => {
    const u = await makeUser();
    await put(u, { ...seeded, settings: { plaidUpdateBalances: true } });

    await put(u, {
      ...seeded,
      settings: {
        plaidUpdateBalances: true,
        plaidBalanceProposals: [{ id: 'fake', proposedCurrent: 1, fingerprint: 'fake:1.00:' }],
        plaidAccountProposals: [{ id: 'fake2', proposedBalance: 2, fingerprint: 'acct:fake2:2.00' }],
      },
    });
    const after = await get(u);
    expect(after.settings.plaidBalanceProposals).toEqual([]);
    expect(after.settings.plaidAccountProposals).toEqual([]);
  });

  it('a stale settings save cannot wipe the asset-account review queue', async () => {
    const u = await makeUser();
    await put(u, { ...seeded, settings: { plaidUpdateBalances: true } });

    // Stand in for a sync writing BOTH queues, as refreshBalanceProposals does.
    const user = ctx.db().findUserByEmail(u.email);
    const stored = ctx.db().getUserData(user.id);
    stored.settings.plaidBalanceProposals = [
      { id: 'c1', proposedCurrent: 120, fingerprint: 'c1:120.00:' },
    ];
    stored.settings.plaidAccountProposals = [
      { id: 'a1', proposedBalance: 640.25, fingerprint: 'acct:a1:640.25' },
      { id: 'a2', proposedBalance: 12000, fingerprint: 'acct:a2:12000.00' },
    ];
    ctx.db().upsertUserData(user.id, stored);

    // A client that loaded before the sync: neither queue in its snapshot.
    await put(u, { ...seeded, settings: { plaidUpdateBalances: true, currency: 'EUR' } });
    let after = await get(u);
    expect(after.settings.plaidAccountProposals).toHaveLength(2);
    // The cards' queue must not regress while the accounts' one is fixed.
    expect(after.settings.plaidBalanceProposals).toHaveLength(1);

    // Both queues share one resolved list, and an account decision must retire
    // only its own proposal.
    await put(u, {
      ...seeded,
      settings: {
        plaidUpdateBalances: true,
        plaidBalanceResolved: [{ fingerprint: 'acct:a1:640.25', decision: 'accept' }],
      },
    });
    after = await get(u);
    expect(after.settings.plaidAccountProposals.map((p) => p.id)).toEqual(['a2']);
    expect(after.settings.plaidBalanceProposals.map((p) => p.id)).toEqual(['c1']);

    // Opting out empties both.
    await put(u, { ...seeded, settings: { plaidUpdateBalances: false } });
    after = await get(u);
    expect(after.settings.plaidAccountProposals).toEqual([]);
    expect(after.settings.plaidBalanceProposals).toEqual([]);
  });

  // An empty cards' queue must not short-circuit the accounts' one — the old
  // code returned early on `!server.length` before it ever looked further.
  it('keeps the account queue when the card queue is empty', async () => {
    const u = await makeUser();
    await put(u, { ...seeded, settings: { plaidUpdateBalances: true } });

    const user = ctx.db().findUserByEmail(u.email);
    const stored = ctx.db().getUserData(user.id);
    stored.settings.plaidAccountProposals = [
      { id: 'a1', proposedBalance: 640.25, fingerprint: 'acct:a1:640.25' },
    ];
    ctx.db().upsertUserData(user.id, stored);

    await put(u, { ...seeded, settings: { plaidUpdateBalances: true, currency: 'EUR' } });
    const after = await get(u);
    expect(after.settings.plaidAccountProposals).toHaveLength(1);
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
