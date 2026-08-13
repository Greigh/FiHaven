import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

// When the owner's Family plan lapses the household freezes: everything
// already shared stays readable, but nothing new can be written to it. Data is
// never deleted, so re-subscribing thaws it exactly as it was.

describe('integration — a household frozen by a lapsed Family plan', () => {
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
    const email = `frozen-${seed}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const r = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'frozenpass12!', loginStartedAt: Date.now() - 5000, captchaToken: 'test' }),
    });
    const session = await r.json();
    const cookie = cookieFrom(r.headers.get('set-cookie'));
    const db = ctx.db();
    const user = db.findUserByEmail(email);
    db.setEmailVerified(user.id, Date.now());
    return { id: user.id, email, cookie, csrf: session.csrfToken };
  }

  const req = (path, user, method, body) =>
    fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: user.cookie, 'X-CSRF-Token': user.csrf },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const post = (p, u, b) => req(p, u, 'POST', b || {});
  const get = (p, u) => fetch(`${base}${p}`, { headers: { Cookie: u.cookie } });

  function grantFamily(userId, expiresAt) {
    const now = Date.now();
    ctx.db().upsertSubscription({
      user_id: userId, platform: 'comp', product_id: 'comp:family', txn_id: `fam_${userId}`,
      status: 'active', expires_at: expiresAt, environment: 'Admin', auto_renew: 0,
      raw: null, created_at: now, updated_at: now,
    });
  }

  const lapse = (userId) =>
    ctx.db().db.prepare('UPDATE subscriptions SET expires_at = ? WHERE user_id = ?')
      .run(Date.now() - 1000, userId);

  // An owner with a household, one shared bill, and a lapsed plan.
  async function frozenOwner(seed) {
    const owner = await makeUser(seed);
    grantFamily(owner.id, Date.now() + 86400000);
    await post('/api/household', owner, { name: 'Frozen house' });
    await post('/api/household/entities', owner, { kind: 'bill', item: { id: 'b1', name: 'Rent', amount: 1200 } });
    lapse(owner.id);
    return owner;
  }

  it('keeps the household and everything shared readable', async () => {
    const owner = await frozenOwner('reads');

    const view = await (await get('/api/household', owner)).json();
    expect(view.household).not.toBe(null);
    expect(view.household.memberCount).toBe(1);
    expect(view.household.active).toBe(false);

    const data = await (await get('/api/household/data', owner)).json();
    expect(data.entities).toHaveLength(1);
    expect(data.entities[0].data.name).toBe('Rent');

    const rollup = await (await get('/api/household/rollup', owner)).json();
    expect(rollup.totals.billsMonthly).toBe(1200);
  });

  it('refuses new shares, edits, renames and invites', async () => {
    const owner = await frozenOwner('writes');

    const share = await post('/api/household/entities', owner, { kind: 'bill', item: { id: 'b2', name: 'Power', amount: 90 } });
    expect(share.status).toBe(403);
    expect((await share.json()).error).toBe('household-inactive');

    const edit = await req('/api/household/entities/bill/b1', owner, 'PUT', { item: { id: 'b1', name: 'Rent', amount: 9999 } });
    expect(edit.status).toBe(403);
    expect((await edit.json()).error).toBe('household-inactive');

    const renamed = await req('/api/household', owner, 'PATCH', { name: 'New name' });
    expect(renamed.status).toBe(403);

    // Previously this said "household-full", which was untrue and unfixable.
    const invited = await post('/api/household/invite', owner, { email: 'someone@test.com' });
    expect(invited.status).toBe(403);
    expect((await invited.json()).error).toBe('household-inactive');

    // Nothing was written.
    const data = await (await get('/api/household/data', owner)).json();
    expect(data.entities).toHaveLength(1);
    expect(data.entities[0].data.amount).toBe(1200);
  });

  it('still lets a member pull their own data back out', async () => {
    const owner = await frozenOwner('unshare');
    const gone = await req('/api/household/entities/bill/b1', owner, 'DELETE');
    expect(gone.status).toBe(200);
    const data = await (await get('/api/household/data', owner)).json();
    expect(data.entities).toHaveLength(0);
  });

  it('thaws with everything intact when the plan comes back', async () => {
    const owner = await frozenOwner('thaw');
    grantFamily(owner.id, Date.now() + 86400000);

    const view = await (await get('/api/household', owner)).json();
    expect(view.household.active).toBe(true);
    expect(view.household.memberMax).toBe(3);

    const share = await post('/api/household/entities', owner, { kind: 'bill', item: { id: 'b2', name: 'Power', amount: 90 } });
    expect(share.status).toBe(200);

    const data = await (await get('/api/household/data', owner)).json();
    expect(data.entities.map((e) => e.id).sort()).toEqual(['b1', 'b2']);
  });

  it('freezes members too — the owner is who pays', async () => {
    const owner = await makeUser('owner-lapse');
    grantFamily(owner.id, Date.now() + 86400000);
    await post('/api/household', owner, { name: 'Shared house' });

    const member = await makeUser('member');
    const invite = await post('/api/household/invite', owner, { email: member.email });
    expect(invite.status).toBe(200);
    const token = (await invite.json()).rawToken
      || ctx.sentMail().map((m) => /household=([A-Za-z0-9_-]+)/.exec(m.html || m.text || '')).filter(Boolean).pop()[1];
    await post('/api/household/accept', member, { token });

    // The member has their own solo Pro — it must not thaw the household.
    ctx.db().upsertSubscription({
      user_id: member.id, platform: 'comp', product_id: 'comp:yearly', txn_id: `solo_${member.id}`,
      status: 'active', expires_at: Date.now() + 86400000, environment: 'Admin', auto_renew: 0,
      raw: null, created_at: Date.now(), updated_at: Date.now(),
    });
    lapse(owner.id);

    const data = await (await get('/api/household/data', member)).json();
    expect(data.entities).toEqual([]);

    const share = await post('/api/household/entities', member, { kind: 'bill', item: { id: 'm1', name: 'Phone', amount: 40 } });
    expect(share.status).toBe(403);
    expect((await share.json()).error).toBe('household-inactive');
  });

  it('lets a member leave a frozen household', async () => {
    const owner = await frozenOwner('leave');
    const left = await post('/api/household/leave', owner);
    expect(left.status).toBe(200);
  });
});
