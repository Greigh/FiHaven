import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { createTestServer, listen } from './helpers/testServer.js';

const require = createRequire(import.meta.url);

/* The full opt-out loop, end to end: the scheduler mails a digest, the
   recipient follows the link in it, and the next scheduler pass goes
   quiet. That chain — not any single function — is what the EU/CAN-SPAM
   "one click and it stops" expectation actually means. */

describe('integration — unsubscribing from a notification email', () => {
  let ctx;
  let base;
  let server;
  let db;
  let scheduler;

  beforeAll(async () => {
    ctx = createTestServer();
    ({ base, server } = await listen(ctx.app));
    db = ctx.db();
    scheduler = require('../../server/scheduler');
  });

  afterAll(() => {
    server?.close();
    ctx?.close();
  });

  // A verified user with the digest on, one bill due, in a fixed zone so
  // the "Monday 9am local" gate is predictable.
  function seedUser(seed) {
    const email = `unsub-${seed}-${Date.now()}@test.com`;
    const user = db.createUser(email, '$2b$12$abcdefghijklmnopqrstuv');
    db.setEmailVerified(user.id, Date.now());
    db.upsertUserData(user.id, {
      bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 20, frequency: 'Monthly' }],
      cards: [{ id: 'c1', name: 'Visa', balance: 300 }],
      settings: { weeklyDigest: true, timezone: 'UTC', notifyHour: 9, currency: 'USD' },
    });
    return { id: user.id, email };
  }

  // 2026-06-15 is a Monday.
  const MONDAY_9AM = new Date('2026-06-15T09:00:00.000Z');

  function digestFor(email) {
    return ctx.sentMail().filter(
      (m) => m.to === email && /weekly/i.test(m.subject || '')
    );
  }

  it('mails a digest with a working unsubscribe link, then stops after it is used', async () => {
    const user = seedUser('flow');

    await scheduler.runChecks(MONDAY_9AM);
    const sent = digestFor(user.email);
    expect(sent).toHaveLength(1);

    // The link the recipient actually clicks — pulled out of the email body,
    // not reconstructed, so a broken link fails this test.
    const href = (sent[0].text.match(/https?:\S*\/unsubscribe\?t=\S+/) || [])[0];
    expect(href).toBeTruthy();
    expect(sent[0].listUnsubscribe).toBe(href);
    expect(sent[0].html).toContain('/settings?tab=notifications#notifications');

    const url = new URL(href);
    const token = url.searchParams.get('t');

    // The page's pre-confirmation lookup.
    const info = await fetch(`${base}/unsubscribe/info?t=${encodeURIComponent(token)}`);
    expect(info.status).toBe(200);
    expect((await info.json()).kind).toBe('digest');

    // Merely fetching the page must not change anything — mail scanners
    // follow links in incoming messages.
    expect(db.getUserData(user.id).settings.weeklyDigest).toBe(true);

    const done = await fetch(`${base}/unsubscribe?t=${encodeURIComponent(token)}`, {
      method: 'POST',
    });
    expect(done.status).toBe(200);
    expect((await done.json()).ok).toBe(true);

    const data = db.getUserData(user.id);
    expect(data.settings.weeklyDigest).toBe(false);
    // Only the one flag moved; the rest of the record is intact.
    expect(data.settings.currency).toBe('USD');
    expect(data.bills).toHaveLength(1);
    expect(data.cards).toHaveLength(1);

    // The following Monday: nothing.
    await scheduler.runChecks(new Date('2026-06-22T09:00:00.000Z'));
    expect(digestFor(user.email)).toHaveLength(1);
  });

  it('accepts the mail client one-click POST (form-encoded, no session)', async () => {
    const user = seedUser('oneclick');
    await scheduler.runChecks(MONDAY_9AM);
    const href = digestFor(user.email)[0].listUnsubscribe;

    const res = await fetch(href.replace(/^https?:\/\/[^/]+/, base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    });
    expect(res.status).toBe(200);
    expect(db.getUserData(user.id).settings.weeklyDigest).toBe(false);
  });

  it('is idempotent — a retried unsubscribe still reports success', async () => {
    const user = seedUser('retry');
    await scheduler.runChecks(MONDAY_9AM);
    const href = digestFor(user.email)[0].listUnsubscribe.replace(/^https?:\/\/[^/]+/, base);

    for (let i = 0; i < 2; i++) {
      const res = await fetch(href, { method: 'POST' });
      expect(res.status).toBe(200);
    }
    expect(db.getUserData(user.id).settings.weeklyDigest).toBe(false);
  });

  it('rejects a forged or missing token without touching any account', async () => {
    const user = seedUser('forged');
    await scheduler.runChecks(MONDAY_9AM);

    for (const bad of ['', `${user.id}.digest.forged`, 'nonsense']) {
      const res = await fetch(`${base}/unsubscribe?t=${encodeURIComponent(bad)}`, {
        method: 'POST',
      });
      expect(res.status).toBe(400);
    }
    expect(db.getUserData(user.id).settings.weeklyDigest).toBe(true);
  });
});
