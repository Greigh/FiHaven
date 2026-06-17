import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { createTestServer } from './helpers/testServer.js';

const require = createRequire(import.meta.url);

// Seed a verified, Pro user with a data blob — the gates the autopay pass needs.
function seedProUser(db, email, data) {
  const user = db.createUser(email, '$2b$12$abcdefghijklmnopqrstuv');
  db.setEmailVerified(user.id, Date.now());
  db.upsertSubscription({
    user_id: user.id, platform: 'comp', product_id: 'pro', txn_id: `comp-${user.id}`,
    status: 'active', expires_at: Date.now() + 86400000, environment: 'test',
    auto_renew: 0, raw: '{}', created_at: Date.now(), updated_at: Date.now(),
  });
  db.upsertUserData(user.id, data);
  return user;
}

describe('integration — scheduler + database + email', () => {
  let ctx;
  let db;
  let scheduler;

  beforeAll(() => {
    ctx = createTestServer();
    db = ctx.db();
    scheduler = require('../../server/scheduler');
  });

  afterAll(() => {
    ctx?.close();
  });

  it('loads a verified user from SQLite and sends a bill reminder', async () => {
    const email = `sched-${Date.now()}@test.com`;
    const user = db.createUser(email, '$2b$12$abcdefghijklmnopqrstuv'); // hash unused for this test
    db.setEmailVerified(user.id, Date.now());
    db.upsertUserData(user.id, {
      bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 20, frequency: 'Monthly' }],
      cards: [],
      payments: [],
      settings: {
        billReminders: true,
        monthlySummary: false,
        timezone: 'America/New_York',
        currency: 'USD',
      },
    });

    const sendBillReminder = vi.fn().mockResolvedValue({});
    const sendMonthlySummary = vi.fn().mockResolvedValue({});

    await scheduler.runChecks(new Date('2026-06-17T12:00:00.000Z'), {
      emails: { sendBillReminder, sendMonthlySummary },
    });

    expect(sendBillReminder).toHaveBeenCalledOnce();
    expect(sendBillReminder.mock.calls[0][0]).toBe(email);
    expect(sendBillReminder.mock.calls[0][1][0].name).toBe('Rent');

    const row = db.allUsersWithData().find((u) => u.email === email);
    expect(row.last_reminder_day).toBe('2026-06-17');
  });

  it('auto-marks autopay bills for Pro users and persists payments back to SQLite', async () => {
    const email = `autopay-${Date.now()}@test.com`;
    const user = db.createUser(email, '$2b$12$abcdefghijklmnopqrstuv');
    db.setEmailVerified(user.id, Date.now());

    db.upsertSubscription({
      user_id: user.id,
      platform: 'comp',
      product_id: 'pro',
      txn_id: `comp-${user.id}`,
      status: 'active',
      expires_at: Date.now() + 86400000,
      environment: 'test',
      auto_renew: 0,
      raw: '{}',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    db.upsertUserData(user.id, {
      bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true, frequency: 'Monthly' }],
      cards: [],
      payments: [],
      settings: {
        billReminders: false,
        autopayMark: true,
        timezone: 'America/New_York',
        currency: 'USD',
      },
    });

    await scheduler.runChecks(new Date('2026-06-20T13:00:00.000Z'), {
      emails: { sendBillReminder: vi.fn(), sendMonthlySummary: vi.fn() },
    });

    const saved = db.getUserData(user.id);
    expect(saved.payments).toHaveLength(1);
    expect(saved.payments[0]).toMatchObject({
      type: 'bill',
      refId: 'b1',
      amount: 1500,
      note: 'Auto-marked (autopay)',
    });

    const row = db.allUsersWithData().find((u) => u.email === email);
    expect(row.last_autopay_day).toBe('2026-06-20');
  });

  it('records the per-month autopay memory (settings.autopayDone) back to SQLite', async () => {
    const email = `apdone-${Date.now()}@test.com`;
    const user = seedProUser(db, email, {
      bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true, frequency: 'Monthly' }],
      cards: [],
      payments: [],
      settings: {
        billReminders: false, autopayMark: true,
        timezone: 'America/New_York', currency: 'USD',
      },
    });

    await scheduler.runChecks(new Date('2026-06-20T13:00:00.000Z'), {
      emails: { sendBillReminder: vi.fn(), sendMonthlySummary: vi.fn() },
    });

    const saved = db.getUserData(user.id);
    expect(saved.payments).toHaveLength(1);
    // The memory the clients read is persisted alongside the payment.
    expect(saved.settings.autopayDone['2026-06']).toContain('bill:b1');
  });

  it('does not resurrect an autopay mark the user undid (honors autopayDone)', async () => {
    const email = `apundo-${Date.now()}@test.com`;
    // The memory says b1 was already auto-marked this month, but there's no
    // payment — the user undid it. A scheduler pass on the due day must NOT
    // re-add it (membership, not a payment, gates the mark).
    const user = seedProUser(db, email, {
      bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true, frequency: 'Monthly' }],
      cards: [],
      payments: [],
      settings: {
        billReminders: false, autopayMark: true,
        timezone: 'America/New_York', currency: 'USD',
        autopayDone: { '2026-06': ['bill:b1'] },
      },
    });

    await scheduler.runChecks(new Date('2026-06-20T13:00:00.000Z'), {
      emails: { sendBillReminder: vi.fn(), sendMonthlySummary: vi.fn() },
    });

    const saved = db.getUserData(user.id);
    expect(saved.payments).toHaveLength(0);

    // The day is still stamped (so we don't rescan all day), but nothing was added.
    const row = db.allUsersWithData().find((u) => u.email === email);
    expect(row.last_autopay_day).toBe('2026-06-20');
  });
});
