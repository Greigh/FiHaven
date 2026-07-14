import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

// End-to-end for the volunteered-link routes. These email the submitted name,
// the URL, *and the sender's address* to the shared-links inbox — the exact
// claim the in-app disclosure and the privacy policy make. Assert on the mail
// the server actually produced, not just the status code.

describe('integration — volunteered links (/api/feedback)', () => {
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

  async function makeUser(seed, { verified = true } = {}) {
    const email = `fb-${seed}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const r = await fetch(`${base}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'feedbacklink1', loginStartedAt: Date.now() - 5000, captchaToken: 'test' }),
    });
    const session = await r.json();
    const cookie = cookieFrom(r.headers.get('set-cookie'));
    const db = ctx.db();
    const user = db.findUserByEmail(email);
    if (verified) db.setEmailVerified(user.id, Date.now());
    return { id: user.id, email, cookie, csrf: session.csrfToken };
  }

  const post = (u, path, body) => fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': u.csrf, Cookie: u.cookie },
    body: JSON.stringify(body),
  });

  // The link mails are the only ones these tests trigger.
  const linkMail = () => ctx.sentMail().filter((m) => /link:/.test(m.subject || ''));

  it('subscription-link mails the service, the URL, and the sender address', async () => {
    const u = await makeUser('sub');
    const before = linkMail().length;

    const res = await post(u, '/api/feedback/subscription-link', {
      name: 'Netflix',
      url: 'https://netflix.com/account',
    });
    expect(res.status).toBe(200);

    const mail = linkMail()[before];
    expect(mail).toBeTruthy();
    expect(mail.subject).toBe('Subscription manage link: Netflix');
    expect(mail.replyTo).toBe(u.email);
    expect(mail.text).toContain('Netflix');
    expect(mail.text).toContain('https://netflix.com/account');
    // The disclosure promises the sender's email goes too — prove it does.
    expect(mail.text).toContain(u.email);
    expect(mail.html).toContain(u.email);
  });

  it('rewards-link mails under its own subject, naming the card', async () => {
    const u = await makeUser('rew');
    const before = linkMail().length;

    const res = await post(u, '/api/feedback/rewards-link', {
      name: 'Amex Gold',
      url: 'https://americanexpress.com/offers',
    });
    expect(res.status).toBe(200);

    const mail = linkMail()[before];
    expect(mail.subject).toBe('Card rewards link: Amex Gold');
    expect(mail.replyTo).toBe(u.email);
    expect(mail.text).toContain('Card: Amex Gold');
    expect(mail.text).toContain('https://americanexpress.com/offers');
    expect(mail.text).toContain(u.email);
  });

  it('rejects a non-http url and a missing name without mailing', async () => {
    const u = await makeUser('bad');
    const before = linkMail().length;

    const badUrl = await post(u, '/api/feedback/rewards-link', { name: 'X', url: 'javascript:alert(1)' });
    expect(badUrl.status).toBe(400);
    expect((await badUrl.json()).error).toBe('invalid-url');

    const noName = await post(u, '/api/feedback/rewards-link', { name: '', url: 'https://ok.example' });
    expect(noName.status).toBe(400);
    expect((await noName.json()).error).toBe('missing-name');

    expect(linkMail().length).toBe(before);
  });

  it('requires a verified session', async () => {
    const u = await makeUser('unverified', { verified: false });
    const res = await post(u, '/api/feedback/rewards-link', {
      name: 'Card', url: 'https://example.com',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('escapes html in the volunteered name', async () => {
    const u = await makeUser('xss');
    const before = linkMail().length;
    await post(u, '/api/feedback/rewards-link', {
      name: '<img src=x onerror=alert(1)>',
      url: 'https://example.com/offers',
    });
    const mail = linkMail()[before];
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).toContain('&lt;img src=x');
  });

  // ── Wrong reward rate ─────────────────────────────────────────────
  // A correction to a rate we ship in the presets (e.g. we claim 3% on Gas when
  // the card really earns 1%). Carries no URL — it's a data fix, not a link.
  const rateMail = () => ctx.sentMail().filter((m) => /Reward rate correction:/.test(m.subject || ''));

  it('reward-rate mails the card, the category, both rates, and the sender', async () => {
    const u = await makeUser('rate');
    const before = rateMail().length;

    const res = await post(u, '/api/feedback/reward-rate', {
      card: 'Freedom Unlimited',
      issuer: 'Chase',
      category: 'Gas',
      ourRate: 3,
      correctRate: 1,
      note: 'Dropped in June.',
    });
    expect(res.status).toBe(200);

    const mail = rateMail()[before];
    expect(mail).toBeTruthy();
    expect(mail.subject).toBe('Reward rate correction: Chase Freedom Unlimited — Gas');
    expect(mail.replyTo).toBe(u.email);
    expect(mail.text).toContain('We show: 3%');
    expect(mail.text).toContain('Should be: 1%');
    expect(mail.text).toContain('Dropped in June.');
    // Same disclosure as the link routes — the sender's address goes too.
    expect(mail.text).toContain(u.email);
    expect(mail.html).toContain(u.email);
  });

  it('reward-rate accepts a missing ourRate (we ship no rate for the category)', async () => {
    const u = await makeUser('rate-none');
    const before = rateMail().length;

    const res = await post(u, '/api/feedback/reward-rate', {
      card: 'Bilt', category: 'Groceries', ourRate: '', correctRate: 3,
    });
    expect(res.status).toBe(200);
    expect(rateMail()[before].text).toContain('We show: (none set)');
  });

  it('reward-rate rejects an out-of-range rate and a missing category without mailing', async () => {
    const u = await makeUser('rate-bad');
    const before = rateMail().length;

    const tooBig = await post(u, '/api/feedback/reward-rate', {
      card: 'X', category: 'Gas', correctRate: 101,
    });
    expect(tooBig.status).toBe(400);
    expect((await tooBig.json()).error).toBe('invalid-rate');

    const negative = await post(u, '/api/feedback/reward-rate', {
      card: 'X', category: 'Gas', correctRate: -1,
    });
    expect(negative.status).toBe(400);

    const noCat = await post(u, '/api/feedback/reward-rate', {
      card: 'X', category: '', correctRate: 1,
    });
    expect(noCat.status).toBe(400);
    expect((await noCat.json()).error).toBe('missing-category');

    expect(rateMail().length).toBe(before);
  });

  it('reward-rate escapes html in the card name and the note', async () => {
    const u = await makeUser('rate-xss');
    const before = rateMail().length;
    await post(u, '/api/feedback/reward-rate', {
      card: '<img src=x onerror=alert(1)>',
      category: 'Gas',
      correctRate: 1,
      note: '<script>alert(2)</script>',
    });
    const mail = rateMail()[before];
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;img src=x');
    expect(mail.html).toContain('&lt;script&gt;');
  });
});
