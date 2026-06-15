import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { createTestServer } from './helpers/testServer.js';

const require = createRequire(import.meta.url);

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
});
