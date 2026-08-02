// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initHousehold } from './household.js';

// A household whose owner's Family plan lapsed renders read-only: everything
// already shared stays on screen, but the paths the server now refuses
// (inviting, sharing something new) are taken off the page rather than left
// there to fail. Unshare stays — the server still honors it.

const VIEW = {
  household: { id: 1, name: 'Frozen house', ownerUserId: 7, createdAt: 1 },
  role: 'owner', memberCount: 2, memberMax: 0, active: false,
  members: [
    { userId: 7, email: 'me@test.com', name: 'Me', role: 'owner', joinedAt: 1 },
    { userId: 8, email: 'them@test.com', name: 'Them', role: 'member', joinedAt: 2 },
  ],
  pendingInvites: [{ id: 3, email: 'pending@test.com', createdAt: 1, expiresAt: 9 }],
};

async function render(view) {
  document.body.innerHTML = '<div data-household-root></div>';
  window.AppAuth = { getCsrfToken: () => 'x', me: () => Promise.resolve({ email: 'me@test.com' }) };
  global.fetch = vi.fn((url) => {
    const body =
      String(url).includes('/api/household/data')
        ? { entities: [{ id: 'b1', kind: 'bill', data: { id: 'b1', name: 'Rent', amount: 1200 }, ownerUserId: 7, updatedAt: 5 }], seq: 1 }
        : String(url).includes('/api/data')
          ? { bills: [{ id: 'b9', name: 'Unshared bill', amount: 50 }], settings: { currency: 'USD' } }
          : { household: view, canCreate: false, memberMax: view.memberMax };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  });
  initHousehold({ email: 'me@test.com' });
  await new Promise((r) => setTimeout(r, 80));
  return document.querySelector('[data-household-root]').innerHTML;
}

describe('frozen household smoke', () => {
  it('renders read-only, keeps shared items, drops the invite box', async () => {
    document.body.innerHTML = '<div data-household-root></div>';
    window.AppAuth = { getCsrfToken: () => 'x', me: () => Promise.resolve({ email: 'me@test.com' }) };
    global.fetch = vi.fn((url) => {
      const body =
        String(url).includes('/api/household/data')
          ? { entities: [{ id: 'b1', kind: 'bill', data: { id: 'b1', name: 'Rent', amount: 1200 }, ownerUserId: 7, updatedAt: 5 }], seq: 1 }
          : String(url).includes('/api/data')
            ? { bills: [{ id: 'b9', name: 'Unshared bill', amount: 50 }], settings: { currency: 'USD' } }
            : { household: VIEW, canCreate: false, memberMax: 0 };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    });

    initHousehold({ email: 'me@test.com' });
    await new Promise((r) => setTimeout(r, 80));

    const html = document.querySelector('[data-household-root]').innerHTML;
    expect(html).toContain('Read-only — your Family plan ended');
    expect(html).toContain('nothing has been deleted');
    expect(html).toContain('Rent');                    // shared data still shown
    expect(html).toContain('Them · them@test.com');    // members still listed
    expect(html).not.toContain('hh-invite-email');     // invite box gone
    expect(html).toContain('Unshare');                 // pulling out still offered
    expect(html).not.toContain('data-hh-pick');        // sharing picker gone
    expect(html).not.toContain('Unshared bill');       // ...and its options with it
    // Revoking a pending invite still works server-side, so it must stay on
    // screen — an owner needs to clean up links that can't be accepted.
    expect(html).toContain('pending@test.com');
    expect(html).toContain('data-hh-revoke="3"');
  });

  it('tells a member the OWNER has to resubscribe, and offers them no button', async () => {
    // The cap follows the owner's entitlement, so a member buying a plan would
    // not thaw the household — pointing them at checkout would be wrong.
    const html = await render(Object.assign({}, VIEW, { role: 'member' }));
    expect(html).toContain('the household owner’s Family plan ended');
    expect(html).toContain('until the owner resubscribes');
    expect(html).not.toContain('data-hh-resub');
    expect(html).toContain('the owner’s Family plan is lapsed');
    expect(html).toContain('Rent');                    // still reads everything
  });

  it('leaves an active household completely alone', async () => {
    const html = await render(Object.assign({}, VIEW, { active: true, memberMax: 3 }));
    expect(html).not.toContain('Read-only');
    expect(html).toContain('hh-invite-email');
    expect(html).toContain('data-hh-pick');
    expect(html).toContain('Unshared bill');
  });

  it('treats a payload with no `active` field as active', async () => {
    // Older servers don't send it; only an explicit false may freeze the UI.
    const legacy = Object.assign({}, VIEW, { memberMax: 3 });
    delete legacy.active;
    const html = await render(legacy);
    expect(html).not.toContain('Read-only');
    expect(html).toContain('hh-invite-email');
  });
});
