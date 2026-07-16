import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

// Drives the real RewardsView "Report a wrong rate" flow (the rewards-link
// contribute flow moved to the card editor; this page now reports a wrong
// PRESET rate). Asserts the contract: the correction is POSTed to
// /api/feedback/reward-rate, and — when "also fix" is on — applied to the
// user's own card so rankings update immediately.

async function loadModules() {
  const storage = await import('../../client/js/storage.svelte.js');
  const RewardsView = (await import('../../client/svelte/RewardsView.svelte')).default;
  return { storage, RewardsView };
}

describe('integration — wrong-rate report flow', () => {
  let target;
  let component;
  let fetchMock;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    target = document.createElement('div');
    document.body.appendChild(target);
    fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }));
    vi.stubGlobal('fetch', fetchMock);
    window.AppAuth = { getCsrfToken: () => 'csrf-token' };
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  // Best card for the default category (Dining) so the report trigger renders.
  const CARD = {
    id: 'c1', name: 'Amex Gold', issuer: 'Amex', type: 'card', balance: 100, limit: 1000,
    rewardBase: 1, rewardCategories: { Dining: 4 }, perks: [], offers: [],
  };

  const text = () => target.textContent;
  const byText = (needle) => [...target.querySelectorAll('button')]
    .find((b) => b.textContent.trim().includes(needle));

  async function render(cards) {
    const { storage, RewardsView } = await loadModules();
    storage.setCards(cards);
    component = mount(RewardsView, { target });
    flushSync();
    return storage;
  }

  // Open the report sheet (prefills the best card + current category) and type a
  // corrected rate into the "Should be" input.
  function openAndFill(rate) {
    target.querySelector('.rw-report-link').click();
    flushSync();
    const input = target.querySelector('.rw-report-compare-input input');
    input.value = String(rate);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    return input;
  }

  it('opens the report sheet prefilled with the card and its current rate', async () => {
    await render([CARD]);
    target.querySelector('.rw-report-link').click();
    flushSync();

    expect(text()).toContain('Report a wrong rate');
    // "We show" reflects the card's current Dining rate.
    expect(target.querySelector('.rw-report-compare-value').textContent).toContain('4%');
  });

  it('reports a corrected rate and fixes the card locally', async () => {
    const storage = await render([CARD]);
    openAndFill(1);

    byText('Send report').click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/feedback/reward-rate');
    expect(opts.method).toBe('POST');
    expect(opts.headers['X-CSRF-Token']).toBe('csrf-token');
    expect(JSON.parse(opts.body)).toMatchObject({
      card: 'Amex Gold',
      issuer: 'Amex',
      category: 'Dining',
      ourRate: 4,
      correctRate: 1,
    });

    // "Also correct on my card" is on by default — the ranking data must update.
    expect(storage.cards[0].rewardCategories.Dining).toBe(1);
    expect(JSON.parse(localStorage.getItem('fh_cards'))[0].rewardCategories.Dining).toBe(1);
  });

  it('rejects an out-of-range rate without calling the server', async () => {
    await render([CARD]);
    openAndFill(150);

    byText('Send report').click();
    flushSync();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(text()).toContain('Enter a rate between 0 and 100');
  });

  it('with "also fix" unchecked, reports without touching the card', async () => {
    const storage = await render([CARD]);
    openAndFill(1);

    const alsoFix = target.querySelector('.rw-report-check input[type="checkbox"]');
    alsoFix.checked = false;
    alsoFix.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();

    byText('Send report').click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    // Reported, but the local card rate is left as-is.
    expect(storage.cards[0].rewardCategories.Dining).toBe(4);
  });

  it('shows the email disclosure with a privacy link', async () => {
    await render([CARD]);
    target.querySelector('.rw-report-link').click();
    flushSync();

    expect(text()).toContain('your email address to FiHaven');
    expect(target.querySelector('.rw-report-disclosure a')?.getAttribute('href')).toBe('/privacy');
  });
});
