import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

// Two claims the UI now makes, pinned end-to-end:
//   1. Only the Family plan can create a household. Solo Pro cannot — the
//      paywall says so, so the server had better agree.
//   2. A Stripe Checkout Session always *creates* a subscription, so someone
//      who already has one (solo Pro upgrading to Family) must be refused and
//      sent to the Billing Portal instead. Otherwise they pay for both.

describe('integration — plan gating + checkout safety', () => {
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

  async function makeUser(seed) {
    const email = `bp-${seed}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const r = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'billingplan1', loginStartedAt: Date.now() - 5000, captchaToken: 'test' }),
    });
    const session = await r.json();
    const cookie = cookieFrom(r.headers.get('set-cookie'));
    const db = ctx.db();
    const user = db.findUserByEmail(email);
    db.setEmailVerified(user.id, Date.now());
    return { id: user.id, email, cookie, csrf: session.csrfToken };
  }

  // `platform` matters: the checkout guard only blocks an existing *Stripe*
  // subscription, since that's the rail a Checkout Session would duplicate.
  function grantPlan(userId, productId, platform = 'comp') {
    const db = ctx.db();
    const now = Date.now();
    db.upsertSubscription({
      user_id: userId, platform, product_id: productId, txn_id: `${platform}_${userId}_${Math.random()}`,
      status: 'active', expires_at: now + 365 * 86400000, environment: 'Test',
      auto_renew: 1, raw: null, created_at: now, updated_at: now,
    });
  }

  const J = (u, method, body) => ({
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': u.csrf, Cookie: u.cookie },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  it('solo Pro cannot create a household; Family can', async () => {
    const solo = await makeUser('solo');
    grantPlan(solo.id, 'app.fihaven.pro.yearly');

    // Entitled to Pro...
    const status = await fetch(`${base}/api/household`, J(solo, 'GET')).then((r) => r.json());
    expect(status.canCreate).toBe(false);
    expect(status.memberMax).toBe(0);

    // ...but creating is Family-only.
    const denied = await fetch(`${base}/api/household`, J(solo, 'POST', { name: 'Nope' }));
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe('pro-required');

    const fam = await makeUser('fam');
    grantPlan(fam.id, 'app.fihaven.pro.family');
    const famStatus = await fetch(`${base}/api/household`, J(fam, 'GET')).then((r) => r.json());
    expect(famStatus.canCreate).toBe(true);
    expect(famStatus.memberMax).toBe(3);

    const ok = await fetch(`${base}/api/household`, J(fam, 'POST', { name: 'Ours' }));
    expect(ok.status).toBe(200);
  });

  it('monthly Pro is also denied — it is the plan, not the pro flag', async () => {
    const u = await makeUser('monthly');
    grantPlan(u.id, 'app.fihaven.pro.monthly');
    const denied = await fetch(`${base}/api/household`, J(u, 'POST', { name: 'Nope' }));
    expect(denied.status).toBe(403);
  });

  it('refuses a second Stripe checkout for an existing Stripe subscriber', async () => {
    const u = await makeUser('checkout');

    // Stripe isn't configured under NODE_ENV=test, so this takes the dev-grant
    // path — which records a real `platform: 'stripe'` subscription row.
    const first = await fetch(`${base}/api/billing/stripe/checkout`, J(u, 'POST', { plan: 'yearly' }));
    expect(first.status).toBe(200);
    expect((await first.json()).devGranted).toBe(true);

    const second = await fetch(`${base}/api/billing/stripe/checkout`, J(u, 'POST', { plan: 'family' }));
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe('already-subscribed');
  });

  it('an Apple/comp subscriber is not blocked from Stripe checkout', async () => {
    // Deliberate: the guard exists to stop a *duplicate Stripe* subscription.
    // Cross-store is a different concern, handled by hiding the plan rows.
    const u = await makeUser('apple');
    grantPlan(u.id, 'app.fihaven.pro.monthly', 'apple');
    const res = await fetch(`${base}/api/billing/stripe/checkout`, J(u, 'POST', { plan: 'yearly' }));
    expect(res.status).toBe(200);
  });

  it('still rejects an unknown plan', async () => {
    const u = await makeUser('unknown');
    const res = await fetch(`${base}/api/billing/stripe/checkout`, J(u, 'POST', { plan: 'nonsense' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('unknown-plan');
  });
});
