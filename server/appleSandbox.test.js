/* Store-review acceptance windows and the sandbox build pin.
 *
 * Sandbox StoreKit transactions carry the same production signing chain as
 * real ones, and Play license-tester purchases come back through the ordinary
 * API, so accepting either means a tester account can mint real Pro. App
 * Review and TestFlight both buy this way, though, so neither can simply be
 * refused. Two resolutions, both of which only help if they really do close:
 * a window that shuts by itself, and a pin to the build actually under review.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const serverDir = path.dirname(fileURLToPath(import.meta.url));

process.env.FIHAVEN_TEST_DB_PATH =
  process.env.FIHAVEN_TEST_DB_PATH || path.join(serverDir, '..', 'data', 'test-apple-sandbox.db');

const billing = require(path.join(serverDir, 'billing.js'));
const googlePlay = require(path.join(serverDir, 'googlePlay.js'));
const {
  sandboxAllowed,
  sandboxExpiresAt,
  testPurchasesAllowed,
  testPurchasesExpireAt,
  reviewBuildMatches,
} = billing;

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

/* ── Play license-tester window ────────────────────────────────── */

describe('testPurchasesAllowed', () => {
  let savedGoogle;
  beforeEach(() => { savedGoogle = process.env.GOOGLE_ALLOW_TEST_PURCHASES; });
  afterEach(() => {
    if (savedGoogle === undefined) delete process.env.GOOGLE_ALLOW_TEST_PURCHASES;
    else process.env.GOOGLE_ALLOW_TEST_PURCHASES = savedGoogle;
  });

  function withGoogle(v, fn) {
    if (v === undefined) delete process.env.GOOGLE_ALLOW_TEST_PURCHASES;
    else process.env.GOOGLE_ALLOW_TEST_PURCHASES = v;
    return fn();
  }

  // Play's window shares Apple's parser, so this asserts the behaviour that
  // matters rather than re-testing every form: closed by default, dated,
  // self-shutting, and independent of the Apple var.
  it('rejects when unset', () => {
    expect(withGoogle(undefined, () => testPurchasesAllowed())).toBe(false);
  });

  it('opens and shuts on its own deadline', () => {
    const iso = new Date(Date.now() + 5 * DAY).toISOString();
    const until = Date.parse(iso);
    withGoogle(iso, () => {
      expect(testPurchasesAllowed(until - DAY)).toBe(true);
      expect(testPurchasesAllowed(until + DAY)).toBe(false);
      expect(testPurchasesExpireAt()).toBe(until);
    });
  });

  it('fails closed on junk', () => {
    expect(withGoogle('sure', () => testPurchasesAllowed())).toBe(false);
  });

  it('is not opened by the Apple window', () => {
    withValue('1', () => {
      expect(withGoogle(undefined, () => testPurchasesAllowed())).toBe(false);
    });
  });
});

describe('verifyGoogle test purchases', () => {
  const saved = {};
  let realFetch;

  beforeEach(() => {
    for (const k of ['IAP_VERIFY_MODE', 'GOOGLE_VERIFY_ENABLED', 'GOOGLE_ALLOW_TEST_PURCHASES']) {
      saved[k] = process.env[k];
    }
    process.env.IAP_VERIFY_MODE = 'production';
    process.env.GOOGLE_VERIFY_ENABLED = '1';
    realFetch = googlePlay.fetchSubscription;
  });
  afterEach(() => {
    googlePlay.fetchSubscription = realFetch;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  function stubPlay({ test }) {
    googlePlay.fetchSubscription = async () => ({
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      lineItems: [{ productId: 'app.fihaven.pro.yearly', expiryTime: '2030-01-01T00:00:00Z' }],
      ...(test ? { testPurchase: {} } : {}),
    });
  }

  const call = () => billing.verifyGoogle({
    productId: 'app.fihaven.pro.yearly',
    purchaseToken: 'tok',
  });

  it('rejects a license-tester purchase while the window is shut', async () => {
    delete process.env.GOOGLE_ALLOW_TEST_PURCHASES;
    stubPlay({ test: true });
    // Must survive the catch-all that turns Play errors into 'verify-failed',
    // or the tester is sent hunting a bug that isn't there.
    await expect(call()).rejects.toThrow('google-test-purchase-rejected');
  });

  it('accepts one while the window is open, and records it as Sandbox', async () => {
    process.env.GOOGLE_ALLOW_TEST_PURCHASES = new Date(Date.now() + DAY).toISOString();
    stubPlay({ test: true });
    await expect(call()).resolves.toMatchObject({ environment: 'Sandbox' });
  });

  it('leaves real purchases alone whether the window is open or shut', async () => {
    stubPlay({ test: false });
    delete process.env.GOOGLE_ALLOW_TEST_PURCHASES;
    await expect(call()).resolves.toMatchObject({ environment: 'Production' });
  });
});

/* ── Sandbox build pin ─────────────────────────────────────────── */

describe('reviewBuildMatches', () => {
  const saved = {};
  beforeEach(() => {
    for (const k of ['APPLE_SANDBOX_BUILD', 'APPLE_BUNDLE_ID']) saved[k] = process.env[k];
    process.env.APPLE_SANDBOX_BUILD = '22,1.6.1';
    process.env.APPLE_BUNDLE_ID = 'app.fihaven';
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const app = (over = {}) => ({
    bundleId: 'app.fihaven',
    receiptType: 'Sandbox',
    applicationVersion: '22',
    ...over,
  });

  it('matches the build the deploy stamped', () => {
    expect(reviewBuildMatches(app())).toBe(true);
  });

  it('accepts either spelling Apple might use for the fields', () => {
    // Apple's JSON says receiptType/applicationVersion; StoreKit's Swift type
    // says environment/appVersion. Betting on one would risk App Review.
    expect(reviewBuildMatches({
      bundleId: 'app.fihaven', environment: 'Sandbox', appVersion: '22',
    })).toBe(true);
  });

  it('accepts the marketing version too, since sandbox vs production differ', () => {
    expect(reviewBuildMatches(app({ applicationVersion: '1.6.1' }))).toBe(true);
  });

  it('rejects the previous release once a new build is stamped', () => {
    expect(reviewBuildMatches(app({ applicationVersion: '21' }))).toBe(false);
  });

  it('accepts a NEWER build than the one stamped', () => {
    // The deploy reads project.yml and the iOS deploy rewrites it, so deploying
    // web first stamps the old number. Exact matching turned that ordinary
    // ordering slip into an App Review rejection; "or newer" cannot.
    expect(reviewBuildMatches(app({ applicationVersion: '23' }))).toBe(true);
    expect(reviewBuildMatches(app({ applicationVersion: '400' }))).toBe(true);
  });

  it('does not let "or newer" leak across marketing versions', () => {
    // Only build numbers compare numerically; a marketing string must match
    // exactly, or 1.6.1 would quietly accept every later release forever.
    expect(reviewBuildMatches(app({ applicationVersion: '1.6.2' }))).toBe(false);
    expect(reviewBuildMatches(app({ applicationVersion: '1.7' }))).toBe(false);
  });

  it('rejects an empty or missing version rather than treating it as a match', () => {
    expect(reviewBuildMatches(app({ applicationVersion: '' }))).toBe(false);
    expect(reviewBuildMatches({ bundleId: 'app.fihaven', receiptType: 'Sandbox' })).toBe(false);
  });

  it('rejects another app, even signed by Apple with a matching build', () => {
    expect(reviewBuildMatches(app({ bundleId: 'com.someone.else' }))).toBe(false);
  });

  it('refuses to let a PRODUCTION app transaction justify a sandbox purchase', () => {
    expect(reviewBuildMatches(app({ receiptType: 'Production' }))).toBe(false);
  });

  it('rejects a missing app transaction — older builds simply forfeit the pin', () => {
    expect(reviewBuildMatches(null)).toBe(false);
    expect(reviewBuildMatches(undefined)).toBe(false);
  });

  it('is inert when no build is stamped', () => {
    delete process.env.APPLE_SANDBOX_BUILD;
    expect(reviewBuildMatches(app())).toBe(false);
  });
});
