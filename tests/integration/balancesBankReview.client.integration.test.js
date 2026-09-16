import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

async function loadModules() {
  const storage = await import('../../client/js/storage.svelte.js');
  const BalancesView = (await import('../../client/svelte/BalancesView.svelte')).default;
  return { storage, BalancesView };
}

describe('integration — Account Balances bank sync review section', () => {
  let target;
  let component;
  let storage;
  let BalancesView;

  beforeEach(async () => {
    localStorage.clear();
    document.body.innerHTML = '';
    target = document.createElement('div');
    document.body.appendChild(target);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    })));
    window.AppAuth = { getCsrfToken: () => 'csrf-token' };

    const mods = await loadModules();
    storage = mods.storage;
    BalancesView = mods.BalancesView;
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('omits the bank sync review section when there are no pending proposals', () => {
    storage.setAccounts([
      { id: 'acct-1', name: 'Checking', type: 'checking', balance: 1000 },
    ]);
    storage.setSettings({ income: 0, plaidAccountProposals: [], plaidBalanceResolved: [] });

    component = mount(BalancesView, { target });
    flushSync();

    const review = target.querySelector('#bank-sync-review');
    expect(review).toBeNull();
  });

  it('renders the bank sync review section when pending proposals exist', () => {
    storage.setAccounts([
      { id: 'acct-1', name: 'Primary Checking', type: 'checking', balance: 1000 },
    ]);
    storage.setSettings({
      income: 0,
      plaidAccountProposals: [
        { id: 'acct-1', proposedBalance: 1250, fingerprint: 'acct:acct-1:1250.00' },
      ],
      plaidBalanceResolved: [],
    });

    component = mount(BalancesView, { target });
    flushSync();

    const review = target.querySelector('#bank-sync-review');
    expect(review).not.toBeNull();
    expect(review.querySelector('.recon-head').textContent).toContain('Bank sync review');

    const row = review.querySelector('.recon-row[data-account-id="acct-1"]');
    expect(row).not.toBeNull();
    expect(row.querySelector('strong').textContent).toBe('Primary Checking');
    expect(row.textContent).toContain('$1,000');
    expect(row.textContent).toContain('$1,250');

    const acceptBtn = row.querySelector('button.btn-primary');
    const declineBtn = row.querySelector('button.btn-ghost');
    expect(acceptBtn.textContent).toBe('Accept');
    expect(declineBtn.textContent).toBe('Decline');
  });

  it('accepts a proposed balance: updates account amount and removes proposal section', () => {
    storage.setAccounts([
      { id: 'acct-1', name: 'Primary Checking', type: 'checking', balance: 1000 },
    ]);
    storage.setSettings({
      income: 0,
      plaidAccountProposals: [
        { id: 'acct-1', proposedBalance: 1250, fingerprint: 'acct:acct-1:1250.00' },
      ],
      plaidBalanceResolved: [],
    });

    component = mount(BalancesView, { target });
    flushSync();

    const acceptBtn = target.querySelector('#bank-sync-review .recon-row button.btn-primary');
    acceptBtn.click();
    flushSync();

    // The account's balance in storage is updated to 1250
    const acct = storage.accounts.find((a) => a.id === 'acct-1');
    expect(acct.balance).toBe(1250);

    // Proposal is removed and resolved memory is recorded
    expect(storage.settings.plaidAccountProposals).toHaveLength(0);
    expect(storage.settings.plaidBalanceResolved).toEqual(
      expect.arrayContaining([expect.objectContaining({ fingerprint: 'acct:acct-1:1250.00', decision: 'accept' })])
    );

    // Review section is now cleanly hidden
    expect(target.querySelector('#bank-sync-review')).toBeNull();
  });

  it('declines a proposed balance: keeps existing amount and removes proposal section', () => {
    storage.setAccounts([
      { id: 'acct-1', name: 'Primary Checking', type: 'checking', balance: 1000 },
    ]);
    storage.setSettings({
      income: 0,
      plaidAccountProposals: [
        { id: 'acct-1', proposedBalance: 1250, fingerprint: 'acct:acct-1:1250.00' },
      ],
      plaidBalanceResolved: [],
    });

    component = mount(BalancesView, { target });
    flushSync();

    const declineBtn = target.querySelector('#bank-sync-review .recon-row button.btn-ghost');
    declineBtn.click();
    flushSync();

    // Balance remains 1000
    const acct = storage.accounts.find((a) => a.id === 'acct-1');
    expect(acct.balance).toBe(1000);

    // Proposal is removed and decision recorded as decline
    expect(storage.settings.plaidAccountProposals).toHaveLength(0);
    expect(storage.settings.plaidBalanceResolved).toEqual(
      expect.arrayContaining([expect.objectContaining({ fingerprint: 'acct:acct-1:1250.00', decision: 'decline' })])
    );

    // Review section is gone
    expect(target.querySelector('#bank-sync-review')).toBeNull();
  });

  it('shows Accept all and Decline all for multiple proposals and bulk accepts', () => {
    storage.setAccounts([
      { id: 'acct-1', name: 'Checking', type: 'checking', balance: 1000 },
      { id: 'acct-2', name: 'Savings', type: 'savings', balance: 5000 },
    ]);
    storage.setSettings({
      income: 0,
      plaidAccountProposals: [
        { id: 'acct-1', proposedBalance: 1100, fingerprint: 'acct:acct-1:1100.00' },
        { id: 'acct-2', proposedBalance: 5200, fingerprint: 'acct:acct-2:5200.00' },
      ],
      plaidBalanceResolved: [],
    });

    component = mount(BalancesView, { target });
    flushSync();

    const review = target.querySelector('#bank-sync-review');
    expect(review.querySelectorAll('.recon-row')).toHaveLength(2);

    // Find "Accept all" button
    const buttons = Array.from(review.querySelectorAll('button'));
    const acceptAllBtn = buttons.find((b) => b.textContent.trim() === 'Accept all');
    const declineAllBtn = buttons.find((b) => b.textContent.trim() === 'Decline all');
    expect(acceptAllBtn).toBeDefined();
    expect(declineAllBtn).toBeDefined();

    acceptAllBtn.click();
    flushSync();

    expect(storage.accounts.find((a) => a.id === 'acct-1').balance).toBe(1100);
    expect(storage.accounts.find((a) => a.id === 'acct-2').balance).toBe(5200);
    expect(target.querySelector('#bank-sync-review')).toBeNull();
  });
});
