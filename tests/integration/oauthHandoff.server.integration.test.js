import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen } from './helpers/testServer.js';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** Unsigned JWT for OAUTH_VERIFY_MODE=dev-trust. */
function fakeIdToken({ sub, email, aud }) {
  const header = b64url({ alg: 'none', typ: 'JWT' });
  const payload = b64url({
    sub,
    email,
    email_verified: true,
    aud,
    iss: 'https://accounts.google.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
    name: 'Handoff Tester',
  });
  return `${header}.${payload}.fakesig`;
}

describe('integration — oauth handoff (App Link return)', () => {
  let ctx;
  let base;
  let server;
  const prev = {};

  beforeAll(async () => {
    for (const k of ['OAUTH_VERIFY_MODE', 'GOOGLE_OAUTH_CLIENT_ID', 'PUBLIC_ORIGIN']) {
      prev[k] = process.env[k];
    }
    process.env.OAUTH_VERIFY_MODE = 'dev-trust';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-google-aud';
    process.env.PUBLIC_ORIGIN = 'https://fihaven.app';

    ctx = createTestServer();
    ({ base, server } = await listen(ctx.app));
  });

  afterAll(() => {
    server?.close();
    ctx?.close();
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('creates a handoff and returns an https App Link without the JWT', async () => {
    const idToken = fakeIdToken({
      sub: 'google-sub-1',
      email: `handoff-${Date.now()}@test.com`,
      aud: 'test-google-aud',
    });
    const res = await fetch(`${base}/api/auth/oauth/google/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, state: 'csrf-1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toMatch(/^[a-f0-9]{64}$/);
    expect(body.returnUrl).toBe(
      `https://fihaven.app/oauth/google?code=${body.code}&state=csrf-1`,
    );
    expect(body.returnUrl).not.toContain('idToken');
    expect(JSON.stringify(body)).not.toContain(idToken);
  });

  it('rejects missing idToken on handoff create', async () => {
    const res = await fetch(`${base}/api/auth/oauth/google/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'x' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing-id-token' });
  });

  it('completes OAuth with handoffCode and rejects reuse', async () => {
    const email = `handoff-login-${Date.now()}@test.com`;
    const idToken = fakeIdToken({
      sub: `google-sub-${Date.now()}`,
      email,
      aud: 'test-google-aud',
    });
    const created = await fetch(`${base}/api/auth/oauth/google/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, state: 'csrf-2' }),
    }).then((r) => r.json());

    const login = await fetch(`${base}/api/auth/oauth/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Mode': 'token',
      },
      body: JSON.stringify({ handoffCode: created.code, state: 'csrf-2' }),
    });
    expect(login.status).toBe(200);
    const session = await login.json();
    expect(session.user?.email).toBe(email);
    expect(session.token).toBeTruthy();

    const reuse = await fetch(`${base}/api/auth/oauth/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Mode': 'token',
      },
      body: JSON.stringify({ handoffCode: created.code, state: 'csrf-2' }),
    });
    expect(reuse.status).toBe(401);
    expect(await reuse.json()).toEqual({ error: 'handoff-used' });
  });

  it('rejects wrong state on handoff consume', async () => {
    const idToken = fakeIdToken({
      sub: `google-sub-badstate-${Date.now()}`,
      email: `handoff-badstate-${Date.now()}@test.com`,
      aud: 'test-google-aud',
    });
    const created = await fetch(`${base}/api/auth/oauth/google/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, state: 'expected' }),
    }).then((r) => r.json());

    const bad = await fetch(`${base}/api/auth/oauth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'token' },
      body: JSON.stringify({ handoffCode: created.code, state: 'wrong' }),
    });
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: 'handoff-mismatch' });
  });
});
