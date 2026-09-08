import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const serverDir = path.dirname(fileURLToPath(import.meta.url));

function stubModule(modulePath, exports) {
  const resolved = require.resolve(modulePath, { paths: [serverDir] });
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
function clearModule(modulePath) {
  try { delete require.cache[require.resolve(modulePath, { paths: [serverDir] })]; }
  catch (_) { /* not loaded */ }
}

/* A tiny in-memory stand-in for the mfa_challenges row helpers reauth uses. */
function makeChallengeStore() {
  const rows = new Map();
  return {
    rows,
    findChallenge: vi.fn((id) => rows.get(id) || null),
    deleteChallenge: vi.fn((id) => rows.delete(id)),
    insertChallenge: vi.fn((row) => rows.set(row.id, { attempts: 0, sends: 0, ...row })),
    bumpChallengeAttempts: vi.fn((id) => {
      const r = rows.get(id);
      r.attempts = (r.attempts || 0) + 1;
      return r.attempts;
    }),
    userHasPassword: vi.fn(() => false),
  };
}

describe('reauth.sendCode', () => {
  let reauth;
  let db;
  let sendMail;

  beforeEach(() => {
    db = makeChallengeStore();
    sendMail = vi.fn().mockResolvedValue({ messageId: 't' });
    clearModule('./reauth');
    clearModule('./db');
    clearModule('./mail');
    clearModule('./mfa');
    stubModule('./db', db);
    stubModule('./mail', { sendMail });
    stubModule('./mfa', {
      newEmailCode: vi.fn(() => '123456'),
      hashEmailCode: vi.fn(async (c) => `hash:${c}`),
      compareEmailCode: vi.fn(async (c, h) => h === `hash:${c}`),
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    reauth = require('./reauth');
  });

  afterEach(() => { vi.useRealTimers(); });

  const user = { id: 7, email: 'oauth@example.com' };

  it('mints a code and mails it on the first send', async () => {
    await reauth.sendCode(user);
    expect(sendMail).toHaveBeenCalledOnce();
    const row = db.rows.get('reauth:7');
    expect(row).toMatchObject({ kind: 'reauth', payload: 'hash:123456', attempts: 0, sends: 1 });
  });

  it('carries the guess budget forward across re-sends', async () => {
    await reauth.sendCode(user);
    // Attacker burns two wrong guesses against the outstanding code.
    db.bumpChallengeAttempts('reauth:7');
    db.bumpChallengeAttempts('reauth:7');
    await reauth.sendCode(user);
    expect(db.rows.get('reauth:7')).toMatchObject({ attempts: 2, sends: 2 });
  });

  it('refuses a re-send once MAX_SENDS codes have gone out', async () => {
    for (let i = 0; i < reauth.MAX_SENDS; i++) await reauth.sendCode(user);
    expect(sendMail).toHaveBeenCalledTimes(reauth.MAX_SENDS);

    await expect(reauth.sendCode(user)).rejects.toMatchObject({ code: 'reauth-too-many-sends' });
    expect(sendMail).toHaveBeenCalledTimes(reauth.MAX_SENDS); // no extra mail
  });

  it('starts a fresh budget once the outstanding code has expired', async () => {
    for (let i = 0; i < reauth.MAX_SENDS; i++) await reauth.sendCode(user);
    vi.setSystemTime(new Date(Date.now() + reauth.CODE_TTL_MS + 1000));
    await reauth.sendCode(user);
    expect(db.rows.get('reauth:7')).toMatchObject({ attempts: 0, sends: 1 });
  });
});
