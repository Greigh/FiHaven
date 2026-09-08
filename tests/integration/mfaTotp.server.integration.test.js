import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TOTP, Secret } from 'otpauth';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

// Full TOTP second-factor path: enrol, sign out, sign back in through the MFA
// challenge, and — the point of this file — prove a code can't be replayed
// (used once to finish login, then again inside its ~90s validity window).

function totpNow(base32) {
  return new TOTP({
    issuer: 'FiHaven', algorithm: 'SHA1', digits: 6, period: 30,
    secret: Secret.fromBase32(base32),
  }).generate();
}

describe('integration — TOTP MFA login + replay protection', () => {
  let ctx;
  let base;
  let server;

  beforeAll(async () => {
    ctx = createTestServer();
    ({ base, server } = await listen(ctx.app));
  });
  afterAll(() => { server?.close(); ctx?.close(); });

  const PW = 'totp-user-11!';

  async function signup() {
    const email = `totp-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const r = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PW, loginStartedAt: Date.now() - 5000, captchaToken: 'test' }),
    });
    const body = await r.json();
    const cookie = cookieFrom(r.headers.get('set-cookie'));
    const db = ctx.db();
    const user = db.findUserByEmail(email);
    db.setEmailVerified(user.id, Date.now());
    return { email, userId: user.id, cookie, csrf: body.csrfToken };
  }

  const auth = (u, body) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': u.csrf, Cookie: u.cookie },
    body: JSON.stringify(body || {}),
  });

  async function enrolTotp(u) {
    const setup = await fetch(`${base}/api/account/mfa/totp/setup`, auth(u, { password: PW })).then((r) => r.json());
    expect(setup.secret).toBeTruthy();
    const confirm = await fetch(`${base}/api/account/mfa/totp/confirm`, auth(u, { code: totpNow(setup.secret) }));
    expect(confirm.status).toBe(200);
    return setup.secret;
  }

  async function login(email) {
    const r = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PW, loginStartedAt: Date.now() - 5000, captchaToken: 'test' }),
    });
    return r.json();
  }

  it('requires the second factor after enrolment and accepts a valid code', async () => {
    const u = await signup();
    const secret = await enrolTotp(u);

    const challenge = await login(u.email);
    expect(challenge.mfaRequired).toBe(true);
    expect(challenge.methods).toContain('totp');

    const verify = await fetch(`${base}/api/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken: challenge.mfaToken, code: totpNow(secret) }),
    });
    expect(verify.status).toBe(200);
    expect((await verify.json()).user.email).toBe(u.email);
  });

  it('rejects a code that was already spent, even while still time-valid', async () => {
    const u = await signup();
    const secret = await enrolTotp(u);
    const code = totpNow(secret);   // captured once, reused verbatim below

    // First login: the code finishes the challenge.
    const c1 = await login(u.email);
    const v1 = await fetch(`${base}/api/auth/mfa/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken: c1.mfaToken, code }),
    });
    expect(v1.status).toBe(200);

    // Second login, same still-valid code: must be refused as a replay.
    const c2 = await login(u.email);
    const v2 = await fetch(`${base}/api/auth/mfa/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken: c2.mfaToken, code }),
    });
    expect(v2.status).toBe(401);

    // The step really was recorded.
    const totp = ctx.db().getTotp(u.userId);
    expect(typeof totp.last_used_step).toBe('number');
  });

  it('disabling TOTP also rejects a spent code', async () => {
    const u = await signup();
    const secret = await enrolTotp(u);
    const code = totpNow(secret);

    // Spend the code finishing a login.
    const c1 = await login(u.email);
    await fetch(`${base}/api/auth/mfa/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken: c1.mfaToken, code }),
    });

    // Now try to turn TOTP off with that same code — reauth passes (password),
    // but the second factor is a replay.
    const disable = await fetch(`${base}/api/account/mfa/totp/disable`, auth(u, { password: PW, code }));
    expect(disable.status).toBe(401);
    expect(ctx.db().getTotp(u.userId).enabled_at).toBeTruthy();  // still on
  });
});
