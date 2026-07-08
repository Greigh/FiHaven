import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

// Phase 3 — live collaboration: the SSE stream replays missed deltas and
// pushes new ones live to the other member.

describe('integration — household live stream (SSE)', () => {
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
    const email = `sse-${seed}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
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
  const inviteToken = () => {
    const m = String(ctx.sentMail().at(-1).text || '').match(/household=([^\s&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  };
  async function couple(seed) {
    const owner = await makeUser(`${seed}-o`);
    grantFamily(owner.id);
    await fetch(`${base}/api/household`, J(owner, 'POST', { name: 'Shared' }));
    const partner = await makeUser(`${seed}-p`);
    await fetch(`${base}/api/household/invite`, J(owner, 'POST', { email: partner.email }));
    await fetch(`${base}/api/household/accept`, J(partner, 'POST', { token: inviteToken() }));
    return { owner, partner };
  }

  // Minimal SSE client: reads `data:` frames and resolves when one matches.
  function sseClient(reader) {
    const decoder = new TextDecoder();
    let buf = '';
    const seen = [];
    return {
      async until(pred) {
        const hit0 = seen.find(pred);
        if (hit0) return hit0;
        while (true) {
          let chunk;
          try { chunk = await reader.read(); } catch (_) { return null; } // aborted
          if (chunk.done) return null;
          buf += decoder.decode(chunk.value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
            if (dataLine) {
              try { seen.push(JSON.parse(dataLine.slice(5).trim())); } catch (_) { /* skip */ }
            }
          }
          const hit = seen.find(pred);
          if (hit) return hit;
        }
      },
    };
  }

  it('replays missed deltas then streams live ones', async () => {
    const { owner, partner } = await couple('live');

    // A change made BEFORE connecting must be replayed on connect.
    await fetch(`${base}/api/household/entities`, J(owner, 'POST', { kind: 'bill', item: { id: 'b1', name: 'Rent', amount: 1500 } }));

    const ac = new AbortController();
    const safety = setTimeout(() => ac.abort(), 4000);
    try {
      const resp = await fetch(`${base}/api/household/stream`, { headers: { Cookie: partner.cookie }, signal: ac.signal });
      expect(resp.status).toBe(200);
      expect(resp.headers.get('content-type')).toContain('text/event-stream');
      const client = sseClient(resp.body.getReader());

      const replayed = await client.until((d) => d.entity && d.entity.data.name === 'Rent');
      expect(replayed).toBeTruthy();
      expect(replayed.entity.data.amount).toBe(1500);

      // A change made WHILE connected arrives live.
      await fetch(`${base}/api/household/entities`, J(owner, 'POST', { kind: 'bill', item: { id: 'b2', name: 'Power', amount: 90 } }));
      const live = await client.until((d) => d.entity && d.entity.data.name === 'Power');
      expect(live).toBeTruthy();
      expect(live.entity.data.amount).toBe(90);

      // A delete arrives as a tombstone delta.
      await fetch(`${base}/api/household/entities/bill/b1`, J(owner, 'DELETE'));
      const removed = await client.until((d) => d.entity && d.entity.id === 'b1' && d.entity.deleted === true);
      expect(removed).toBeTruthy();
    } finally {
      clearTimeout(safety);
      ac.abort();
    }
  });

  it('rejects the stream for non-members', async () => {
    const loner = await makeUser('loner');
    const ac = new AbortController();
    const resp = await fetch(`${base}/api/household/stream`, { headers: { Cookie: loner.cookie }, signal: ac.signal });
    expect(resp.status).toBe(404);
    await resp.text().catch(() => {});
    ac.abort();
  });
});
