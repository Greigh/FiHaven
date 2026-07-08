import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// plaid.js reads process.env on every call, so we can swap vars per test.
const PLAID_VARS = [
  'PLAID_ENV',
  'PLAID_SECRET',
  'PLAID_SANDBOX_SECRET',
  'PLAID_PRODUCTION_SECRET',
  'PLAID_CLIENT_ID',
  'PLAID_SANDBOX_CLIENT_ID',
  'PLAID_PRODUCTION_CLIENT_ID',
];

let saved;
let plaid;

beforeEach(() => {
  saved = {};
  for (const k of PLAID_VARS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  plaid = require('./plaid.js');
});

afterEach(() => {
  for (const k of PLAID_VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('plaidEnv', () => {
  it('defaults to sandbox', () => {
    expect(plaid.plaidEnv()).toBe('sandbox');
  });

  it('honors production', () => {
    process.env.PLAID_ENV = 'PRODUCTION';
    expect(plaid.plaidEnv()).toBe('production');
  });

  it('falls back to sandbox for the retired development env', () => {
    process.env.PLAID_ENV = 'development';
    expect(plaid.plaidEnv()).toBe('sandbox');
  });
});

describe('plaidSecret — the env-specific secret wins', () => {
  // Regression: a stale generic PLAID_SECRET left over from sandbox used to
  // shadow PLAID_PRODUCTION_SECRET, so every production call to Plaid failed
  // INVALID_API_KEYS and the clients showed "Could not start linking."
  it('prefers PLAID_PRODUCTION_SECRET over a generic PLAID_SECRET in production', () => {
    process.env.PLAID_ENV = 'production';
    process.env.PLAID_SECRET = 'stale-sandbox-key';
    process.env.PLAID_PRODUCTION_SECRET = 'live-key';
    expect(plaid.plaidSecret()).toBe('live-key');
  });

  it('prefers PLAID_SANDBOX_SECRET over a generic PLAID_SECRET in sandbox', () => {
    process.env.PLAID_ENV = 'sandbox';
    process.env.PLAID_SECRET = 'generic-key';
    process.env.PLAID_SANDBOX_SECRET = 'sandbox-key';
    expect(plaid.plaidSecret()).toBe('sandbox-key');
  });

  it('falls back to the generic PLAID_SECRET when no env-specific one is set', () => {
    process.env.PLAID_ENV = 'production';
    process.env.PLAID_SECRET = 'only-key';
    expect(plaid.plaidSecret()).toBe('only-key');

    process.env.PLAID_ENV = 'sandbox';
    expect(plaid.plaidSecret()).toBe('only-key');
  });

  it('never crosses environments', () => {
    process.env.PLAID_ENV = 'production';
    process.env.PLAID_SANDBOX_SECRET = 'sandbox-key';
    expect(plaid.plaidSecret()).toBe('');

    process.env.PLAID_ENV = 'sandbox';
    delete process.env.PLAID_SANDBOX_SECRET;
    process.env.PLAID_PRODUCTION_SECRET = 'live-key';
    expect(plaid.plaidSecret()).toBe('');
  });

  it('returns empty when nothing is set', () => {
    expect(plaid.plaidSecret()).toBe('');
  });
});

describe('plaidClientId', () => {
  it('accepts the generic name or either env-specific one', () => {
    process.env.PLAID_CLIENT_ID = 'generic';
    expect(plaid.plaidClientId()).toBe('generic');

    delete process.env.PLAID_CLIENT_ID;
    process.env.PLAID_SANDBOX_CLIENT_ID = 'sandbox';
    expect(plaid.plaidClientId()).toBe('sandbox');

    delete process.env.PLAID_SANDBOX_CLIENT_ID;
    process.env.PLAID_PRODUCTION_CLIENT_ID = 'prod';
    expect(plaid.plaidClientId()).toBe('prod');
  });
});

describe('plaidConfigured', () => {
  it('needs both a client id and a secret for the active env', () => {
    expect(plaid.plaidConfigured()).toBe(false);

    process.env.PLAID_CLIENT_ID = 'id';
    expect(plaid.plaidConfigured()).toBe(false);

    // A production secret does not configure a sandbox deployment.
    process.env.PLAID_ENV = 'sandbox';
    process.env.PLAID_PRODUCTION_SECRET = 'live-key';
    expect(plaid.plaidConfigured()).toBe(false);

    process.env.PLAID_SANDBOX_SECRET = 'sandbox-key';
    expect(plaid.plaidConfigured()).toBe(true);
  });
});
