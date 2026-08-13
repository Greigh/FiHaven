import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

// The admin console shows three different stamps that used to be impossible to
// tell apart. This pins the difference down:
//   lastLoginAt  — a credential was actually presented.
//   lastSeenAt   — an existing session made a request (app open, sync, a read).
//   lastUsedAt   — the saved data blob actually changed.

describe('integration — admin activity stamps', () => {
  let ctx;
  let base;
  let server;

  beforeAll(async () => {
    // Read once when session.js loads, so it has to be set before the server
    // is built. Without it a user's second request inside a test would be
    // throttled out and lastSeenAt would look frozen.
    process.env.LAST_SEEN_THROTTLE_MS = '1';
    ctx = createTestServer();
    ({ base, server } = await listen(ctx.app));
  });

  afterAll(() => {
    delete process.env.LAST_SEEN_THROTTLE_MS;
    server?.close();
    ctx?.close();
  });

  async function signup(seed) {
    const email = `stamps-${seed}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const password = 'stamps-pass-1';
    const r = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, loginStartedAt: Date.now() - 5000, captchaToken: 'test' }),
    });
    const session = await r.json();
    const cookie = cookieFrom(r.headers.get('set-cookie'));
    const db = ctx.db();
    const user = db.findUserByEmail(email);
    db.setEmailVerified(user.id, Date.now());
    return { id: user.id, email, password, cookie, csrf: session.csrfToken };
  }

  // Reads the row the way the admin console does, through the real endpoint.
  async function adminRow(admin, email) {
    const r = await fetch(`${base}/api/admin/users?q=${encodeURIComponent(email)}`, {
      headers: { Cookie: admin.cookie },
    });
    const body = await r.json();
    return (body.users || []).find((u) => u.email === email);
  }

  let admin;
  beforeAll(async () => {
    admin = await signup('the-admin');
    ctx.db().setUserRole(admin.id, 'admin');
  });

  it('records the signup as a sign-in, with its method', async () => {
    const user = await signup('fresh');
    const row = await adminRow(admin, user.email);
    expect(row.lastLoginMethod).toBe('signup');
    expect(row.lastLoginAt).toBeGreaterThan(0);
    // No data has ever been saved, so only the write stamp is empty.
    expect(row.lastSeenAt).toBeGreaterThan(0);
    expect(row.lastUsedAt).toBeFalsy();
  });

  it('moves lastSeenAt but not lastLoginAt when a live session just syncs', async () => {
    const user = await signup('syncer');
    const before = await adminRow(admin, user.email);

    await new Promise((r) => setTimeout(r, 5));
    // A plain read: no credential, no data change.
    const r = await fetch(`${base}/api/data`, { headers: { Cookie: user.cookie } });
    expect(r.status).toBe(200);

    const after = await adminRow(admin, user.email);
    expect(after.lastLoginAt).toBe(before.lastLoginAt);
    expect(after.lastUsedAt).toBe(before.lastUsedAt);
    expect(after.lastSeenAt).toBeGreaterThan(before.lastSeenAt);
  });

  it('moves lastUsedAt only when the saved data actually changes', async () => {
    const user = await signup('writer');
    const before = await adminRow(admin, user.email);
    expect(before.lastUsedAt).toBeFalsy();

    const r = await fetch(`${base}/api/data`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: user.cookie,
        'X-CSRF-Token': user.csrf,
      },
      body: JSON.stringify({ bills: [], settings: { currency: 'USD' } }),
    });
    expect(r.status).toBe(200);

    const after = await adminRow(admin, user.email);
    expect(after.lastUsedAt).toBeGreaterThan(0);
    expect(after.lastLoginAt).toBe(before.lastLoginAt);
  });

  it('moves lastLoginAt again on a real password sign-in', async () => {
    const user = await signup('returner');
    const before = await adminRow(admin, user.email);

    await new Promise((r) => setTimeout(r, 5));
    const r = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
        loginStartedAt: Date.now() - 5000,
        captchaToken: 'test',
      }),
    });
    expect(r.status).toBe(200);

    const after = await adminRow(admin, user.email);
    expect(after.lastLoginAt).toBeGreaterThan(before.lastLoginAt);
    expect(after.lastLoginMethod).toBe('password');
  });
});
