import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

/**
 * Account deletion has to work for every account we let people create —
 * including Sign in with Apple / Google ones, which have no password to
 * re-enter (App Store Guideline 5.1.1(v)). Those confirm with the typed
 * phrase instead.
 */

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** Unsigned JWT accepted under OAUTH_VERIFY_MODE=dev-trust. */
function fakeIdToken({ sub, email, aud }) {
  return [
    b64url({ alg: 'none', typ: 'JWT' }),
    b64url({
      sub,
      email,
      email_verified: true,
      aud,
      iss: 'https://accounts.google.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
    'fakesig',
  ].join('.');
}

/**
 * The Paddle API endpoint a request targets, or '' for anything else.
 *
 * Compares the *parsed* hostname rather than prefix-matching the href: a
 * `startsWith('https://api.paddle.com')` check also matches any host that
 * merely begins with it — `https://api.paddle.com.example.net/` — because
 * nothing forces a delimiter after `.com`
 * (CodeQL js/incomplete-url-substring-sanitization). Here that would have
 * diverted a look-alike host into the stub and reported it as a genuine
 * Paddle call.
 */
export function paddleTarget(input) {
  // fetch() accepts a string, a URL, or a Request.
  const raw = typeof input === 'string' || input instanceof URL
    ? input
    : (input && typeof input.url === 'string' ? input.url : '');
  let parsed;
  try {
    parsed = new URL(String(raw));
  } catch {
    return ''; // relative or unparseable — never Paddle
  }
  return parsed.hostname === 'api.paddle.com' ? parsed.href : '';
}

describe('paddleTarget — only the real Paddle host is intercepted', () => {
  it('matches the Paddle API host and returns the full URL', () => {
    expect(paddleTarget('https://api.paddle.com/subscriptions/sub_1/cancel'))
      .toBe('https://api.paddle.com/subscriptions/sub_1/cancel');
    expect(paddleTarget(new URL('https://api.paddle.com/x'))).toBe('https://api.paddle.com/x');
    expect(paddleTarget({ url: 'https://api.paddle.com/x' })).toBe('https://api.paddle.com/x');
  });

  it('rejects hosts that merely start with, contain, or spoof it', () => {
    for (const url of [
      'https://api.paddle.com.example.net/subscriptions',  // suffixed host
      'https://api.paddle.comevil.net/subscriptions',      // no delimiter
      'https://evil.net/https://api.paddle.com/cancel',    // in the path
      'https://evil.net/?u=https://api.paddle.com',        // in the query
      'https://sandbox-api.paddle.com/subscriptions',      // different host
      'http://api.paddle.com.evil.net/',
    ]) {
      expect(paddleTarget(url)).toBe('');
    }
  });

  it('passes through anything unparseable rather than guessing', () => {
    expect(paddleTarget('/api/auth/signup')).toBe('');
    expect(paddleTarget('')).toBe('');
    expect(paddleTarget(undefined)).toBe('');
  });
});

describe('integration — account deletion', () => {
  let ctx;
  let base;
  let server;
  const prev = {};

  /**
   * Paddle calls the test intercepts. `fetch` can't simply be replaced — these
   * tests use it to drive the server — so only api.paddle.com is diverted and
   * everything else passes through to the real implementation.
   */
  let paddleCalls = [];
  let paddleResponder = () => ({ ok: true, status: 200, json: async () => ({ data: {} }) });

  beforeAll(async () => {
    for (const k of ['OAUTH_VERIFY_MODE', 'GOOGLE_OAUTH_CLIENT_ID', 'PADDLE_API_KEY']) {
      prev[k] = process.env[k];
    }
    process.env.OAUTH_VERIFY_MODE = 'dev-trust';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-google-aud';
    process.env.PADDLE_API_KEY = 'pdl_test_key';

    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const target = paddleTarget(url);
      if (target) {
        paddleCalls.push({ url: target, init });
        return paddleResponder();
      }
      return realFetch(url, init);
    };
    prev.__realFetch = realFetch;

    ctx = createTestServer();
    ({ base, server } = await listen(ctx.app));
  });

  beforeEach(() => {
    paddleCalls = [];
    paddleResponder = () => ({ ok: true, status: 200, json: async () => ({ data: {} }) });
  });

  afterAll(() => {
    server?.close();
    ctx?.close();
    if (prev.__realFetch) globalThis.fetch = prev.__realFetch;
    delete prev.__realFetch;
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  /** Password signup → { email, cookie, csrfToken }. */
  async function signUp() {
    const email = `delete-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const res = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'integration1',
        loginStartedAt: Date.now() - 5000,
        captchaToken: 'test',
      }),
    });
    expect(res.status).toBe(201);
    const session = await res.json();
    return { email, cookie: cookieFrom(res.headers.get('set-cookie')), csrfToken: session.csrfToken };
  }

  /** Sign in with Google (dev-trust) → { email, token } for a passwordless account. */
  async function signInWithGoogle() {
    const email = `oauth-delete-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const idToken = fakeIdToken({ sub: `sub-${email}`, email, aud: 'test-google-aud' });
    const res = await fetch(`${base}/api/auth/oauth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'token' },
      body: JSON.stringify({ idToken }),
    });
    expect(res.status).toBe(200);
    const session = await res.json();
    expect(session.token).toBeTruthy();
    return { email, token: session.token };
  }

  it('reports hasPassword on /me: true for password accounts, false for OAuth', async () => {
    const pw = await signUp();
    const pwMe = await fetch(`${base}/api/auth/me`, { headers: { Cookie: pw.cookie } }).then((r) => r.json());
    expect(pwMe.user.hasPassword).toBe(true);

    const oauth = await signInWithGoogle();
    const oauthMe = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${oauth.token}` },
    }).then((r) => r.json());
    expect(oauthMe.user.hasPassword).toBe(false);
  });

  it('deletes a password account when the password is correct', async () => {
    const { email, cookie, csrfToken } = await signUp();
    const res = await fetch(`${base}/api/account/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, Cookie: cookie },
      body: JSON.stringify({ password: 'integration1', confirm: 'DELETE ACCOUNT DATA' }),
    });
    expect(res.status).toBe(200);
    expect(ctx.db().findUserByEmail(email)).toBeFalsy();
  });

  it('rejects a wrong password on a password account', async () => {
    const { email, cookie, csrfToken } = await signUp();
    const res = await fetch(`${base}/api/account/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, Cookie: cookie },
      body: JSON.stringify({ password: 'wrong-one-1', confirm: 'DELETE ACCOUNT DATA' }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'wrong-password' });
    expect(ctx.db().findUserByEmail(email)).toBeTruthy();
  });

  it('deletes an OAuth-only account with the confirm phrase and no password', async () => {
    const { email, token } = await signInWithGoogle();
    const res = await fetch(`${base}/api/account/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ confirm: 'delete account data' }), // case-insensitive
    });
    expect(res.status).toBe(200);
    expect(ctx.db().findUserByEmail(email)).toBeFalsy();
  });

  /** Give `email` a live Paddle subscription row, as a webhook would. */
  function giveWebSubscription(email, subscriptionId) {
    const db = ctx.db();
    const user = db.findUserByEmail(email);
    const now = Date.now();
    db.upsertSubscription({
      user_id: user.id,
      platform: 'paddle',
      product_id: 'pri_yearly',
      txn_id: subscriptionId,
      status: 'active',
      expires_at: now + 365 * 86400000,
      environment: 'Sandbox',
      auto_renew: 1,
      raw: JSON.stringify({ customerId: 'ctm_1' }),
      created_at: now,
      updated_at: now,
    });
    return user;
  }

  it('cancels the web subscription at Paddle before deleting the account', async () => {
    const { email, cookie, csrfToken } = await signUp();
    giveWebSubscription(email, 'sub_web_1');

    const res = await fetch(`${base}/api/account/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, Cookie: cookie },
      body: JSON.stringify({ password: 'integration1', confirm: 'DELETE ACCOUNT DATA' }),
    });
    expect(res.status).toBe(200);

    // Paddle is the merchant of record: without this the customer keeps being
    // charged for an account that no longer exists.
    expect(paddleCalls).toHaveLength(1);
    expect(paddleCalls[0].url).toBe('https://api.paddle.com/subscriptions/sub_web_1/cancel');
    expect(JSON.parse(paddleCalls[0].init.body)).toEqual({ effective_from: 'immediately' });
    expect(ctx.db().findUserByEmail(email)).toBeFalsy();
  });

  it('still deletes the account when Paddle cancellation fails', async () => {
    const { email, cookie, csrfToken } = await signUp();
    giveWebSubscription(email, 'sub_web_2');
    paddleResponder = () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'internal_error', detail: 'boom' } }),
    });

    const res = await fetch(`${base}/api/account/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, Cookie: cookie },
      body: JSON.stringify({ password: 'integration1', confirm: 'DELETE ACCOUNT DATA' }),
    });
    // A billing hiccup must never trap someone in an account they asked to
    // delete — it's logged for follow-up instead.
    expect(res.status).toBe(200);
    expect(ctx.db().findUserByEmail(email)).toBeFalsy();
  });

  it('does not call Paddle for an account that never subscribed on the web', async () => {
    const { email, cookie, csrfToken } = await signUp();
    const res = await fetch(`${base}/api/account/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, Cookie: cookie },
      body: JSON.stringify({ password: 'integration1', confirm: 'DELETE ACCOUNT DATA' }),
    });
    expect(res.status).toBe(200);
    expect(paddleCalls).toHaveLength(0);
    expect(ctx.db().findUserByEmail(email)).toBeFalsy();
  });

  it('refuses to delete an OAuth-only account without the confirm phrase', async () => {
    const { email, token } = await signInWithGoogle();
    const res = await fetch(`${base}/api/account/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password: 'anything-at-all' }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'confirm-required' });
    expect(ctx.db().findUserByEmail(email)).toBeTruthy();
  });
});
