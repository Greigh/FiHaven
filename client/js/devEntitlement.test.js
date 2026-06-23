import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  entitlement,
  getDevEntitlement,
  setDevEntitlement,
  refreshEntitlement,
} from './storage.svelte.js';

// The dev-only "simulate a subscription state" override. setDevEntitlement
// persists the choice and re-resolves the entitlement; a synthetic state
// short-circuits the server call, while 'off' falls back to /api/billing/status.

describe('storage — dev entitlement override', () => {
  beforeEach(() => {
    localStorage.clear();
    setDevEntitlement('off'); // reset to a known baseline
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('defaults to "off" when nothing is stored', () => {
    localStorage.clear();
    expect(getDevEntitlement()).toBe('off');
  });

  it('persists and reads back a chosen state', async () => {
    await setDevEntitlement('active');
    expect(getDevEntitlement()).toBe('active');
  });

  it('"free" simulates a non-Pro account', async () => {
    await setDevEntitlement('free');
    expect(entitlement.pro).toBe(false);
    expect(entitlement.source).toBe('dev');
    expect(entitlement.expiresAt).toBe(null);
  });

  it('"active" is Pro with a future expiry', async () => {
    await setDevEntitlement('active');
    expect(entitlement.pro).toBe(true);
    expect(entitlement.source).toBe('dev');
    expect(entitlement.expiresAt).toBeGreaterThan(Date.now());
  });

  it('"expired" drops Pro and dates the expiry in the past', async () => {
    await setDevEntitlement('expired');
    expect(entitlement.pro).toBe(false);
    expect(entitlement.expiresAt).toBeLessThan(Date.now());
  });

  it('"grace" keeps Pro despite a just-passed expiry', async () => {
    await setDevEntitlement('grace');
    expect(entitlement.pro).toBe(true);
    expect(entitlement.expiresAt).toBeLessThan(Date.now());
  });

  it('"canceled" stays Pro until a future expiry', async () => {
    await setDevEntitlement('canceled');
    expect(entitlement.pro).toBe(true);
    expect(entitlement.expiresAt).toBeGreaterThan(Date.now());
  });

  it('a synthetic override never calls the billing API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ entitlement: { pro: false, source: 'server' } }),
    });
    await setDevEntitlement('active');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('"off" clears the override and uses the server entitlement', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ entitlement: { pro: true, source: 'stripe', plan: 'annual' } }),
    });
    await setDevEntitlement('off');
    expect(localStorage.getItem('fh_dev_entitlement')).toBe(null);
    expect(fetchSpy).toHaveBeenCalled();
    expect(entitlement.source).toBe('stripe');
    expect(entitlement.pro).toBe(true);
  });

  it('refreshEntitlement honors a stored override on its own', async () => {
    await setDevEntitlement('expired');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await refreshEntitlement();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(entitlement.pro).toBe(false);
  });
});
