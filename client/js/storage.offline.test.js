import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bootstrapData, bills } from './storage.svelte.js';
import { markPending, hasPendingFor, clearPending } from './pendingSync.js';

/**
 * Offline-first, the part that actually loses data when it's missing.
 *
 * `PUT /api/data` replaces the whole blob and the server keeps no version,
 * so the only thing standing between an edit made offline and silent
 * deletion is bootstrapData() knowing not to adopt the server copy. Before
 * the pending marker existed, the sequence below ended with the offline
 * bill gone: it was written to localStorage, never reached the server, and
 * the next successful boot overwrote the cache with the server's older
 * snapshot.
 */

const OWNER = 'a@test.com';

function seedCache(billsArr) {
  localStorage.setItem('fh_bills', JSON.stringify(billsArr));
  localStorage.setItem('fh_cards', '[]');
  localStorage.setItem('fh_payments', '[]');
  localStorage.setItem('fh_accounts', '[]');
  localStorage.setItem('fh_goals', '[]');
  localStorage.setItem('fh_transactions', '[]');
  localStorage.setItem('fh_settings', '{"income":0}');
  localStorage.setItem('fh_data_owner', OWNER);
}

/** A GET /api/data response, plus a recording PUT stub. */
function mockServer(serverBills) {
  const calls = [];
  globalThis.fetch = vi.fn((url, init) => {
    calls.push({ url: String(url), method: (init && init.method) || 'GET' });
    if (init && init.method === 'PUT') {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        email: OWNER,
        bills: serverBills,
        cards: [], payments: [], accounts: [], goals: [], transactions: [],
        settings: { income: 0 },
        entitlement: { pro: false },
      }),
    });
  });
  return calls;
}

describe('storage — offline edits are not lost on the next boot', () => {
  let realFetch;

  beforeEach(() => {
    realFetch = globalThis.fetch;
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = realFetch;
    localStorage.clear();
  });

  it('keeps the cached copy and re-pushes it when a write is still pending', async () => {
    seedCache([{ id: '1', name: 'Rent' }, { id: '2', name: 'Added while offline' }]);
    markPending(OWNER);
    const calls = mockServer([{ id: '1', name: 'Rent' }]); // server never got bill 2

    await bootstrapData();

    // The offline bill survived rather than being replaced by the server copy.
    expect(bills.map((b) => b.name)).toContain('Added while offline');
    expect(bills).toHaveLength(2);

    // ...and a push was scheduled to get it to the server.
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls.some((c) => c.method === 'PUT')).toBe(true);
  });

  it('clears the pending marker once the server accepts the write', async () => {
    seedCache([{ id: '2', name: 'Added while offline' }]);
    markPending(OWNER);
    mockServer([]);

    await bootstrapData();
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    expect(hasPendingFor(OWNER)).toBe(false);
  });

  it('adopts the server copy when nothing is pending', async () => {
    // The normal path must stay normal: without pending edits the server is
    // authoritative, so a record deleted on another device stays deleted.
    seedCache([{ id: '1', name: 'Rent' }, { id: '9', name: 'Deleted elsewhere' }]);
    clearPending();
    mockServer([{ id: '1', name: 'Rent' }]);

    await bootstrapData();

    expect(bills.map((b) => b.name)).toEqual(['Rent']);
  });

  it('falls back to the cache and keeps the marker when the server is unreachable', async () => {
    seedCache([{ id: '2', name: 'Added while offline' }]);
    markPending(OWNER);
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network')));

    await bootstrapData();

    expect(bills.map((b) => b.name)).toEqual(['Added while offline']);
    // Still unsynced — dropping the marker here would strand the edit.
    expect(hasPendingFor(OWNER)).toBe(true);
  });
});
