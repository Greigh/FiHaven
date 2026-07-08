import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

// End-to-end household (couples / families) flows: Family-plan gating,
// invite + accept, member-cap enforcement, and leave/transfer.

describe('integration — shared households', () => {
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

  // Sign up + verify a fresh account; returns { id, email, cookie, csrf }.
  async function makeUser(seed) {
    const email = `hh-${seed}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
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

  function grantFamily(userId) {
    const db = ctx.db();
    const now = Date.now();
    db.upsertSubscription({
      user_id: userId, platform: 'comp', product_id: 'app.fihaven.pro.family', txn_id: `test_${userId}`,
      status: 'active', expires_at: now + 365 * 86400000, environment: 'Test',
      auto_renew: 1, raw: null, created_at: now, updated_at: now,
    });
  }

  const J = (u, method, body) => ({
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': u.csrf, Cookie: u.cookie },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  // Pull the latest invite token out of the captured email link.
  function latestInviteToken() {
    const msg = ctx.sentMail().at(-1);
    const m = String(msg.text || '').match(/household=([^\s&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  it('requires the Family plan to create a household, then creates one', async () => {
    const owner = await makeUser('owner');

    const denied = await fetch(`${base}/api/household`, J(owner, 'POST', { name: 'Smith Family' }));
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe('pro-required');

    grantFamily(owner.id);

    const ok = await fetch(`${base}/api/household`, J(owner, 'POST', { name: 'Smith Family' }));
    expect(ok.status).toBe(200);
    const view = (await ok.json()).household;
    expect(view.household.name).toBe('Smith Family');
    expect(view.role).toBe('owner');
    expect(view.memberCount).toBe(1);
    expect(view.memberMax).toBe(3); // base Pro cap
  });

  it('invites a member who accepts, and both see the household', async () => {
    const owner = await makeUser('owner2');
    grantFamily(owner.id);
    await fetch(`${base}/api/household`, J(owner, 'POST', { name: 'Casa' }));

    const partner = await makeUser('partner');
    const inv = await fetch(`${base}/api/household/invite`, J(owner, 'POST', { email: partner.email }));
    expect(inv.status).toBe(200);
    expect((await inv.json()).emailed).toBe(true);

    const token = latestInviteToken();
    expect(token).toBeTruthy();

    const accept = await fetch(`${base}/api/household/accept`, J(partner, 'POST', { token }));
    expect(accept.status).toBe(200);
    const partnerView = (await accept.json()).household;
    expect(partnerView.role).toBe('member');
    expect(partnerView.memberCount).toBe(2);

    const ownerView = await (await fetch(`${base}/api/household`, { headers: { Cookie: owner.cookie } })).json();
    expect(ownerView.household.memberCount).toBe(2);
    expect(ownerView.household.members.map((m) => m.email)).toContain(partner.email);
  });

  it('rejects an invite accepted by a different email', async () => {
    const owner = await makeUser('owner3');
    grantFamily(owner.id);
    await fetch(`${base}/api/household`, J(owner, 'POST', { name: 'X' }));
    await fetch(`${base}/api/household/invite`, J(owner, 'POST', { email: 'someone-else@test.com' }));
    const token = latestInviteToken();

    const wrong = await makeUser('wrong');
    const res = await fetch(`${base}/api/household/accept`, J(wrong, 'POST', { token }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('invite-email-mismatch');
  });

  it('enforces the member cap (Family = 3)', async () => {
    const owner = await makeUser('owner4');
    grantFamily(owner.id);
    await fetch(`${base}/api/household`, J(owner, 'POST', { name: 'Full House' }));

    // Fill to the cap of 3 (owner + 2).
    for (const seed of ['m1', 'm2']) {
      const m = await makeUser(seed);
      await fetch(`${base}/api/household/invite`, J(owner, 'POST', { email: m.email }));
      const token = latestInviteToken();
      const r = await fetch(`${base}/api/household/accept`, J(m, 'POST', { token }));
      expect(r.status).toBe(200);
    }

    const fourth = await makeUser('m3');
    const res = await fetch(`${base}/api/household/invite`, J(owner, 'POST', { email: fourth.email }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('household-full');
  });

  it('lets a member leave, and transfers ownership when the owner leaves', async () => {
    const owner = await makeUser('owner5');
    grantFamily(owner.id);
    await fetch(`${base}/api/household`, J(owner, 'POST', { name: 'Leavers' }));

    const partner = await makeUser('leaver');
    await fetch(`${base}/api/household/invite`, J(owner, 'POST', { email: partner.email }));
    await fetch(`${base}/api/household/accept`, J(partner, 'POST', { token: latestInviteToken() }));

    // Owner leaves → ownership transfers to the remaining member.
    const left = await fetch(`${base}/api/household/leave`, J(owner, 'POST'));
    expect(left.status).toBe(200);
    expect((await left.json()).transferredTo).toBe(partner.id);

    const partnerView = await (await fetch(`${base}/api/household`, { headers: { Cookie: partner.cookie } })).json();
    expect(partnerView.household.role).toBe('owner');
    expect(partnerView.household.memberCount).toBe(1);

    // Last member leaves → household dissolves.
    const dissolve = await fetch(`${base}/api/household/leave`, J(partner, 'POST'));
    expect((await dissolve.json()).dissolved).toBe(true);

    const after = await (await fetch(`${base}/api/household`, { headers: { Cookie: partner.cookie } })).json();
    expect(after.household).toBeNull();
  });
});
