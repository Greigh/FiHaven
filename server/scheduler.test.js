import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const serverDir = path.dirname(fileURLToPath(import.meta.url));

function stubModule(modulePath, exports) {
  const resolved = require.resolve(modulePath, { paths: [serverDir] });
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports,
  };
}

function clearModule(modulePath) {
  try {
    delete require.cache[require.resolve(modulePath, { paths: [serverDir] })];
  } catch (_) {
    /* not loaded yet */
  }
}

function loadScheduler({ pro = false } = {}) {
  clearModule('./scheduler');
  clearModule('./db');
  clearModule('./billing');
  clearModule('./emails');
  stubModule('./db', {});
  stubModule('./billing', { computeEntitlement: vi.fn(() => ({ pro })) });
  stubModule('./emails', {});
  return require('./scheduler');
}

function makeUser(overrides = {}) {
  return {
    id: 1,
    email: 'user@example.com',
    email_verified: 1,
    last_reminder_day: null,
    last_summary_month: null,
    last_autopay_day: null,
    data: {
      settings: {
        timezone: 'America/New_York',
        currency: 'USD',
        billReminders: true,
        monthlySummary: false,
        autopayMark: false,
        ...(overrides.settings || {}),
      },
      bills: overrides.bills || [],
      cards: overrides.cards || [],
      payments: overrides.payments || [],
    },
    ...overrides,
  };
}

describe('scheduler — localParts', () => {
  let localParts;
  let SEND_HOUR;

  beforeEach(() => {
    ({ localParts, SEND_HOUR } = loadScheduler());
  });

  it('returns local calendar parts for a timezone', () => {
    const lp = localParts(new Date('2026-06-17T12:00:00.000Z'), 'America/New_York');
    expect(lp).toMatchObject({
      y: 2026,
      m: 6,
      d: 17,
      hour: SEND_HOUR,
      ymd: '2026-06-17',
      ym: '2026-06',
    });
  });

  it('normalizes hour 24 to 0 when Intl emits midnight as 24', () => {
    const formatSpy = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockReturnValue([
      { type: 'year', value: '2026' },
      { type: 'month', value: '06' },
      { type: 'day', value: '01' },
      { type: 'hour', value: '24' },
    ]);
    expect(localParts(new Date(), 'America/New_York').hour).toBe(0);
    formatSpy.mockRestore();
  });
});

describe('scheduler — daysUntilDue', () => {
  let daysUntilDue;

  beforeEach(() => {
    ({ daysUntilDue } = loadScheduler());
  });

  it('counts days until the next occurrence of a due day', () => {
    const lp = { y: 2026, m: 6, d: 17 };
    expect(daysUntilDue(20, lp)).toBe(3);
    expect(daysUntilDue(17, lp)).toBe(0);
  });

  it('rolls to next month when the due day already passed', () => {
    const lp = { y: 2026, m: 6, d: 25 };
    expect(daysUntilDue(5, lp)).toBeGreaterThan(0);
  });
});

describe('scheduler — summarize', () => {
  let summarize;

  beforeEach(() => {
    ({ summarize } = loadScheduler());
  });

  it('totals paid last month, active bills, and card debt', () => {
    const lp = { y: 2026, m: 6, d: 1, ymd: '2026-06-01' };
    const summary = summarize(
      {
        bills: [
          { name: 'Rent', amount: 1500 },
          { name: 'Old gym', amount: 50, endDate: '2026-05-31' },
          { name: 'Future', amount: 99, startDate: '2026-06-15' },
        ],
        cards: [{ balance: 500 }, { balance: 250 }],
        payments: [
          { monthKey: '2026-05', amount: 2000 },
          { monthKey: '2026-04', amount: 999 },
        ],
      },
      lp,
    );

    expect(summary.paid).toBe(2000);
    expect(summary.billsTotal).toBe(1500);
    expect(summary.billsCount).toBe(1);
    expect(summary.debtTotal).toBe(750);
    expect(summary.month).toMatch(/May 2026/);
  });

  it('handles empty data gracefully', () => {
    const lp = { y: 2026, m: 6, d: 1, ymd: '2026-06-01' };
    const summary = summarize({}, lp);
    expect(summary.paid).toBe(0);
    expect(summary.billsTotal).toBe(0);
    expect(summary.billsCount).toBe(0);
    expect(summary.debtTotal).toBe(0);
  });
});

describe('scheduler — runChecks', () => {
  let runChecks;
  let REMINDER_LEAD_DAYS;
  let sendBillReminder;
  let sendMonthlySummary;
  let setReminderDay;
  let setSummaryMonth;
  let db;

  beforeEach(() => {
    ({ runChecks, REMINDER_LEAD_DAYS } = loadScheduler());
    sendBillReminder = vi.fn().mockResolvedValue({});
    sendMonthlySummary = vi.fn().mockResolvedValue({});
    setReminderDay = vi.fn();
    setSummaryMonth = vi.fn();
    db = {
      allUsersWithData: vi.fn(),
      setReminderDay,
      setSummaryMonth,
    };
  });

  it('sends bill reminders at the local send hour for bills due in REMINDER_LEAD_DAYS', async () => {
    db.allUsersWithData.mockReturnValue([
      makeUser({
        bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 20 }],
      }),
    ]);

    await runChecks(new Date('2026-06-17T12:00:00.000Z'), {
      db,
      emails: { sendBillReminder, sendMonthlySummary },
    });

    expect(sendBillReminder).toHaveBeenCalledOnce();
    expect(sendBillReminder.mock.calls[0]).toEqual([
      'user@example.com',
      [expect.objectContaining({ name: 'Rent', dueDay: 20 })],
      REMINDER_LEAD_DAYS,
      'USD',
    ]);
    expect(setReminderDay).toHaveBeenCalledWith(1, '2026-06-17');
  });

  it('stamps reminder day even when no bills are due', async () => {
    db.allUsersWithData.mockReturnValue([
      makeUser({
        bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 1 }],
      }),
    ]);

    await runChecks(new Date('2026-06-17T12:00:00.000Z'), {
      db,
      emails: { sendBillReminder, sendMonthlySummary },
    });

    expect(sendBillReminder).not.toHaveBeenCalled();
    expect(setReminderDay).toHaveBeenCalledWith(1, '2026-06-17');
  });

  it('does not send reminders outside the local send hour', async () => {
    db.allUsersWithData.mockReturnValue([
      makeUser({
        bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 20 }],
      }),
    ]);

    await runChecks(new Date('2026-06-17T15:00:00.000Z'), {
      db,
      emails: { sendBillReminder, sendMonthlySummary },
    });

    expect(sendBillReminder).not.toHaveBeenCalled();
    expect(setReminderDay).not.toHaveBeenCalled();
  });

  it('skips unverified users and users with reminders disabled', async () => {
    db.allUsersWithData.mockReturnValue([
      makeUser({ email_verified: 0, bills: [{ name: 'Rent', dueDay: 20, amount: 1 }] }),
      makeUser({ settings: { billReminders: false }, bills: [{ name: 'Rent', dueDay: 20, amount: 1 }] }),
    ]);

    await runChecks(new Date('2026-06-17T12:00:00.000Z'), {
      db,
      emails: { sendBillReminder, sendMonthlySummary },
    });

    expect(sendBillReminder).not.toHaveBeenCalled();
  });

  it('does not resend reminders on the same local day', async () => {
    db.allUsersWithData.mockReturnValue([
      makeUser({
        last_reminder_day: '2026-06-17',
        bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 20 }],
      }),
    ]);

    await runChecks(new Date('2026-06-17T12:00:00.000Z'), {
      db,
      emails: { sendBillReminder, sendMonthlySummary },
    });

    expect(sendBillReminder).not.toHaveBeenCalled();
    expect(setReminderDay).not.toHaveBeenCalled();
  });

  it('sends monthly summary on the 1st at the local send hour', async () => {
    db.allUsersWithData.mockReturnValue([
      makeUser({
        settings: { billReminders: false, monthlySummary: true },
        bills: [{ name: 'Rent', amount: 1500 }],
        cards: [{ balance: 400 }],
        payments: [{ monthKey: '2026-05', amount: 1800 }],
      }),
    ]);

    await runChecks(new Date('2026-06-01T12:00:00.000Z'), {
      db,
      emails: { sendBillReminder, sendMonthlySummary },
    });

    expect(sendMonthlySummary).toHaveBeenCalledOnce();
    expect(sendMonthlySummary.mock.calls[0][0]).toBe('user@example.com');
    expect(sendMonthlySummary.mock.calls[0][1]).toMatchObject({
      paid: 1800,
      billsTotal: 1500,
      debtTotal: 400,
    });
    expect(setSummaryMonth).toHaveBeenCalledWith(1, '2026-06');
  });

  it('does not resend monthly summary for the same month', async () => {
    db.allUsersWithData.mockReturnValue([
      makeUser({
        settings: { billReminders: false, monthlySummary: true },
        last_summary_month: '2026-06',
      }),
    ]);

    await runChecks(new Date('2026-06-01T12:00:00.000Z'), {
      db,
      emails: { sendBillReminder, sendMonthlySummary },
    });

    expect(sendMonthlySummary).not.toHaveBeenCalled();
    expect(setSummaryMonth).not.toHaveBeenCalled();
  });

  it('excludes inactive bills from reminders', async () => {
    db.allUsersWithData.mockReturnValue([
      makeUser({
        bills: [{ id: 'b1', name: 'Old gym', amount: 50, dueDay: 20, endDate: '2026-06-01' }],
      }),
    ]);

    await runChecks(new Date('2026-06-17T12:00:00.000Z'), {
      db,
      emails: { sendBillReminder, sendMonthlySummary },
    });

    expect(sendBillReminder).not.toHaveBeenCalled();
    expect(setReminderDay).toHaveBeenCalledWith(1, '2026-06-17');
  });

  it('falls back to DEFAULT_TZ when the saved timezone is invalid', async () => {
    db.allUsersWithData.mockReturnValue([
      makeUser({
        settings: { timezone: 'Not/A_Timezone', billReminders: true },
        bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 20 }],
      }),
    ]);

    await runChecks(new Date('2026-06-17T12:00:00.000Z'), {
      db,
      emails: { sendBillReminder, sendMonthlySummary },
    });

    expect(sendBillReminder).toHaveBeenCalledOnce();
    expect(setReminderDay).toHaveBeenCalledWith(1, '2026-06-17');
  });

  it('returns early when loading users fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.allUsersWithData.mockImplementation(() => { throw new Error('db down'); });

    await runChecks(new Date('2026-06-17T12:00:00.000Z'), {
      db,
      emails: { sendBillReminder, sendMonthlySummary },
    });

    expect(sendBillReminder).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith('scheduler: load failed', 'db down');
    errSpy.mockRestore();
  });

  it('stamps reminder day even when sendBillReminder throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendBillReminder.mockRejectedValueOnce(new Error('smtp down'));
    db.allUsersWithData.mockReturnValue([
      makeUser({
        bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 20 }],
      }),
    ]);

    await runChecks(new Date('2026-06-17T12:00:00.000Z'), {
      db,
      emails: { sendBillReminder, sendMonthlySummary },
    });

    expect(setReminderDay).toHaveBeenCalledWith(1, '2026-06-17');
    expect(errSpy).toHaveBeenCalledWith('reminder send failed', 'user@example.com', 'smtp down');
    errSpy.mockRestore();
  });

  it('stamps summary month even when sendMonthlySummary throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMonthlySummary.mockRejectedValueOnce(new Error('smtp down'));
    db.allUsersWithData.mockReturnValue([
      makeUser({
        settings: { billReminders: false, monthlySummary: true },
        bills: [{ name: 'Rent', amount: 1500 }],
      }),
    ]);

    await runChecks(new Date('2026-06-01T12:00:00.000Z'), {
      db,
      emails: { sendBillReminder, sendMonthlySummary },
    });

    expect(setSummaryMonth).toHaveBeenCalledWith(1, '2026-06');
    expect(errSpy).toHaveBeenCalledWith('summary send failed', 'user@example.com', 'smtp down');
    errSpy.mockRestore();
  });

  it('uses the user currency for reminders and summaries', async () => {
    db.allUsersWithData.mockReturnValue([
      makeUser({
        settings: { currency: 'EUR', billReminders: true, monthlySummary: true },
        bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 20 }],
        cards: [{ balance: 100 }],
        payments: [{ monthKey: '2026-05', amount: 500 }],
      }),
    ]);

    await runChecks(new Date('2026-06-17T12:00:00.000Z'), {
      db,
      emails: { sendBillReminder, sendMonthlySummary },
    });
    expect(sendBillReminder.mock.calls[0][3]).toBe('EUR');

    await runChecks(new Date('2026-06-01T12:00:00.000Z'), {
      db,
      emails: { sendBillReminder, sendMonthlySummary },
    });
    expect(sendMonthlySummary.mock.calls[0][2]).toBe('EUR');
  });

  it('skips users with no email features enabled', async () => {
    db.allUsersWithData.mockReturnValue([
      makeUser({
        settings: { billReminders: false, monthlySummary: false, autopayMark: false },
        bills: [{ name: 'Rent', dueDay: 20, amount: 1 }],
      }),
    ]);

    await runChecks(new Date('2026-06-17T12:00:00.000Z'), {
      db,
      emails: { sendBillReminder, sendMonthlySummary },
    });

    expect(sendBillReminder).not.toHaveBeenCalled();
    expect(setReminderDay).not.toHaveBeenCalled();
  });
});

describe('scheduler — autopay via runChecks', () => {
  let runChecks;
  let upsertUserData;
  let setAutopayDay;
  let db;

  beforeEach(() => {
    ({ runChecks } = loadScheduler({ pro: true }));
    upsertUserData = vi.fn();
    setAutopayDay = vi.fn();
    db = {
      allUsersWithData: vi.fn(),
      upsertUserData,
      setAutopayDay,
      setReminderDay: vi.fn(),
      setSummaryMonth: vi.fn(),
    };
  });

  it('auto-marks an autopay bill on its due day at the default mark hour', async () => {
    const user = makeUser({
      settings: { billReminders: false, autopayMark: true },
      bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }],
      payments: [],
    });
    db.allUsersWithData.mockReturnValue([user]);

    await runChecks(new Date('2026-06-20T13:00:00.000Z'), { db, emails: {} });

    expect(upsertUserData).toHaveBeenCalledOnce();
    const saved = upsertUserData.mock.calls[0][1];
    expect(saved.payments).toHaveLength(1);
    expect(saved.payments[0]).toMatchObject({
      type: 'bill',
      refId: 'b1',
      name: 'Rent',
      amount: 1500,
      date: '2026-06-20',
      note: 'Auto-marked (autopay)',
    });
    expect(setAutopayDay).toHaveBeenCalledWith(1, '2026-06-20');
  });

  it('auto-marks an autopay card on its due day', async () => {
    const user = makeUser({
      settings: { billReminders: false, autopayMark: true },
      cards: [{ id: 'c1', name: 'Visa', minPayment: 35, dueDay: 20, autopay: true }],
      payments: [],
    });
    db.allUsersWithData.mockReturnValue([user]);

    await runChecks(new Date('2026-06-20T13:00:00.000Z'), { db, emails: {} });

    expect(upsertUserData).toHaveBeenCalledOnce();
    expect(upsertUserData.mock.calls[0][1].payments[0]).toMatchObject({
      type: 'card',
      refId: 'c1',
      name: 'Visa (payment)',
      amount: 35,
    });
  });

  it('does not duplicate autopay marks when a payment already exists', async () => {
    const user = makeUser({
      settings: { billReminders: false, autopayMark: true },
      bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }],
      payments: [{ id: 'p1', type: 'bill', refId: 'b1', amount: 1500, monthKey: '2026-06' }],
    });
    db.allUsersWithData.mockReturnValue([user]);

    await runChecks(new Date('2026-06-20T13:00:00.000Z'), { db, emails: {} });

    expect(upsertUserData).not.toHaveBeenCalled();
    expect(setAutopayDay).toHaveBeenCalledWith(1, '2026-06-20');
  });

  it('respects a custom autopayMarkHour', async () => {
    const user = makeUser({
      settings: { billReminders: false, autopayMark: true, autopayMarkHour: 10 },
      bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }],
    });
    db.allUsersWithData.mockReturnValue([user]);

    await runChecks(new Date('2026-06-20T13:00:00.000Z'), { db, emails: {} });
    expect(upsertUserData).not.toHaveBeenCalled();

    await runChecks(new Date('2026-06-20T14:00:00.000Z'), { db, emails: {} });
    expect(upsertUserData).toHaveBeenCalledOnce();
  });

  it('does not auto-mark for non-Pro users', async () => {
    ({ runChecks } = loadScheduler({ pro: false }));
    const user = makeUser({
      settings: { billReminders: false, autopayMark: true },
      bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }],
    });
    db.allUsersWithData.mockReturnValue([user]);

    await runChecks(new Date('2026-06-20T13:00:00.000Z'), { db, emails: {} });

    expect(upsertUserData).not.toHaveBeenCalled();
    expect(setAutopayDay).not.toHaveBeenCalled();
  });

  it('does not auto-mark twice on the same local day', async () => {
    const user = makeUser({
      last_autopay_day: '2026-06-20',
      settings: { billReminders: false, autopayMark: true },
      bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }],
    });
    db.allUsersWithData.mockReturnValue([user]);

    await runChecks(new Date('2026-06-20T13:00:00.000Z'), { db, emails: {} });

    expect(upsertUserData).not.toHaveBeenCalled();
    expect(setAutopayDay).not.toHaveBeenCalled();
  });

  it('skips inactive bills and bills without due metadata', async () => {
    const user = makeUser({
      settings: { billReminders: false, autopayMark: true },
      bills: [
        { id: 'b1', name: 'Ended', amount: 50, dueDay: 20, autopay: true, endDate: '2026-06-01' },
        { id: 'b2', name: 'No due', amount: 10, autopay: true },
      ],
    });
    db.allUsersWithData.mockReturnValue([user]);

    await runChecks(new Date('2026-06-20T13:00:00.000Z'), { db, emails: {} });

    expect(upsertUserData).not.toHaveBeenCalled();
    expect(setAutopayDay).toHaveBeenCalledWith(1, '2026-06-20');
  });

  it('logs and continues when autopay persistence fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    upsertUserData.mockImplementation(() => { throw new Error('write failed'); });
    const user = makeUser({
      settings: { billReminders: false, autopayMark: true },
      bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }],
    });
    db.allUsersWithData.mockReturnValue([user]);

    await runChecks(new Date('2026-06-20T13:00:00.000Z'), { db, emails: {} });

    expect(errSpy).toHaveBeenCalledWith('autopay-mark failed', 'user@example.com', 'write failed');
    errSpy.mockRestore();
  });
});

describe('scheduler — start', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers an hourly timer and a boot catch-up, only once', () => {
    const intervalSpy = vi.spyOn(global, 'setInterval');
    const timeoutSpy = vi.spyOn(global, 'setTimeout');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { start } = loadScheduler();

    start();
    start();

    expect(intervalSpy).toHaveBeenCalledOnce();
    expect(intervalSpy.mock.calls[0][1]).toBe(60 * 60 * 1000);
    expect(timeoutSpy).toHaveBeenCalledOnce();
    expect(timeoutSpy.mock.calls[0][1]).toBe(5000);
    expect(logSpy).toHaveBeenCalledWith('scheduler started (reminders + monthly summary)');

    intervalSpy.mockRestore();
    timeoutSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('runs an initial check shortly after boot', async () => {
    const sched = loadScheduler();
    const runChecksSpy = vi.spyOn(sched, 'runChecks').mockResolvedValue(undefined);

    sched.start();
    await vi.advanceTimersByTimeAsync(5000);

    expect(runChecksSpy).toHaveBeenCalled();
    runChecksSpy.mockRestore();
  });

  it('logs when an hourly tick rejects', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fakeHandle = { unref: vi.fn() };
    let intervalCb;
    const intervalSpy = vi.spyOn(global, 'setInterval').mockImplementation((cb) => {
      intervalCb = cb;
      return fakeHandle;
    });
    vi.spyOn(global, 'setTimeout').mockImplementation(() => fakeHandle);
    const sched = loadScheduler();
    const runChecksSpy = vi.spyOn(sched, 'runChecks').mockRejectedValue(new Error('tick fail'));

    sched.start();
    await intervalCb();

    expect(runChecksSpy).toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith('scheduler tick failed', 'tick fail');

    errSpy.mockRestore();
    runChecksSpy.mockRestore();
    intervalSpy.mockRestore();
    vi.mocked(setTimeout).mockRestore();
  });
});
