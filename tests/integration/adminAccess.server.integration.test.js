import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

// The native apps now call /api/admin/* directly, so the server-side lock is
// the only thing standing between a normal account and the console. These
// cover both halves of it: the role gate on every route, and the `role` field
// the clients read to decide whether to offer the console at all.

describe('integration — admin console access', () => {
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

  async function signup(seed) {
    const email = `admin-access-${seed}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const r = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'adminaccess1!', loginStartedAt: Date.now() - 5000, captchaToken: 'test' }),
    });
    const body = await r.json();
    const db = ctx.db();
    const user = db.findUserByEmail(email);
    db.setEmailVerified(user.id, Date.now());
    return {
      id: user.id,
      email,
      cookie: cookieFrom(r.headers.get('set-cookie')),
      csrf: body.csrfToken,
      signupBody: body,
    };
  }

  const call = (path, user, method = 'GET', body) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(user ? { Cookie: user.cookie, 'X-CSRF-Token': user.csrf } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  // Every route the native console can reach.
  const ROUTES = [
    ['GET', '/api/admin/users'],
    ['GET', '/api/admin/promo'],
    ['GET', '/api/admin/card-presets'],
    ['POST', '/api/admin/promo'],
    ['POST', '/api/admin/users/1/role'],
    ['POST', '/api/admin/users/1/pro'],
    ['POST', '/api/admin/users/1/suspend'],
    ['POST', '/api/admin/users/1/logout'],
    ['POST', '/api/admin/users/1/delete'],
    ['POST', '/api/admin/card-presets'],
  ];

  it('refuses every admin route for a signed-in non-admin', async () => {
    const user = await signup('plain');
    for (const [method, path] of ROUTES) {
      const r = await call(path, user, method, method === 'POST' ? {} : undefined);
      expect({ path, status: r.status }).toEqual({ path, status: 403 });
      expect((await r.json()).error).toBe('forbidden');
    }
  });

  it('refuses every admin route for an anonymous caller', async () => {
    for (const [method, path] of ROUTES) {
      const r = await call(path, null, method, method === 'POST' ? {} : undefined);
      expect({ path, status: r.status }).toEqual({ path, status: 401 });
    }
  });

  it('opens up once the server promotes the account', async () => {
    const user = await signup('promoted');
    expect((await call('/api/admin/users', user)).status).toBe(403);

    ctx.db().setUserRole(user.id, 'admin');

    const r = await call('/api/admin/users', user);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(Array.isArray(body.users)).toBe(true);
    // The plan list drives the native grant picker.
    expect(body.plans.length).toBeGreaterThan(0);
  });

  it('tells the client its role on sign-in and on /me', async () => {
    const user = await signup('role-field');
    // Straight from signup, before any refresh.
    expect(user.signupBody.user.role).toBe('user');

    ctx.db().setUserRole(user.id, 'admin');
    const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: user.cookie } }).then((r) => r.json());
    expect(me.user.role).toBe('admin');

    // And on a fresh login, which is what a native client stores at sign-in.
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        password: 'adminaccess1!',
        loginStartedAt: Date.now() - 5000,
        captchaToken: 'test',
      }),
    }).then((r) => r.json());
    expect(login.user.role).toBe('admin');
  });

  it('lets an admin drive the console end to end', async () => {
    const admin = await signup('operator');
    const target = await signup('subject');
    ctx.db().setUserRole(admin.id, 'admin');

    // Grant, then confirm the row reports Pro.
    const grant = await call(`/api/admin/users/${target.id}/pro`, admin, 'POST', { grant: true, plan: 'monthly' });
    expect(grant.status).toBe(200);
    expect((await grant.json()).entitlement.pro).toBe(true);

    const found = await call(`/api/admin/users?q=${encodeURIComponent(target.email)}`, admin)
      .then((r) => r.json())
      .then((b) => b.users.find((u) => u.id === target.id));
    expect(found.pro).toBe(true);
    expect(found.revocable).toBe(true);

    // Suspend, force-logout, then revoke.
    expect((await call(`/api/admin/users/${target.id}/suspend`, admin, 'POST', { suspend: true, reason: 'testing' })).status).toBe(200);
    const kicked = await call(`/api/admin/users/${target.id}/logout`, admin, 'POST', {});
    expect(kicked.status).toBe(200);
    // The target's session really is gone.
    const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: target.cookie } }).then((r) => r.json());
    expect(me.user).toBeFalsy();

    const revoke = await call(`/api/admin/users/${target.id}/pro`, admin, 'POST', { grant: false });
    expect((await revoke.json()).entitlement.pro).toBe(false);

    // A promo code round-trip, the way the native Promos tab does it.
    const promo = await call('/api/admin/promo', admin, 'POST', { plan: 'monthly', grantDays: 30, note: 'native test' })
      .then((r) => r.json());
    expect(promo.promo.code).toBeTruthy();
    expect(promo.promo.redeemable).toBe(true);
    const listed = await call('/api/admin/promo', admin).then((r) => r.json());
    expect(listed.promos.some((p) => p.code === promo.promo.code)).toBe(true);

    const off = await call(`/api/admin/promo/${promo.promo.code}/deactivate`, admin, 'POST', {});
    expect(off.status).toBe(200);
    // The listing is active-only (server/db.js listPromoCodes), so a
    // deactivated code drops out rather than showing as inactive.
    const after = await call('/api/admin/promo', admin).then((r) => r.json());
    expect(after.promos.some((p) => p.code === promo.promo.code)).toBe(false);
  });

  it('will not let an admin demote themselves out of the console', async () => {
    const admin = await signup('self-demote');
    ctx.db().setUserRole(admin.id, 'admin');

    const r = await call(`/api/admin/users/${admin.id}/role`, admin, 'POST', { role: 'user' });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('cannot-demote-self');
    expect((await call('/api/admin/users', admin)).status).toBe(200);
  });
});
