import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  entitlement,
  getDevEntitlement,
  setDevEntitlement,
  refreshEntitlement,
  applyEntitlement,
} from './storage.svelte.js';

// The dev-only "simulate a subscription state" override. localStorage is
// attacker-controlled, so the override is honored only when the server's
// payload says the caller is an admin; for anyone else it is ignored and the
// stored value erased. refreshEntitlement() therefore always asks the server.

const SERVER_FREE = { pro: false, source: 'server', plan: null, expiresAt: null };
const SERVER_PRO = { pro: true, source: 'stripe', plan: 'annual', expiresAt: Date.now() + 1000 };

// Mock GET /api/billing/status.
function mockStatus({ admin, ent = SERVER_FREE }) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ entitlement: ent, admin }),
  });
}

describe('storage — dev entitlement override', () => {
  beforeEach(() => {
    localStorage.clear();
    applyEntitlement({ entitlement: SERVER_FREE, admin: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('defaults to "off" when nothing is stored', () => {
    expect(getDevEntitlement()).toBe('off');
  });

  it('persists and reads back a chosen state', async () => {
    mockStatus({ admin: true });
    await setDevEntitlement('active');
    expect(getDevEntitlement()).toBe('active');
  });

  /* ── The simulated states, as an admin ──────────────────── */

  it('"free" simulates a non-Pro account', async () => {
    mockStatus({ admin: true, ent: SERVER_PRO });
    await setDevEntitlement('free');
    expect(entitlement.pro).toBe(false);
    expect(entitlement.source).toBe('dev');
    expect(entitlement.expiresAt).toBe(null);
  });

  it('"active" is Pro with a future expiry', async () => {
    mockStatus({ admin: true });
    await setDevEntitlement('active');
    expect(entitlement.pro).toBe(true);
    expect(entitlement.source).toBe('dev');
    expect(entitlement.expiresAt).toBeGreaterThan(Date.now());
  });

  it('"expired" drops Pro and dates the expiry in the past', async () => {
    mockStatus({ admin: true });
    await setDevEntitlement('expired');
    expect(entitlement.pro).toBe(false);
    expect(entitlement.expiresAt).toBeLessThan(Date.now());
  });

  it('"grace" keeps Pro despite a just-passed expiry', async () => {
    mockStatus({ admin: true });
    await setDevEntitlement('grace');
    expect(entitlement.pro).toBe(true);
    expect(entitlement.expiresAt).toBeLessThan(Date.now());
  });

  it('"canceled" stays Pro until a future expiry', async () => {
    mockStatus({ admin: true });
    await setDevEntitlement('canceled');
    expect(entitlement.pro).toBe(true);
    expect(entitlement.expiresAt).toBeGreaterThan(Date.now());
  });

  it('"off" clears the override and uses the server entitlement', async () => {
    const fetchSpy = mockStatus({ admin: true, ent: SERVER_PRO });
    await setDevEntitlement('off');
    expect(localStorage.getItem('fh_dev_entitlement')).toBe(null);
    expect(fetchSpy).toHaveBeenCalled();
    expect(entitlement.source).toBe('stripe');
    expect(entitlement.pro).toBe(true);
  });

  /* ── The admin gate ─────────────────────────────────────── */

  it('ignores a hand-planted override for a non-admin', async () => {
    localStorage.setItem('fh_dev_entitlement', 'active');
    mockStatus({ admin: false, ent: SERVER_FREE });
    await refreshEntitlement();
    expect(entitlement.pro).toBe(false);
    expect(entitlement.source).toBe('server');
  });

  it('erases a hand-planted override for a non-admin', async () => {
    localStorage.setItem('fh_dev_entitlement', 'active');
    mockStatus({ admin: false });
    await refreshEntitlement();
    expect(localStorage.getItem('fh_dev_entitlement')).toBe(null);
  });

  it('ignores a hand-planted override on the /api/data boot path too', () => {
    localStorage.setItem('fh_dev_entitlement', 'active');
    applyEntitlement({ entitlement: SERVER_FREE, admin: false });
    expect(entitlement.pro).toBe(false);
    expect(localStorage.getItem('fh_dev_entitlement')).toBe(null);
  });

  it('honors the override on the /api/data boot path for an admin', () => {
    localStorage.setItem('fh_dev_entitlement', 'active');
    applyEntitlement({ entitlement: SERVER_FREE, admin: true });
    expect(entitlement.pro).toBe(true);
    expect(entitlement.source).toBe('dev');
  });

  it('treats a missing admin field as not-admin', () => {
    localStorage.setItem('fh_dev_entitlement', 'active');
    applyEntitlement({ entitlement: SERVER_FREE });
    expect(entitlement.pro).toBe(false);
  });

  it('always asks the server, so an override can never skip the admin check', async () => {
    localStorage.setItem('fh_dev_entitlement', 'active');
    const fetchSpy = mockStatus({ admin: false });
    await refreshEntitlement();
    expect(fetchSpy).toHaveBeenCalledWith('/api/billing/status', { credentials: 'same-origin' });
  });

  it('does not self-upgrade when the status call fails', async () => {
    localStorage.setItem('fh_dev_entitlement', 'active');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await refreshEntitlement();
    expect(entitlement.pro).toBe(false);
  });
});
