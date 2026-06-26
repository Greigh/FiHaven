import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

// Phase 2 — selective sharing: the shared per-entity store, edits with
// optimistic-concurrency, unshare/tombstones, and permissions.

describe('integration — household shared entities', () => {
  let ctx;
  let base;
  let server;

  beforeAll(async () => {
    ctx = createTestServer();
    ({ base, server } = await listen(ctx.app));
  });

  afterAll(() => {
    server?.close();
    ctx?.close();
  });

  async function makeUser(seed) {
    const email = `he-${seed}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const r = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'household1', loginStartedAt: Date.now() - 5000, captchaToken: 'test' }),
    });
    const session = await r.json();
    const cookie = cookieFrom(r.headers.get('set-cookie'));
    const db = ctx.db();
    const user = db.findUserByEmail(email);
    db.setEmailVerified(user.id, Date.now());
    return { id: user.id, email, cookie, csrf: session.csrfToken };
  }

  function grantPro(userId) {
    const db = ctx.db();
    const now = Date.now();
    db.upsertSubscription({
      user_id: userId, platform: 'comp', product_id: 'pro', txn_id: `test_${userId}`,
      status: 'active', expires_at: now + 365 * 86400000, environment: 'Test',
      auto_renew: 1, raw: null, created_at: now, updated_at: now,
    });
  }

  const J = (u, method, body) => ({
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': u.csrf, Cookie: u.cookie },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const GET = (u) => ({ headers: { Cookie: u.cookie } });
  const inviteToken = () => {
    const m = String(ctx.sentMail().at(-1).text || '').match(/household=([^\s&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  };

  // A couple sharing a household: returns { owner, partner }.
  async function couple(seed) {
    const owner = await makeUser(`${seed}-o`);
    grantPro(owner.id);
    await fetch(`${base}/api/household`, J(owner, 'POST', { name: 'Shared' }));
    const partner = await makeUser(`${seed}-p`);
    await fetch(`${base}/api/household/invite`, J(owner, 'POST', { email: partner.email }));
    await fetch(`${base}/api/household/accept`, J(partner, 'POST', { token: inviteToken() }));
    return { owner, partner };
  }

  it('rejects shared-data access for non-members', async () => {
    const loner = await makeUser('loner');
    const res = await fetch(`${base}/api/household/data`, GET(loner));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not-in-household');
  });

  it('shares an item that both members can see', async () => {
    const { owner, partner } = await couple('share');
    const bill = { id: 'b1', name: 'Rent', amount: 1500, dueDay: 1, frequency: 'Monthly' };

    const share = await fetch(`${base}/api/household/entities`, J(owner, 'POST', { kind: 'bill', item: bill }));
    expect(share.status).toBe(200);
    expect((await share.json()).entity.ownerUserId).toBe(owner.id);

    const partnerView = await (await fetch(`${base}/api/household/data`, GET(partner))).json();
    expect(partnerView.entities).toHaveLength(1);
    expect(partnerView.entities[0].data.name).toBe('Rent');
    expect(partnerView.version).toBeGreaterThan(0);
  });

  it('lets the other member edit a shared item, with conflict detection', async () => {
    const { owner, partner } = await couple('edit');
    await fetch(`${base}/api/household/entities`, J(owner, 'POST', { kind: 'bill', item: { id: 'b1', name: 'Power', amount: 80 } }));

    const snap = await (await fetch(`${base}/api/household/data`, GET(partner))).json();
    const base1 = snap.entities[0].updatedAt;

    const edit = await fetch(`${base}/api/household/entities/bill/b1`, J(partner, 'PUT', {
      item: { id: 'b1', name: 'Power', amount: 95 }, baseUpdatedAt: base1,
    }));
    expect(edit.status).toBe(200);
    const updated = (await edit.json()).entity;
    expect(updated.data.amount).toBe(95);
    expect(updated.updatedBy).toBe(partner.id);

    // A stale write (using the old base) is rejected.
    const stale = await fetch(`${base}/api/household/entities/bill/b1`, J(owner, 'PUT', {
      item: { id: 'b1', name: 'Power', amount: 70 }, baseUpdatedAt: base1,
    }));
    expect(stale.status).toBe(409);
    expect((await stale.json()).error).toBe('conflict');
  });

  it('enforces unshare permissions and tombstones the item', async () => {
    const { owner, partner } = await couple('del');
    await fetch(`${base}/api/household/entities`, J(owner, 'POST', { kind: 'goal', item: { id: 'g1', name: 'Vacation' } }));

    // Partner (not the contributor, not household owner) can't remove it.
    const denied = await fetch(`${base}/api/household/entities/goal/g1`, J(partner, 'DELETE'));
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe('not-allowed');

    // The contributor can.
    const ok = await fetch(`${base}/api/household/entities/goal/g1`, J(owner, 'DELETE'));
    expect(ok.status).toBe(200);

    const after = await (await fetch(`${base}/api/household/data`, GET(partner))).json();
    expect(after.entities).toHaveLength(0);
  });

  it('lets the household owner remove another member’s shared item', async () => {
    const { owner, partner } = await couple('ownerdel');
    await fetch(`${base}/api/household/entities`, J(partner, 'POST', { kind: 'card', item: { id: 'c1', name: 'Visa', balance: 200 } }));

    const ok = await fetch(`${base}/api/household/entities/card/c1`, J(owner, 'DELETE'));
    expect(ok.status).toBe(200);
    const after = await (await fetch(`${base}/api/household/data`, GET(owner))).json();
    expect(after.entities).toHaveLength(0);
  });

  it('round-trips selective-sharing preferences', async () => {
    const { partner } = await couple('prefs');
    const res = await fetch(`${base}/api/household/share-prefs`, J(partner, 'PUT', { prefs: { bills: true, cards: false } }));
    expect(res.status).toBe(200);
    expect((await res.json()).sharePrefs).toEqual({ bills: true, cards: false });

    const view = await (await fetch(`${base}/api/household`, GET(partner))).json();
    expect(view.household.sharePrefs).toEqual({ bills: true, cards: false });
  });
});
