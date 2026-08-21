import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * A page that imports the store but never bootstraps it must not sync.
 *
 * storage.svelte.js registers pagehide/visibilitychange/online listeners at
 * import time, and `flushLocalWrites` / `pullFromServer` flush on demand. Its
 * state arrays start empty, and `PUT /api/data` treats a sent `[]` as "clear
 * this list" — so on /settings, which imports the module for pullFromServer
 * and the dev-entitlement helpers but never calls bootstrapData(), any of
 * those paths used to PUT seven empty lists over a real account.
 */

const OWNER = 'a@test.com';

function seedRealAccount() {
  localStorage.setItem('fh_bills', JSON.stringify([{ id: 'a', name: 'Rent' }]));
  localStorage.setItem('fh_cards', JSON.stringify([{ id: 'c', name: 'Visa' }]));
  localStorage.setItem('fh_payments', '[]');
  localStorage.setItem('fh_accounts', '[]');
  localStorage.setItem('fh_goals', '[]');
  localStorage.setItem('fh_transactions', '[]');
  localStorage.setItem('fh_settings', '{"income":4000}');
  localStorage.setItem('fh_data_owner', OWNER);
}

/** Records every PUT body; answers GET with a populated account. */
function mockServer(puts) {
  globalThis.fetch = vi.fn((url, init) => {
    if (init && init.method === 'PUT') puts.push(JSON.parse(init.body));
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        email: OWNER,
        bills: [{ id: 'a', name: 'Rent' }],
        cards: [{ id: 'c', name: 'Visa' }],
        payments: [], accounts: [], goals: [], transactions: [],
        settings: { income: 4000 },
        entitlement: { pro: false },
      }),
    });
  });
}

describe('storage — an unbootstrapped page never pushes its empty state', () => {
  let realFetch;

  beforeEach(() => {
    realFetch = globalThis.fetch;
    localStorage.clear();
    window.AppAuth = { getCsrfToken: () => 'tok', me: () => Promise.resolve({ email: OWNER }) };
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    localStorage.clear();
    delete window.AppAuth;
  });

  it('does not wipe the account when a flush finds a pending marker', async () => {
    seedRealAccount();
    // The dashboard left a write owed to the server, then the user navigated
    // to /settings — a fresh module instance that never bootstraps.
    localStorage.setItem('fh_pending_sync', JSON.stringify({ owner: OWNER, at: Date.now() }));
    const puts = [];
    mockServer(puts);

    vi.resetModules();
    const store = await import('./storage.svelte.js');
    await store.flushLocalWrites();

    expect(puts).toEqual([]);
    // The edits are still owed — the next page that bootstraps replays them
    // from the cache, and callers can say why a sync was skipped.
    expect(store.syncBlockedReason()).toBe('pending');
  });

  it('does not wipe the account when the tab is hidden or closed', async () => {
    seedRealAccount();
    localStorage.setItem('fh_pending_sync', JSON.stringify({ owner: OWNER, at: Date.now() }));
    const puts = [];
    mockServer(puts);

    vi.resetModules();
    await import('./storage.svelte.js');

    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('online'));
    await Promise.resolve();

    expect(puts).toEqual([]);
  });

  it('still pushes once the page has actually loaded a dataset', async () => {
    seedRealAccount();
    const puts = [];
    mockServer(puts);

    vi.resetModules();
    const store = await import('./storage.svelte.js');
    await store.bootstrapData();          // hydrates from the mocked server
    store.bills.push({ id: 'b', name: 'Water' });
    store.save('fh_bills', store.bills);  // a real edit → scheduled sync
    await store.flushLocalWrites();

    expect(puts).toHaveLength(1);
    expect(puts[0].bills.map((b) => b.name)).toEqual(['Rent', 'Water']);
  });
});
