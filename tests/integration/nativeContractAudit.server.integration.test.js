import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen } from './helpers/testServer.js';

describe('integration — native client server contract & error handling', () => {
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

  it('supports token auth mode and issues Bearer token without cookies', async () => {
    const email = `native-${Date.now()}@test.com`;
    const password = 'Password123!';

    const res = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Mode': 'token',
      },
      body: JSON.stringify({
        email,
        password,
        loginStartedAt: Date.now() - 3000,
        captchaToken: 'test-turnstile',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.token).toBeTypeOf('string');
    expect(data.token.length).toBeGreaterThan(20);
    expect(data.user.email).toBe(email);
    // In token mode, no session cookie should be set
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects payloads larger than 256kb with 413 Payload Too Large', async () => {
    const email = `limit-${Date.now()}@test.com`;
    const password = 'Password123!';

    const signup = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Mode': 'token',
      },
      body: JSON.stringify({
        email,
        password,
        loginStartedAt: Date.now() - 3000,
        captchaToken: 'test-turnstile',
      }),
    });
    const { token } = await signup.json();
    const db = ctx.db();
    const user = db.findUserByEmail(email);
    db.setEmailVerified(user.id, Date.now());

    // Construct a payload larger than 256kb (e.g. 300kb of bills)
    const largeName = 'X'.repeat(1024); // 1kb string
    const largeBills = [];
    for (let i = 0; i < 350; i++) {
      largeBills.push({ id: `b_${i}`, name: largeName, amount: 100 });
    }

    const putRes = await fetch(`${base}/api/data`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ bills: largeBills }),
    });

    expect(putRes.status).toBe(413);
  });

  it('enforces soft suspension over Bearer token requests with 403 account-suspended', async () => {
    const email = `suspend-${Date.now()}@test.com`;
    const password = 'Password123!';

    const signup = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Mode': 'token',
      },
      body: JSON.stringify({
        email,
        password,
        loginStartedAt: Date.now() - 3000,
        captchaToken: 'test-turnstile',
      }),
    });
    const { token } = await signup.json();
    const db = ctx.db();
    const user = db.findUserByEmail(email);
    db.setEmailVerified(user.id, Date.now());

    // Normal request succeeds
    const okGet = await fetch(`${base}/api/data`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(okGet.status).toBe(200);

    // Suspend the user
    db.setUserSuspended(user.id, true, 'Payment failed');

    const suspendedGet = await fetch(`${base}/api/data`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(suspendedGet.status).toBe(403);
    const errBody = await suspendedGet.json();
    expect(errBody.error).toBe('account-suspended');
    expect(errBody.reason).toBe('Payment failed');

    // Unsuspend user and verify access is restored
    db.setUserSuspended(user.id, false, null);
    const restoredGet = await fetch(`${base}/api/data`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(restoredGet.status).toBe(200);
  });

  it('manages push device tokens and purges them on account deletion', async () => {
    const email = `push-${Date.now()}@test.com`;
    const password = 'Password123!';

    const signup = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Mode': 'token',
      },
      body: JSON.stringify({
        email,
        password,
        loginStartedAt: Date.now() - 3000,
        captchaToken: 'test-turnstile',
      }),
    });
    const { token } = await signup.json();
    const db = ctx.db();
    const user = db.findUserByEmail(email);

    // Unverified account cannot register push
    const unverifiedPush = await fetch(`${base}/api/push/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ platform: 'ios', token: 'apns-device-token-1' }),
    });
    expect(unverifiedPush.status).toBe(403);

    // Verify email
    db.setEmailVerified(user.id, Date.now());

    // Register with invalid platform
    const badPlatform = await fetch(`${base}/api/push/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ platform: 'windows', token: 'token-123' }),
    });
    expect(badPlatform.status).toBe(400);

    // Register valid iOS token
    const regIos = await fetch(`${base}/api/push/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ platform: 'ios', token: 'apns-device-token-1' }),
    });
    expect(regIos.status).toBe(200);
    const regIosBody = await regIos.json();
    expect(regIosBody.ok).toBe(true);

    // Register valid Android token
    const regAnd = await fetch(`${base}/api/push/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ platform: 'android', token: 'fcm-device-token-1' }),
    });
    expect(regAnd.status).toBe(200);

    let devices = db.listPushDevices(user.id);
    expect(devices.length).toBe(2);

    // Unregister iOS token
    const unreg = await fetch(`${base}/api/push/unregister`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ token: 'apns-device-token-1' }),
    });
    expect(unreg.status).toBe(200);

    devices = db.listPushDevices(user.id);
    expect(devices.length).toBe(1);
    expect(devices[0].token).toBe('fcm-device-token-1');

    // Unregistering without auth token must return 401
    const anonUnreg = await fetch(`${base}/api/push/unregister`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'fcm-device-token-1' }),
    });
    expect(anonUnreg.status).toBe(401);

    // Delete account permanently
    const del = await fetch(`${base}/api/account/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ password, confirm: 'DELETE ACCOUNT DATA' }),
    });
    expect(del.status).toBe(200);

    // After account deletion, push devices are purged
    devices = db.listPushDevices(user.id);
    expect(devices.length).toBe(0);
  });

  it('streams household SSE live deltas over Bearer auth', async () => {
    const email = `hh-${Date.now()}@test.com`;
    const password = 'Password123!';

    const signup = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Mode': 'token',
      },
      body: JSON.stringify({
        email,
        password,
        loginStartedAt: Date.now() - 3000,
        captchaToken: 'test-turnstile',
      }),
    });
    const { token } = await signup.json();
    const db = ctx.db();
    const user = db.findUserByEmail(email);
    db.setEmailVerified(user.id, Date.now());

    // Grant Family subscription so household creation is permitted
    db.upsertSubscription({
      user_id: user.id,
      platform: 'comp',
      product_id: 'comp:family',
      txn_id: 'comp:' + user.id,
      status: 'active',
      expires_at: null,
      environment: 'Admin',
      auto_renew: 0,
      raw: JSON.stringify({ plan: 'family' }),
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // Create a household
    const createRes = await fetch(`${base}/api/household`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: 'Test Family' }),
    });
    expect(createRes.status).toBe(200);

    // Open household stream
    const controller = new AbortController();
    const streamRes = await fetch(`${base}/api/household/stream/0`, {
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });

    expect(streamRes.status).toBe(200);
    expect(streamRes.headers.get('content-type')).toContain('text/event-stream');
    controller.abort();
  });
});
