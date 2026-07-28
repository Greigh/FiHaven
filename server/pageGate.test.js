import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { privatePageGate } = require('./pageGate');

// Minimal express-shaped req/res. `run` returns where the gate sent the
// request, or 'next' when it let it through.
function run(gate, { path, query = '', user = null }) {
  const req = { path, originalUrl: path + query, user };
  let out = null;
  const res = { redirect: (to) => { out = to; } };
  gate(req, res, () => { out = 'next'; });
  return out;
}

describe('pageGate — private pages', () => {
  const gate = privatePageGate('');

  it('sends a signed-out visitor on a bare URL to the marketing landing', () => {
    expect(run(gate, { path: '/dashboard' })).toBe('/');
    expect(run(gate, { path: '/settings' })).toBe('/');
  });

  it('preserves a deep link through sign-in when the URL carries intent', () => {
    expect(run(gate, { path: '/settings', query: '?tab=notifications' }))
      .toBe('/login?next=' + encodeURIComponent('/settings?tab=notifications'));
  });

  it('encodes the target so it survives as a single query value', () => {
    const to = run(gate, { path: '/settings', query: '?tab=notifications&x=1' });
    // One `next` param — not a query string spliced into the login URL.
    const params = new URLSearchParams(to.split('?')[1]);
    expect([...params.keys()]).toEqual(['next']);
    expect(params.get('next')).toBe('/settings?tab=notifications&x=1');
  });

  it('lets a verified, onboarded user through', () => {
    const user = { emailVerified: true, onboarded: true };
    expect(run(gate, { path: '/settings', user })).toBe('next');
  });

  it('still routes unverified and un-onboarded users first', () => {
    expect(run(gate, { path: '/settings', user: { emailVerified: false } }))
      .toBe('/verify-email');
    expect(run(gate, { path: '/dashboard', user: { emailVerified: true, onboarded: false } }))
      .toBe('/welcome');
    // /settings stays reachable mid-onboarding so it can deep-link there.
    expect(run(gate, { path: '/settings', user: { emailVerified: true, onboarded: false } }))
      .toBe('next');
  });

  it('honours a mount subpath', () => {
    // Mounted under /fihaven, `req.path` is still mount-relative — every
    // redirect (and the `next` target) has to carry the prefix back.
    const based = privatePageGate('/fihaven');
    expect(run(based, { path: '/settings' })).toBe('/fihaven/');
    expect(run(based, { path: '/settings', query: '?tab=notifications' }))
      .toBe('/fihaven/login?next=' + encodeURIComponent('/fihaven/settings?tab=notifications'));
  });
});
