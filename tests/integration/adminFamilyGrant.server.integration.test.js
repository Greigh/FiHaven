import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

// Admin comp grants must distinguish Family from solo Pro: only `family`
// unlocks a shared household (householdMax >= 1). A plain Pro comp grant
// makes the user Pro but must not let them create a household.

describe('integration — admin comp grants of the Family plan', () => {
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
    const email = `famgrant-${seed}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const r = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'famgrant12!', loginStartedAt: Date.now() - 5000, captchaToken: 'test' }),
    });
    const session = await r.json();
    const cookie = cookieFrom(r.headers.get('set-cookie'));
    const db = ctx.db();
    const user = db.findUserByEmail(email);
    db.setEmailVerified(user.id, Date.now());
    return { id: user.id, email, cookie, csrf: session.csrfToken };
  }

  const post = (path, user, body) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: user.cookie, 'X-CSRF-Token': user.csrf },
      body: JSON.stringify(body || {}),
    });

  async function admin() {
    const a = await makeUser('admin');
    ctx.db().setUserRole(a.id, 'admin');
    return a;
  }

  it('grants Family and unlocks a shared household', async () => {
    const a = await admin();
    const target = await makeUser('target');

    const res = await post(`/api/admin/users/${target.id}/pro`, a, { grant: true, plan: 'family' });
    expect(res.status).toBe(200);
    const { entitlement } = await res.json();
    expect(entitlement.pro).toBe(true);
    expect(entitlement.plan).toBe('family');
    expect(entitlement.householdMax).toBeGreaterThanOrEqual(1);

    const hh = await post('/api/household', target, { name: 'Comped house' });
    expect(hh.status).toBeLessThan(300);
  });

  it('mints a Family promo code that redeems into a shared household', async () => {
    const a = await admin();
    const res = await post('/api/admin/promo', a, { plan: 'family', grantDays: 366, code: `FAM-${Date.now()}` });
    expect(res.status).toBe(201);
    const { promo } = await res.json();
    expect(promo.plan).toBe('family');

    const target = await makeUser('promo-fam');
    const redeem = await post('/api/billing/promo/redeem', target, { code: promo.code });
    expect(redeem.status).toBe(200);
    const { entitlement } = await redeem.json();
    expect(entitlement.plan).toBe('family');
    expect(entitlement.householdMax).toBeGreaterThanOrEqual(1);

    const hh = await post('/api/household', target, { name: 'Promo house' });
    expect(hh.status).toBeLessThan(300);
  });

  it('keeps a plain promo code on solo Pro', async () => {
    const a = await admin();
    const res = await post('/api/admin/promo', a, { grantDays: 30, code: `SOLO-${Date.now()}` });
    const { promo } = await res.json();
    expect(promo.plan).toBe(null);

    const target = await makeUser('promo-solo');
    const redeem = await post('/api/billing/promo/redeem', target, { code: promo.code });
    const { entitlement } = await redeem.json();
    expect(entitlement.pro).toBe(true);
    expect(entitlement.householdMax).toBe(0);
  });

  it('revokes a redeemed promo grant, and the code stays spent', async () => {
    const a = await admin();
    const mint = await post('/api/admin/promo', a, { plan: 'family', grantDays: 366, code: `REV-${Date.now()}` });
    const { promo } = await mint.json();

    const target = await makeUser('promo-revoked');
    const first = await post('/api/billing/promo/redeem', target, { code: promo.code });
    expect((await first.json()).entitlement.plan).toBe('family');

    const revoke = await post(`/api/admin/users/${target.id}/pro`, a, { grant: false });
    const { entitlement } = await revoke.json();
    expect(entitlement.pro).toBe(false);
    expect(entitlement.householdMax).toBe(0);

    // The redemption row survives, so the same code can't be run again.
    const again = await post('/api/billing/promo/redeem', target, { code: promo.code });
    expect(again.status).toBe(409);
    expect((await again.json()).error).toBe('already-redeemed');
  });

  it('leaves a real store subscription alone when revoking', async () => {
    const a = await admin();
    const target = await makeUser('store-sub');
    const now = Date.now();
    ctx.db().upsertSubscription({
      user_id: target.id, platform: 'apple', product_id: 'app.fihaven.pro.yearly',
      txn_id: `store_${target.id}`, status: 'active', expires_at: now + 90 * 86400000,
      environment: 'Production', auto_renew: 1, raw: null, created_at: now, updated_at: now,
    });

    const revoke = await post(`/api/admin/users/${target.id}/pro`, a, { grant: false });
    const { entitlement } = await revoke.json();
    expect(entitlement.pro).toBe(true);
    expect(entitlement.source).toBe('apple');
  });

  it('still offers revoke when a longer store sub hides the comp grant', async () => {
    const a = await admin();
    const target = await makeUser('both');
    const now = Date.now();
    // Store sub outlasts the grant, so it wins the entitlement — the grant
    // behind it must stay visible to the console.
    ctx.db().upsertSubscription({
      user_id: target.id, platform: 'apple', product_id: 'app.fihaven.pro.yearly',
      txn_id: `store_${target.id}`, status: 'active', expires_at: now + 365 * 86400000,
      environment: 'Production', auto_renew: 1, raw: null, created_at: now, updated_at: now,
    });
    await post(`/api/admin/users/${target.id}/pro`, a, { grant: true, plan: 'family', days: 30 });

    const find = async () => {
      const res = await fetch(`${base}/api/admin/users?q=${encodeURIComponent(target.email)}`, { headers: { Cookie: a.cookie } });
      return (await res.json()).users.find((u) => u.id === target.id);
    };

    const before = await find();
    expect(before.proSource).toBe('apple');   // the store sub wins
    expect(before.revocable).toBe(true);      // ...but the grant is still there

    await post(`/api/admin/users/${target.id}/pro`, a, { grant: false });
    const after = await find();
    expect(after.revocable).toBe(false);
    expect(after.pro).toBe(true);             // store sub untouched
    expect(after.proSource).toBe('apple');
  });

  it('rejects an unknown promo plan', async () => {
    const a = await admin();
    const res = await post('/api/admin/promo', a, { plan: 'platinum', grantDays: 30 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad-plan');
  });

  it('grants solo Pro without household sharing', async () => {
    const a = await admin();
    const target = await makeUser('solo');

    const res = await post(`/api/admin/users/${target.id}/pro`, a, { grant: true, plan: 'yearly' });
    const { entitlement } = await res.json();
    expect(entitlement.pro).toBe(true);
    expect(entitlement.plan).toBe('yearly');
    expect(entitlement.householdMax).toBe(0);

    const hh = await post('/api/household', target, { name: 'Nope' });
    expect(hh.status).toBeGreaterThanOrEqual(400);
  });
});
