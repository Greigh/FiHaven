import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

// Renders the real RewardsView and drives the new "rewards link" flow the way a
// user would: open the form, type a URL, press Save & send. Asserts both halves
// of the contract — the link is saved on the user's own card, and the volunteered
// copy is POSTed to /api/feedback/rewards-link — plus that the email disclosure
// is actually on screen.

async function loadModules() {
  const storage = await import('../../client/js/storage.svelte.js');
  const RewardsView = (await import('../../client/svelte/RewardsView.svelte')).default;
  return { storage, RewardsView };
}

describe('integration — rewards link contribute flow', () => {
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
    vi.stubGlobal('AppAuth', { getCsrfToken: () => 'csrf-token' });
    window.AppAuth = { getCsrfToken: () => 'csrf-token' };
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  async function render(cards) {
    const { storage, RewardsView } = await loadModules();
    storage.setCards(cards);
    component = mount(RewardsView, { target });
    flushSync();
    return storage;
  }

  const CARD = {
    id: 'c1', name: 'Amex Gold', type: 'card', balance: 100, limit: 1000,
    rewardBase: 1, rewardCategories: { Dining: 4 }, perks: [], offers: [],
  };

  const text = () => target.textContent;
  const byText = (needle) => [...target.querySelectorAll('button')]
    .find((b) => b.textContent.trim().includes(needle));

  it('shows the rewards-links panel with the email disclosure', async () => {
    await render([CARD]);
    expect(text()).toContain('Where to find your offers');
    expect(text()).toContain('Amex Gold');
    // The disclosure the privacy policy promises.
    expect(text()).toContain('emails the card name, the link, and your email address');
    expect(target.querySelector('.rw-disclosure a')?.getAttribute('href')).toBe('/privacy');
  });

  it('offers "Add rewards link" when the card has none', async () => {
    await render([CARD]);
    expect(byText('Add rewards link')).toBeTruthy();
    expect(byText('Change rewards link')).toBeFalsy();
    expect(target.querySelector('.rw-link-out')).toBeNull();
  });

  it('saves to the card and POSTs to /api/feedback/rewards-link', async () => {
    const storage = await render([CARD]);

    byText('Add rewards link').click();
    flushSync();

    const input = target.querySelector('.rw-linkform input');
    expect(input).toBeTruthy();
    input.value = 'https://americanexpress.com/offers';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    byText('Save & send').click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/feedback/rewards-link');
    expect(opts.method).toBe('POST');
    expect(opts.headers['X-CSRF-Token']).toBe('csrf-token');
    expect(JSON.parse(opts.body)).toEqual({
      name: 'Amex Gold',
      url: 'https://americanexpress.com/offers',
    });

    // The personal save is the part that must not be lost.
    expect(storage.cards[0].rewardsUrl).toBe('https://americanexpress.com/offers');
    expect(JSON.parse(localStorage.getItem('fh_cards'))[0].rewardsUrl)
      .toBe('https://americanexpress.com/offers');
  });

  it('rejects a non-http url without calling the server', async () => {
    await render([CARD]);
    byText('Add rewards link').click();
    flushSync();

    const input = target.querySelector('.rw-linkform input');
    input.value = 'not-a-url';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    byText('Save & send').click();
    flushSync();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(text()).toContain('Enter a full https:// link.');
  });

  it('a card that already has a link shows "Open offers" and "Change"', async () => {
    await render([{ ...CARD, rewardsUrl: 'https://example.com/offers' }]);
    expect(byText('Change rewards link')).toBeTruthy();
    const out = target.querySelector('.rw-link-out');
    expect(out?.getAttribute('href')).toBe('https://example.com/offers');
  });

  it('a survived server failure still keeps the card save', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const storage = await render([CARD]);

    byText('Add rewards link').click();
    flushSync();
    const input = target.querySelector('.rw-linkform input');
    input.value = 'https://example.com/offers';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    byText('Save & send').click();

    await vi.waitFor(() => expect(storage.cards[0].rewardsUrl).toBe('https://example.com/offers'));
  });
});
