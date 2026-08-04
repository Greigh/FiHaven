/* Apple sandbox acceptance window.
 *
 * Sandbox StoreKit transactions carry the same production signing chain as
 * real ones, so accepting them means a sandbox tester account can mint real
 * Pro. App Review and TestFlight both purchase against sandbox, though, so it
 * cannot simply be refused. The resolution is a window that shuts by itself —
 * which only helps if it actually shuts, hence these tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const serverDir = path.dirname(fileURLToPath(import.meta.url));

process.env.FIHAVEN_TEST_DB_PATH =
  process.env.FIHAVEN_TEST_DB_PATH || path.join(serverDir, '..', 'data', 'test-apple-sandbox.db');

const { sandboxAllowed, sandboxExpiresAt } = require(
  path.join(serverDir, 'billing.js')
);

const DAY = 86400000;
let saved;

beforeEach(() => { saved = process.env.APPLE_ALLOW_SANDBOX; });
afterEach(() => {
  if (saved === undefined) delete process.env.APPLE_ALLOW_SANDBOX;
  else process.env.APPLE_ALLOW_SANDBOX = saved;
});

function withValue(v, fn) {
  if (v === undefined) delete process.env.APPLE_ALLOW_SANDBOX;
  else process.env.APPLE_ALLOW_SANDBOX = v;
  return fn();
}

describe('sandboxAllowed', () => {
  it('rejects when unset — the secure default', () => {
    expect(withValue(undefined, () => sandboxAllowed())).toBe(false);
  });

  it('rejects an explicit 0 and an empty value', () => {
    expect(withValue('0', () => sandboxAllowed())).toBe(false);
    expect(withValue('', () => sandboxAllowed())).toBe(false);
    expect(withValue('   ', () => sandboxAllowed())).toBe(false);
  });

  it('accepts a bare 1 indefinitely (legacy escape hatch)', () => {
    expect(withValue('1', () => sandboxAllowed())).toBe(true);
    // Far future — a boolean has no expiry, which is exactly why the deploy
    // script never writes this form.
    expect(withValue('1', () => sandboxAllowed(Date.now() + 3650 * DAY))).toBe(true);
  });

  it('accepts an ISO deadline before it passes, and rejects after', () => {
    const until = new Date(Date.now() + 7 * DAY).toISOString();
    withValue(until, () => {
      expect(sandboxAllowed(Date.now())).toBe(true);
      expect(sandboxAllowed(Date.now() + 6 * DAY)).toBe(true);
      // The whole point: no redeploy, no edit — it simply stops.
      expect(sandboxAllowed(Date.now() + 8 * DAY)).toBe(false);
    });
  });

  it('treats an already-past deadline as closed', () => {
    const past = new Date(Date.now() - DAY).toISOString();
    expect(withValue(past, () => sandboxAllowed())).toBe(false);
  });

  it('accepts an epoch-ms deadline', () => {
    const until = Date.now() + 2 * DAY;
    withValue(String(until), () => {
      expect(sandboxAllowed(until - 1000)).toBe(true);
      expect(sandboxAllowed(until + 1000)).toBe(false);
    });
  });

  it('fails CLOSED on an unparseable value rather than reading it as allow', () => {
    for (const junk of ['yes', 'true', 'soon', 'never', '2026-13-45', '-']) {
      expect(withValue(junk, () => sandboxAllowed())).toBe(false);
    }
  });

  it('does not misread a bare epoch as a year', () => {
    // Date.parse('1785758267000') would otherwise be nonsense; the digit check
    // has to win before Date.parse sees it.
    const until = Date.now() + DAY;
    expect(withValue(String(until), () => sandboxAllowed())).toBe(true);
  });
});

describe('sandboxExpiresAt', () => {
  it('is null for the boolean and unset forms', () => {
    expect(withValue(undefined, () => sandboxExpiresAt())).toBeNull();
    expect(withValue('1', () => sandboxExpiresAt())).toBeNull();
    expect(withValue('0', () => sandboxExpiresAt())).toBeNull();
  });

  it('returns the deadline for a dated window', () => {
    const until = new Date(Date.now() + 3 * DAY).toISOString();
    expect(withValue(until, () => sandboxExpiresAt())).toBe(Date.parse(until));
  });

  it('is null when the value cannot be parsed', () => {
    expect(withValue('whenever', () => sandboxExpiresAt())).toBeNull();
  });
});
