/* Every cookie-authenticated state-changing route must check CSRF.
 *
 * CodeQL's js/missing-token-validation flags server/index.js because it only
 * recognises packages (lusca, csurf) and cannot see a hand-rolled middleware.
 * The alert is a false positive — but "we looked once and it was fine" is not
 * a guarantee, and dismissing an alert without one is how a real gap gets
 * waved through later.
 *
 * So this asserts the property the rule is actually about, by walking the real
 * Express router stacks and comparing against requireCsrf BY IDENTITY. A route
 * added without protection fails here; a route that genuinely cannot take a
 * token has to be named in EXEMPT below, with a reason.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const serverDir = path.dirname(fileURLToPath(import.meta.url));

process.env.FIHAVEN_TEST_DB_PATH =
  process.env.FIHAVEN_TEST_DB_PATH || path.join(serverDir, '..', 'data', 'test-csrf-coverage.db');
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const { requireCsrf } = require(path.join(serverDir, 'session.js'));

const ROUTERS = {
  account: require(path.join(serverDir, 'routes/account.js')),
  admin: require(path.join(serverDir, 'routes/admin.js')),
  auth: require(path.join(serverDir, 'routes/auth.js')),
  billing: require(path.join(serverDir, 'routes/billing.js')),
  calendar: require(path.join(serverDir, 'routes/calendar.js')),
  data: require(path.join(serverDir, 'routes/data.js')),
  feedback: require(path.join(serverDir, 'routes/feedback.js')),
  household: require(path.join(serverDir, 'routes/household.js')),
  mfa: require(path.join(serverDir, 'routes/mfa.js')),
  plaid: require(path.join(serverDir, 'routes/plaid.js')),
  push: require(path.join(serverDir, 'routes/push.js')),
  // Exported as a factory taking the client dir.
  unsubscribe: require(path.join(serverDir, 'routes/unsubscribe.js'))(serverDir),
};

const STATE_CHANGING = new Set(['post', 'put', 'patch', 'delete']);

/**
 * Routes that legitimately cannot use requireCsrf. Each needs a reason, because
 * the point of the list is that adding to it is a decision, not a formality.
 */
const EXEMPT = new Map([
  // ── Pre-authentication. No session exists yet, so there is no token to
  //    check. What an attacker could forge here is a *login*, not an action on
  //    someone's account; signup/login additionally sit behind Turnstile.
  ['auth POST /signup', 'pre-auth: no session yet'],
  ['auth POST /login', 'pre-auth: no session yet'],
  ['auth POST /forgot', 'pre-auth: no session yet'],
  ['auth POST /reset', 'pre-auth: acts on an emailed token, not a cookie'],
  ['auth POST /verify-email', 'pre-auth: acts on an emailed token'],
  ['auth POST /recover-2fa/request', 'pre-auth: no session yet'],
  ['auth POST /recover-2fa/confirm', 'pre-auth: acts on an emailed token'],
  ['auth POST /mfa/email/send', 'mid-login: authenticated by the MFA token, not a cookie'],
  ['auth POST /mfa/verify', 'mid-login: authenticated by the MFA token, not a cookie'],
  ['auth POST /mfa/passkey/start', 'mid-login: authenticated by the MFA token'],
  ['auth POST /mfa/passkey/finish', 'mid-login: authenticated by the MFA token'],
  ['auth POST /passkey/login/start', 'pre-auth: no session yet'],
  ['auth POST /passkey/login/finish', 'pre-auth: no session yet'],
  ['auth POST /oauth/:provider', 'pre-auth: provider ID token is the credential'],
  ['auth POST /oauth/:provider/handoff', 'pre-auth: one-time handoff code is the credential'],
  ['auth POST /oauth/apple/callback', 'pre-auth: form_post from Apple, cross-site by design'],
  ['auth POST /oauth/google/callback', 'pre-auth: form_post from Google, cross-site by design'],

  // ── Checks the token inline rather than via the middleware, because an
  //    absent session must return 204 (logout is idempotent) instead of the
  //    401 requireCsrf would raise. Covered by the assertion below.
  ['auth POST /logout', 'inline CSRF check; see csrf-is-enforced-on-logout'],

  // ── Server-to-server. No cookie is involved, and each verifies its own
  //    signature. Requiring a CSRF header would simply break them.
  ['billing POST /paddle/webhook', 'webhook: HMAC over the raw body'],
  ['billing POST /apple/notifications', 'webhook: Apple JWS signature'],
  ['billing POST /google/notifications', 'webhook: Google OIDC bearer + audience'],
  ['plaid POST /webhook', 'webhook: Plaid verification'],

  // ── Authenticated by an emailed token, not by the session cookie. RFC 8058
  //    one-click unsubscribe requires a bare POST that mail providers can send.
  ['unsubscribe POST /', 'RFC 8058 one-click: emailed token is the credential'],
]);

function stateChangingRoutes() {
  const found = [];
  for (const [name, router] of Object.entries(ROUTERS)) {
    for (const layer of router.stack || []) {
      if (!layer.route) continue;
      const handlers = (layer.route.stack || []).map((s) => s.handle);
      for (const method of Object.keys(layer.route.methods || {})) {
        if (!STATE_CHANGING.has(method)) continue;
        found.push({
          id: `${name} ${method.toUpperCase()} ${layer.route.path}`,
          handlers,
        });
      }
    }
  }
  return found;
}

describe('CSRF coverage', () => {
  const routes = stateChangingRoutes();

  it('finds the routers (guards against silently testing nothing)', () => {
    // If a refactor changed how routers export, every other assertion here
    // would vacuously pass. Fail loudly instead.
    expect(routes.length).toBeGreaterThan(30);
  });

  it('protects every cookie-authenticated state-changing route', () => {
    const unprotected = routes
      .filter((r) => !r.handlers.includes(requireCsrf))
      .map((r) => r.id)
      .filter((id) => !EXEMPT.has(id));

    // Named individually so a failure says WHICH route, not just a count.
    expect(unprotected).toEqual([]);
  });

  it('keeps the exemption list honest — no entry for a route that has CSRF', () => {
    // A stale exemption is how a route quietly loses protection later: the
    // list would already excuse it.
    const redundant = routes
      .filter((r) => r.handlers.includes(requireCsrf) && EXEMPT.has(r.id))
      .map((r) => r.id);
    expect(redundant).toEqual([]);
  });

  it('keeps the exemption list honest — no entry for a route that is gone', () => {
    const ids = new Set(routes.map((r) => r.id));
    const stale = [...EXEMPT.keys()].filter((id) => !ids.has(id));
    expect(stale).toEqual([]);
  });

  it('enforces CSRF on logout, which checks the token inline', () => {
    // Exempted from the middleware assertion above, so verify the real
    // behaviour rather than trusting the comment next to the exemption.
    const logout = routes.find((r) => r.id === 'auth POST /logout');
    expect(logout).toBeTruthy();
    const handler = logout.handlers[logout.handlers.length - 1];

    const res = () => {
      const out = { code: null, body: null };
      return {
        out,
        status(c) { out.code = c; return this; },
        json(b) { out.body = b; return this; },
        end() { return this; },
      };
    };

    // Cookie client with a wrong token → refused.
    const bad = res();
    handler(
      { session: { csrf_token: 'right' }, authVia: 'cookie', get: () => 'wrong' },
      bad,
      () => {},
    );
    expect(bad.out.code).toBe(403);

    // Cookie client with no token at all → refused.
    const missing = res();
    handler(
      { session: { csrf_token: 'right' }, authVia: 'cookie', get: () => undefined },
      missing,
      () => {},
    );
    expect(missing.out.code).toBe(403);
  });
});
