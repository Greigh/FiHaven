import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

// Mistyping your address at signup used to be a dead end: the verify gate is
// the only thing an unverified session can reach, and the one link that opens
// it went to an inbox the user doesn't own. change-email is the way out, so it
// has to work while unverified — with the password still standing guard.

describe('integration — correcting the email of an unverified account', () => {
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

  const PASSWORD = 'escapehatch1!';

  // Signs up and stays unverified — the state the verify screen shows.
  async function signup(seed) {
    const email = `typo-${seed}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const r = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, loginStartedAt: Date.now() - 5000, captchaToken: 'test' }),
    });
    expect(r.status).toBe(201);
    const session = await r.json();
    return { email, cookie: cookieFrom(r.headers.get('set-cookie')), csrf: session.csrfToken };
  }

  const changeEmail = (user, body) =>
    fetch(`${base}/api/account/change-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: user.cookie,
        'X-CSRF-Token': user.csrf,
      },
      body: JSON.stringify(body),
    });

  it('moves the address and keeps the session, still unverified', async () => {
    const user = await signup('moves');
    const corrected = `fixed-${Date.now()}@test.com`;

    const r = await changeEmail(user, { password: PASSWORD, newEmail: corrected });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, email: corrected, verificationRequired: true });

    // The account moved, and the old address is free again.
    const db = ctx.db();
    expect(db.findUserByEmail(corrected)).toBeTruthy();
    expect(db.findUserByEmail(user.email)).toBeFalsy();

    // Same session, still gated on verification — not signed out mid-fix.
    const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: user.cookie } }).then((x) => x.json());
    expect(me.user.email).toBe(corrected);
    expect(me.user.emailVerified).toBe(false);
    const data = await fetch(`${base}/api/data`, { headers: { Cookie: user.cookie } });
    expect(data.status).toBe(403);
  });

  it('sends the new confirmation link to the corrected address only', async () => {
    const user = await signup('mails');
    const before = ctx.sentMail().length;
    const corrected = `mailed-${Date.now()}@test.com`;

    await changeEmail(user, { password: PASSWORD, newEmail: corrected });

    const sent = ctx.sentMail().slice(before);
    expect(sent.length).toBe(1);
    expect(sent[0].to).toBe(corrected);
    expect(sent[0].to).not.toBe(user.email);
  });

  it('still demands the password', async () => {
    const user = await signup('guarded');
    const r = await changeEmail(user, { password: 'not-the-password1!', newEmail: `nope-${Date.now()}@test.com` });
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe('wrong-password');

    // Nothing moved.
    expect(ctx.db().findUserByEmail(user.email)).toBeTruthy();
  });

  it('rejects an address another account already holds', async () => {
    const taken = await signup('taken');
    const user = await signup('collides');

    const r = await changeEmail(user, { password: PASSWORD, newEmail: taken.email });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe('email-taken');
  });

  it('requires a session — an anonymous caller cannot move anyone', async () => {
    const user = await signup('anon');
    const r = await fetch(`${base}/api/account/change-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: PASSWORD, newEmail: `hijack-${Date.now()}@test.com` }),
    });
    expect(r.status).toBe(401);
    expect(ctx.db().findUserByEmail(user.email)).toBeTruthy();
  });

  it('signing out from the verify screen ends the session server-side', async () => {
    const user = await signup('signout');

    const out = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: user.cookie, 'X-CSRF-Token': user.csrf },
    });
    expect(out.status).toBe(204);

    const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie: user.cookie } }).then((x) => x.json());
    expect(me.user).toBeFalsy();
  });
});

describe('integration — signup password policy', () => {
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

  const trySignup = (password) =>
    fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `pw-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
        password,
        loginStartedAt: Date.now() - 5000,
        captchaToken: 'test',
      }),
    });

  it('accepts 8 characters carrying a letter, a digit, and a symbol', async () => {
    expect((await trySignup('ab1!cd2?')).status).toBe(201);
  });

  it('rejects a long password with no symbol', async () => {
    const r = await trySignup('correcthorse1');
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('weak-password');
  });

  it('rejects seven characters even with all three classes', async () => {
    const r = await trySignup('ab1!cd2');
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe('weak-password');
  });
});
