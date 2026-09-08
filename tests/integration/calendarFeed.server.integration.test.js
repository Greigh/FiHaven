import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, listen, cookieFrom } from './helpers/testServer.js';

// The iCal feed is authed only by the unguessable token in the URL and echoes
// user-named bills/cards into a text/calendar body. A bill name is stored
// verbatim by PUT /api/data, so the feed builder has to neutralise anything a
// lenient calendar parser would read as structure.

describe('integration — iCal feed escaping', () => {
  let ctx; let base; let server;

  beforeAll(async () => { ctx = createTestServer(); ({ base, server } = await listen(ctx.app)); });
  afterAll(() => { server?.close(); ctx?.close(); });

  async function userWithToken() {
    const email = `ical-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
    const r = await fetch(`${base}/api/auth/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'ical-user-11!', loginStartedAt: Date.now() - 5000, captchaToken: 'test' }),
    });
    const body = await r.json();
    const cookie = cookieFrom(r.headers.get('set-cookie'));
    const db = ctx.db();
    const user = db.findUserByEmail(email);
    db.setEmailVerified(user.id, Date.now());
    const token = 'tok-' + Math.random().toString(36).slice(2);
    db.updateUserIcalToken(user.id, token);
    return { user, cookie, csrf: body.csrfToken, token };
  }

  it('does not let a crafted bill name inject calendar lines', async () => {
    const u = await userWithToken();
    // Lone CRs (plus a NUL for good measure) — the bytes a lenient parser would
    // treat as line breaks but strict CRLF splitting would miss.
    const nasty = 'Rent\rBEGIN:VEVENT\rSUMMARY:Injected\rEND:VEVENT\x00';
    const put = await fetch(`${base}/api/data`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': u.csrf, Cookie: u.cookie },
      body: JSON.stringify({ bills: [{ id: 'b1', name: nasty, amount: 10, dueDay: 15 }] }),
    });
    expect(put.status).toBe(200);

    const res = await fetch(`${base}/api/calendar/${u.token}.ics`);
    expect(res.status).toBe(200);
    const ics = await res.text();

    // Split the way a lenient parser might (any of CRLF / CR / LF), unfold
    // continuation lines, then inspect real line boundaries.
    const lines = ics.split(/\r\n|\r|\n/).reduce((acc, l) => {
      if (l.startsWith(' ')) acc[acc.length - 1] += l.slice(1);
      else acc.push(l);
      return acc;
    }, []);

    // The smuggled SUMMARY / component markers must never stand as their own
    // lines — the CR that would have made them do so is stripped.
    expect(lines).not.toContain('SUMMARY:Injected');
    const begins = lines.filter((l) => l === 'BEGIN:VEVENT').length;
    const ends = lines.filter((l) => l === 'END:VEVENT').length;
    expect(begins).toBeGreaterThan(0);
    expect(begins).toBe(ends);
    // The name still rides a single SUMMARY line.
    expect(lines.some((l) => l.startsWith('SUMMARY:Rent'))).toBe(true);
  });

  it('404s an unknown token', async () => {
    const res = await fetch(`${base}/api/calendar/not-a-real-token.ics`);
    expect(res.status).toBe(404);
  });
});
