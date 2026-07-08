import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

// The `admin` flag on /api/data and /api/billing/status is what authorizes the
// client-side dev subscription override. It must be server-derived: a normal
// user may never see it true, however they poke at their own browser.

describe('integration — the admin flag on data + billing status', () => {
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
    const email = `admin-${seed}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const r = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'adminflag1', loginStartedAt: Date.now() - 5000, captchaToken: 'test' }),
    });
    const session = await r.json();
    const cookie = cookieFrom(r.headers.get('set-cookie'));
    const db = ctx.db();
    const user = db.findUserByEmail(email);
    db.setEmailVerified(user.id, Date.now());
    return { id: user.id, email, cookie, csrf: session.csrfToken };
  }

  const get = (path, user) =>
    fetch(`${base}${path}`, { headers: { Cookie: user.cookie } }).then((r) => r.json());

  it('is false for a plain user on both endpoints', async () => {
    const user = await makeUser('plain');
    expect((await get('/api/data', user)).admin).toBe(false);
    expect((await get('/api/billing/status', user)).admin).toBe(false);
  });

  it('is true once the server promotes the user to admin', async () => {
    const user = await makeUser('promoted');
    expect((await get('/api/data', user)).admin).toBe(false);

    ctx.db().setUserRole(user.id, 'admin');

    expect((await get('/api/data', user)).admin).toBe(true);
    expect((await get('/api/billing/status', user)).admin).toBe(true);
  });

  it('goes back to false when the role is revoked', async () => {
    const user = await makeUser('revoked');
    ctx.db().setUserRole(user.id, 'admin');
    expect((await get('/api/billing/status', user)).admin).toBe(true);

    ctx.db().setUserRole(user.id, 'user');
    expect((await get('/api/data', user)).admin).toBe(false);
    expect((await get('/api/billing/status', user)).admin).toBe(false);
  });

  it('does not leak another user\'s admin role', async () => {
    const admin = await makeUser('the-admin');
    const other = await makeUser('the-other');
    ctx.db().setUserRole(admin.id, 'admin');

    expect((await get('/api/data', other)).admin).toBe(false);
    expect((await get('/api/billing/status', other)).admin).toBe(false);
  });
});
