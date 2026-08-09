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

/* Push is required at module scope (not injectable via `deps`), so it is stubbed
   in the require cache. That also keeps firebase-admin/apns2 out of the test
   process. Pass `push` to observe the calls. */
function loadScheduler({ pro = false, push, billing, emails } = {}) {
  clearModule('./scheduler');
  clearModule('./db');
  clearModule('./billing');
  clearModule('./emails');
  clearModule('./push');
  stubModule('./db', {});
  stubModule('./billing', billing || { computeEntitlement: vi.fn(() => ({ pro })) });
  stubModule('./emails', emails || {});
  stubModule('./push', push || {
    sendBillReminderPush: vi.fn(),
    sendTrialReminderPush: vi.fn(),
    sendOfferReminderPush: vi.fn(),
    sendWeeklyDigestPush: vi.fn(),
    sendMonthlySummaryPush: vi.fn(),
  });
  return require('./scheduler');
}

function makePush(overrides = {}) {
  return {
    sendBillReminderPush: vi.fn().mockResolvedValue(undefined),
    sendTrialReminderPush: vi.fn().mockResolvedValue(undefined),
    sendOfferReminderPush: vi.fn().mockResolvedValue(undefined),
    sendWeeklyDigestPush: vi.fn().mockResolvedValue(undefined),
    sendMonthlySummaryPush: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
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
      1,
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

  /* The "already sent" stamp is the only thing that stops a re-send, so a FAILED
     send must not be stamped. Stamping a mail that never arrived marks it
     delivered and drops it — which is exactly what "notifications never send"
     looks like from the outside. */
  it('does not stamp the day when the reminder email fails', async () => {
    sendBillReminder.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:25'));
    db.allUsersWithData.mockReturnValue([
      makeUser({ bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 20 }] }),
    ]);

    await runChecks(new Date('2026-06-17T12:00:00.000Z'), {
      db,
      emails: { sendBillReminder, sendMonthlySummary },
    });

    expect(sendBillReminder).toHaveBeenCalledOnce();
    expect(setReminderDay).not.toHaveBeenCalled();
  });

  it('retries on a later pass after a failure, then stamps once it lands', async () => {
    db.allUsersWithData.mockReturnValue([
      makeUser({ bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 20 }] }),
    ]);
    const at = new Date('2026-06-17T12:00:00.000Z');

    sendBillReminder.mockRejectedValueOnce(new Error('SMTP down'));
    await runChecks(at, { db, emails: { sendBillReminder, sendMonthlySummary } });
    expect(setReminderDay).not.toHaveBeenCalled();      // not marked delivered

    // Still unstamped, so the user is still eligible on the next pass.
    sendBillReminder.mockResolvedValueOnce({});
    await runChecks(at, { db, emails: { sendBillReminder, sendMonthlySummary } });

    expect(sendBillReminder).toHaveBeenCalledTimes(2);
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

  // Was: "stamps reminder day even when sendBillReminder throws" — which marked
  // a mail that never arrived as delivered, so it was dropped, not retried.
  it('logs and leaves the day unstamped when sendBillReminder throws', async () => {
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

    expect(setReminderDay).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith('reminder send failed', 'user@example.com', 'smtp down');
    errSpy.mockRestore();
  });

  // Was: "stamps summary month even when sendMonthlySummary throws" — same bug,
  // but costing a whole month's summary rather than a day's reminder.
  it('logs and leaves the month unstamped when sendMonthlySummary throws', async () => {
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

    expect(setSummaryMonth).not.toHaveBeenCalled();
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

describe('scheduler — configurable reminders + due-day + weekly digest', () => {
  let runChecks;
  let sendBillReminder;
  let sendWeeklyDigest;
  let sendMonthlySummary;
  let setReminderDay;
  let setDigestWeek;
  let db;

  beforeEach(() => {
    ({ runChecks } = loadScheduler());
    sendBillReminder = vi.fn().mockResolvedValue({});
    sendWeeklyDigest = vi.fn().mockResolvedValue({});
    sendMonthlySummary = vi.fn().mockResolvedValue({});
    setReminderDay = vi.fn();
    setDigestWeek = vi.fn();
    db = {
      allUsersWithData: vi.fn(),
      setReminderDay,
      setSummaryMonth: vi.fn(),
      setDigestWeek,
    };
  });

  const mailer = () => ({ sendBillReminder, sendWeeklyDigest, sendMonthlySummary });

  it('honors a custom reminder lead time', async () => {
    // 2026-06-17 (8am ET); bill due on the 22nd is 5 days out.
    db.allUsersWithData.mockReturnValue([
      makeUser({
        settings: { billReminders: true, reminderLeadDays: 5 },
        bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 22 }],
      }),
    ]);

    await runChecks(new Date('2026-06-17T12:00:00.000Z'), { db, emails: mailer() });

    expect(sendBillReminder).toHaveBeenCalledOnce();
    expect(sendBillReminder.mock.calls[0][2]).toBe(5);
  });

  it('clamps an out-of-range lead time back into 0..14', async () => {
    db.allUsersWithData.mockReturnValue([
      makeUser({
        settings: { billReminders: true, reminderLeadDays: 999 },
        bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 1 }], // 14 days out
      }),
    ]);

    await runChecks(new Date('2026-06-17T12:00:00.000Z'), { db, emails: mailer() });

    // Clamped to 14 → the bill due on the 1st (14 days out) matches.
    expect(sendBillReminder).toHaveBeenCalledOnce();
    expect(sendBillReminder.mock.calls[0][2]).toBe(14);
  });

  it('also reminds on the due day when remindOnDueDay is on', async () => {
    // 2026-06-17; a bill due today (the 17th) and one due in 3 days (the 20th).
    db.allUsersWithData.mockReturnValue([
      makeUser({
        settings: { billReminders: true, remindOnDueDay: true },
        bills: [
          { id: 'today', name: 'Power', amount: 90, dueDay: 17 },
          { id: 'soon', name: 'Rent', amount: 1450, dueDay: 20 },
        ],
      }),
    ]);

    await runChecks(new Date('2026-06-17T12:00:00.000Z'), { db, emails: mailer() });

    // One email for the 3-day lead, one for the due-day (0 lead).
    expect(sendBillReminder).toHaveBeenCalledTimes(2);
    const leads = sendBillReminder.mock.calls.map((c) => c[2]).sort();
    expect(leads).toEqual([0, 3]);
  });

  it('reminds on every day in reminderOffsets', async () => {
    // 2026-06-17; bills due today (0 out), the 20th (3 out), and the 24th (7 out).
    db.allUsersWithData.mockReturnValue([
      makeUser({
        settings: { billReminders: true, reminderOffsets: [7, 3, 0] },
        bills: [
          { id: 'today', name: 'Power', amount: 90, dueDay: 17 },
          { id: 'soon', name: 'Rent', amount: 1450, dueDay: 20 },
          { id: 'later', name: 'Car', amount: 320, dueDay: 24 },
        ],
      }),
    ]);

    await runChecks(new Date('2026-06-17T12:00:00.000Z'), { db, emails: mailer() });

    expect(sendBillReminder).toHaveBeenCalledTimes(3);
    const leads = sendBillReminder.mock.calls.map((c) => c[2]).sort((a, b) => a - b);
    expect(leads).toEqual([0, 3, 7]);
  });

  it('reminderOffsets wins over the legacy lead + due-day pair', async () => {
    // Legacy keys say "5 days out, plus the due day"; the array says 3 only.
    db.allUsersWithData.mockReturnValue([
      makeUser({
        settings: {
          billReminders: true,
          reminderOffsets: [3],
          reminderLeadDays: 5,
          remindOnDueDay: true,
        },
        bills: [
          { id: 'today', name: 'Power', amount: 90, dueDay: 17 },
          { id: 'soon', name: 'Rent', amount: 1450, dueDay: 20 },
          { id: 'five', name: 'Gym', amount: 40, dueDay: 22 },
        ],
      }),
    ]);

    await runChecks(new Date('2026-06-17T12:00:00.000Z'), { db, emails: mailer() });

    expect(sendBillReminder).toHaveBeenCalledOnce();
    expect(sendBillReminder.mock.calls[0][2]).toBe(3);
  });

  it('an empty reminderOffsets array sends nothing, and does not fall back', async () => {
    db.allUsersWithData.mockReturnValue([
      makeUser({
        settings: { billReminders: true, reminderOffsets: [], reminderLeadDays: 3 },
        bills: [{ id: 'soon', name: 'Rent', amount: 1450, dueDay: 20 }],
      }),
    ]);

    await runChecks(new Date('2026-06-17T12:00:00.000Z'), { db, emails: mailer() });

    expect(sendBillReminder).not.toHaveBeenCalled();
    // Still stamped: nothing failed, so there's nothing to retry today.
    expect(setReminderDay).toHaveBeenCalledWith(1, '2026-06-17');
  });

  it('drops out-of-range and duplicate offsets, keeping at most five', async () => {
    const { reminderOffsets } = loadScheduler();
    expect(reminderOffsets({ reminderOffsets: [3, 3, 99, -1, 0] })).toEqual([3, 0]);
    expect(reminderOffsets({ reminderOffsets: [1, 2, 3, 5, 7, 10, 14] })).toEqual([14, 10, 7, 5, 3]);
    // Absent array → the legacy pair.
    expect(reminderOffsets({ reminderLeadDays: 5, remindOnDueDay: true })).toEqual([5, 0]);
    expect(reminderOffsets({})).toEqual([3]);
  });

  it('respects a custom notify hour', async () => {
    const user = () => makeUser({
      settings: { billReminders: true, notifyHour: 12 },
      bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 20 }],
    });

    // 8am ET — not the chosen hour, so nothing sends.
    db.allUsersWithData.mockReturnValue([user()]);
    await runChecks(new Date('2026-06-17T12:00:00.000Z'), { db, emails: mailer() });
    expect(sendBillReminder).not.toHaveBeenCalled();

    // 12pm ET — the chosen hour.
    db.allUsersWithData.mockReturnValue([user()]);
    await runChecks(new Date('2026-06-17T16:00:00.000Z'), { db, emails: mailer() });
    expect(sendBillReminder).toHaveBeenCalledOnce();
  });

  it('sends the weekly digest on Monday and stamps the ISO week', async () => {
    // 2026-06-15 is a Monday; 8am ET.
    db.allUsersWithData.mockReturnValue([
      makeUser({
        settings: { billReminders: false, weeklyDigest: true },
        bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 18 }], // due in 3 days
        cards: [{ balance: 200 }],
      }),
    ]);

    await runChecks(new Date('2026-06-15T12:00:00.000Z'), { db, emails: mailer() });

    expect(sendWeeklyDigest).toHaveBeenCalledOnce();
    const digest = sendWeeklyDigest.mock.calls[0][1];
    expect(digest.upcoming).toHaveLength(1);
    expect(digest.debtTotal).toBe(200);
    expect(setDigestWeek).toHaveBeenCalledWith(1, expect.stringMatching(/^2026-W\d\d$/));
  });

  it('does not send the weekly digest off Monday', async () => {
    db.allUsersWithData.mockReturnValue([
      makeUser({
        settings: { billReminders: false, weeklyDigest: true },
        bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 18 }],
      }),
    ]);

    // 2026-06-17 is a Wednesday.
    await runChecks(new Date('2026-06-17T12:00:00.000Z'), { db, emails: mailer() });

    expect(sendWeeklyDigest).not.toHaveBeenCalled();
    expect(setDigestWeek).not.toHaveBeenCalled();
  });

  it('does not resend the digest within the same ISO week', async () => {
    const monday = makeUser({
      settings: { billReminders: false, weeklyDigest: true },
      bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 18 }],
    });
    monday.last_digest_week = '2026-W25'; // the week containing 2026-06-15
    db.allUsersWithData.mockReturnValue([monday]);

    await runChecks(new Date('2026-06-15T12:00:00.000Z'), { db, emails: mailer() });

    expect(sendWeeklyDigest).not.toHaveBeenCalled();
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

  it('records the mark in settings.autopayDone so it happens once', async () => {
    const user = makeUser({
      settings: { billReminders: false, autopayMark: true },
      bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }],
      payments: [],
    });
    db.allUsersWithData.mockReturnValue([user]);

    await runChecks(new Date('2026-06-20T13:00:00.000Z'), { db, emails: {} });

    const saved = upsertUserData.mock.calls[0][1];
    expect(saved.settings.autopayDone['2026-06']).toContain('bill:b1');
  });

  it('does not revert a user undo: an item in autopayDone is left alone', async () => {
    // The mark already happened earlier this month and the user removed the
    // payment (undo). The per-month memory must stop us re-adding it.
    const user = makeUser({
      last_autopay_day: null,
      settings: {
        billReminders: false, autopayMark: true,
        autopayDone: { '2026-06': ['bill:b1'] },
      },
      bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }],
      payments: [],
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

  /* Was: asserts setInterval(3_600_000). Node re-arms an interval only after its
     callback resolves, so each pass's duration was added to the next delay — a
     pass that awaits SMTP for every user drifts until it steps over a whole
     hour, and since every send fires on an exact `hour === notifyHour` match,
     the users in the skipped hour silently get nothing. Now hour-aligned. */
  it('arms the next tick on the top of the hour, plus a boot catch-up, only once', () => {
    vi.setSystemTime(new Date('2026-06-17T12:20:00.000Z'));
    const timeoutSpy = vi.spyOn(global, 'setTimeout');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { start } = loadScheduler();

    start();
    start();   // idempotent

    // Two timers: the hour-aligned tick and the 5s boot catch-up.
    expect(timeoutSpy).toHaveBeenCalledTimes(2);
    const delays = timeoutSpy.mock.calls.map((c) => c[1]);
    expect(delays).toContain(5000);

    // The other lands at the next :00:30 — 40m30s after :20.
    expect(delays.find((d) => d !== 5000)).toBe((40 * 60 + 30) * 1000);
    expect(logSpy).toHaveBeenCalledWith('scheduler started (reminders + monthly summary)');

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

  it('logs when an hourly tick rejects, and keeps ticking', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fakeHandle = { unref: vi.fn() };
    // The hour-aligned tick is armed with setTimeout now, not setInterval.
    const cbs = [];
    vi.spyOn(global, 'setTimeout').mockImplementation((cb) => {
      cbs.push(cb);
      return fakeHandle;
    });
    const sched = loadScheduler();
    const runChecksSpy = vi.spyOn(sched, 'runChecks').mockRejectedValue(new Error('tick fail'));

    sched.start();
    await cbs[0]();

    expect(runChecksSpy).toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith('scheduler tick failed', 'tick fail');
    // A rejected pass must not kill the loop — it re-arms for the next hour.
    expect(cbs.length).toBeGreaterThan(2);

    errSpy.mockRestore();
    runChecksSpy.mockRestore();
    vi.mocked(setTimeout).mockRestore();
  });
});

describe('scheduler — trial reminders', () => {
  it('sends trial-ending email when billReminders is on', async () => {
    const sendTrialReminder = vi.fn().mockResolvedValue(undefined);
    const setTrialReminderDay = vi.fn();
    const db = {
      allUsersWithData: vi.fn().mockReturnValue([{
        id: 1,
        email: 'user@example.com',
        email_verified: 1,
        last_reminder_day: null,
        last_trial_reminder_day: null,
        data: {
          settings: { timezone: 'America/New_York', billReminders: true, reminderLeadDays: 3 },
          bills: [{ id: 'b1', name: 'Hulu', category: 'Subscriptions', trialEnds: '2026-06-20' }],
        },
      }]),
      setReminderDay: vi.fn(),
      setTrialReminderDay,
    };
    const sched = loadScheduler();
    await sched.runChecks(new Date('2026-06-17T12:00:00.000Z'), {
      db,
      emails: { sendTrialReminder, sendBillReminder: vi.fn() },
    });
    expect(sendTrialReminder).toHaveBeenCalledOnce();
    expect(setTrialReminderDay).toHaveBeenCalledWith(1, '2026-06-17');
  });
});

describe('scheduler — offer reminders', () => {
  function offerUser() {
    return {
      id: 1,
      email: 'user@example.com',
      email_verified: 1,
      last_reminder_day: null,
      last_offer_reminder_day: null,
      data: {
        settings: { timezone: 'America/New_York', offerReminders: true, reminderLeadDays: 3 },
        cards: [{
          id: 'c1', name: 'Amex Gold',
          offers: [
            { id: 'o1', merchant: 'Dell', detail: '$50 back', expires: '2026-06-20', used: false }, // 3 days out
            { id: 'used', merchant: 'Nike', detail: '$20 back', expires: '2026-06-20', used: true }, // skip — used
          ],
        }],
      },
    };
  }

  it('emails Pro users before an activated offer expires, and stamps the day', async () => {
    const sendOfferReminder = vi.fn().mockResolvedValue(undefined);
    const setOfferReminderDay = vi.fn();
    const db = { allUsersWithData: vi.fn().mockReturnValue([offerUser()]), setOfferReminderDay };
    const sched = loadScheduler({ pro: true });
    await sched.runChecks(new Date('2026-06-17T12:00:00.000Z'), {
      db, emails: { sendOfferReminder },
    });
    expect(sendOfferReminder).toHaveBeenCalledOnce();
    const sent = sendOfferReminder.mock.calls[0][1];
    expect(sent.map((o) => o.merchant)).toEqual(['Dell']); // used offer excluded
    expect(setOfferReminderDay).toHaveBeenCalledWith(1, '2026-06-17');
  });

  it('does not email when the user is not Pro', async () => {
    const sendOfferReminder = vi.fn().mockResolvedValue(undefined);
    const db = { allUsersWithData: vi.fn().mockReturnValue([offerUser()]), setOfferReminderDay: vi.fn() };
    const sched = loadScheduler({ pro: false });
    await sched.runChecks(new Date('2026-06-17T12:00:00.000Z'), { db, emails: { sendOfferReminder } });
    expect(sendOfferReminder).not.toHaveBeenCalled();
  });

  it('offersExpiringOn finds active offers at an exact lead', () => {
    const sched = loadScheduler({ pro: true });
    const lp = sched.localParts(new Date('2026-06-17T12:00:00.000Z'), 'America/New_York');
    const data = offerUser().data;
    expect(sched.offersExpiringOn(data, lp, 3).map((o) => o.merchant)).toEqual(['Dell']);
    expect(sched.offersExpiringOn(data, lp, 5)).toEqual([]);
  });
});

describe('scheduler — archived items are soft-deleted everywhere', () => {
  // `archived` is part of the client-side `billActive` gate but was missing
  // from the server's, so soft-deleted records still drove reminders, totals
  // and — worst — autopay auto-marks that wrote phantom payments back into
  // the user's data and synced to every device.
  const lpFor = (sched) => sched.localParts(new Date('2026-06-17T12:00:00.000Z'), 'America/New_York');

  it('billActiveOn rejects an archived bill that is otherwise in window', () => {
    const sched = loadScheduler();
    expect(sched.billActiveOn({ id: 'b1', dueDay: 18 }, '2026-06-17')).toBe(true);
    expect(sched.billActiveOn({ id: 'b1', dueDay: 18, archived: true }, '2026-06-17')).toBe(false);
  });

  it('trialsEndingOn skips an archived subscription', () => {
    const sched = loadScheduler();
    const lp = lpFor(sched);
    const live = { id: 'b1', name: 'Netflix', trialEnds: '2026-06-20' };
    expect(sched.trialsEndingOn({ bills: [live] }, lp, 3).map((b) => b.name)).toEqual(['Netflix']);
    expect(sched.trialsEndingOn({ bills: [{ ...live, archived: true }] }, lp, 3)).toEqual([]);
  });

  it('offersExpiringOn skips offers on an archived card', () => {
    const sched = loadScheduler({ pro: true });
    const lp = lpFor(sched);
    const card = { id: 'c1', name: 'Amex', offers: [{ merchant: 'Dell', expires: '2026-06-20' }] };
    expect(sched.offersExpiringOn({ cards: [card] }, lp, 3).map((o) => o.merchant)).toEqual(['Dell']);
    expect(sched.offersExpiringOn({ cards: [{ ...card, archived: true }] }, lp, 3)).toEqual([]);
  });

  it('summarize excludes archived bills and archived card debt', () => {
    const sched = loadScheduler();
    const lp = lpFor(sched);
    const data = {
      bills: [{ id: 'b1', amount: 100, dueDay: 5 }, { id: 'b2', amount: 50, dueDay: 6, archived: true }],
      cards: [{ id: 'c1', balance: 800 }, { id: 'c2', balance: 400, archived: true }],
      payments: [],
    };
    const out = sched.summarize(data, lp);
    expect(out.billsTotal).toBe(100);
    expect(out.billsCount).toBe(1);
    expect(out.debtTotal).toBe(800);
  });

  it('weeklyDigest excludes archived bills and archived card debt', () => {
    const sched = loadScheduler();
    const lp = lpFor(sched);
    const data = {
      bills: [
        { id: 'b1', name: 'Rent', amount: 1450, dueDay: 18 },
        { id: 'b2', name: 'Gone', amount: 99, dueDay: 18, archived: true },
      ],
      cards: [{ id: 'c1', balance: 800 }, { id: 'c2', balance: 400, archived: true }],
    };
    const out = sched.weeklyDigest(data, lp);
    expect(out.upcoming.map((b) => b.name)).toEqual(['Rent']);
    expect(out.upcomingTotal).toBe(1450);
    expect(out.debtTotal).toBe(800);
  });

  it('markAutopay never auto-marks an archived bill or card', () => {
    const sched = loadScheduler({ pro: true });
    const lp = lpFor(sched);
    const data = {
      bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: lp.d, autopay: true, archived: true }],
      cards: [{ id: 'c1', name: 'Amex', minPayment: 35, dueDay: lp.d, autopay: true, archived: true }],
      payments: [],
      settings: {},
    };
    expect(sched.markAutopay(data, lp)).toBe(false);
    expect(data.payments).toEqual([]);
  });

  it('markAutopay still marks the live equivalents', () => {
    const sched = loadScheduler({ pro: true });
    const lp = lpFor(sched);
    const data = {
      bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: lp.d, autopay: true }],
      cards: [{ id: 'c1', name: 'Amex', minPayment: 35, dueDay: lp.d, autopay: true }],
      payments: [],
      settings: {},
    };
    expect(sched.markAutopay(data, lp)).toBe(true);
    expect(data.payments.map((p) => p.type).sort()).toEqual(['bill', 'card']);
  });
});

/* Push rides alongside every email, but on its own delivery path: a dead token
   must never gate the email's "already sent" stamp, or the email is re-sent
   forever. `pushNotifications` is the single opt-in for all five. */
describe('scheduler — push notifications', () => {
  const AT_SEND_HOUR = new Date('2026-06-17T12:00:00.000Z');   // 08:00 America/New_York
  const MONDAY = new Date('2026-06-15T12:00:00.000Z');
  const FIRST_OF_MONTH = new Date('2026-06-01T12:00:00.000Z');

  function mailer() {
    return {
      sendBillReminder: vi.fn().mockResolvedValue({}),
      sendTrialReminder: vi.fn().mockResolvedValue({}),
      sendOfferReminder: vi.fn().mockResolvedValue({}),
      sendWeeklyDigest: vi.fn().mockResolvedValue({}),
      sendMonthlySummary: vi.fn().mockResolvedValue({}),
    };
  }

  function makeDb(users) {
    return {
      allUsersWithData: vi.fn(() => users),
      setReminderDay: vi.fn(),
      setTrialReminderDay: vi.fn(),
      setOfferReminderDay: vi.fn(),
      setDigestWeek: vi.fn(),
      setSummaryMonth: vi.fn(),
    };
  }

  it('sends a bill-reminder push alongside the email', async () => {
    const push = makePush();
    const { runChecks } = loadScheduler({ push });
    const db = makeDb([
      makeUser({
        settings: { pushNotifications: true },
        bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 20 }],
      }),
    ]);
    const emails = mailer();

    await runChecks(AT_SEND_HOUR, { db, emails });

    expect(emails.sendBillReminder).toHaveBeenCalledOnce();
    expect(push.sendBillReminderPush).toHaveBeenCalledWith(
      1,
      [expect.objectContaining({ name: 'Rent' })],
      3,
      'USD',
    );
  });

  it('sends a trial-reminder push alongside the email', async () => {
    const push = makePush();
    const { runChecks } = loadScheduler({ push });
    const db = makeDb([
      makeUser({
        settings: { pushNotifications: true },
        bills: [{ id: 'b1', name: 'Netflix', trialEnds: '2026-06-20' }],
      }),
    ]);
    const emails = mailer();

    await runChecks(AT_SEND_HOUR, { db, emails });

    expect(emails.sendTrialReminder).toHaveBeenCalledOnce();
    expect(push.sendTrialReminderPush).toHaveBeenCalledWith(
      1,
      [expect.objectContaining({ name: 'Netflix' })],
      3,
    );
  });

  it('sends an offer-reminder push alongside the email (Pro only)', async () => {
    const push = makePush();
    const { runChecks } = loadScheduler({ pro: true, push });
    const db = makeDb([
      makeUser({
        settings: { billReminders: false, offerReminders: true, pushNotifications: true },
        cards: [{
          id: 'c1',
          name: 'Amex',
          offers: [{ merchant: 'Dell', detail: '$50 back', expires: '2026-06-20' }],
        }],
      }),
    ]);
    const emails = mailer();

    await runChecks(AT_SEND_HOUR, { db, emails });

    expect(emails.sendOfferReminder).toHaveBeenCalledOnce();
    expect(push.sendOfferReminderPush).toHaveBeenCalledWith(
      1,
      [expect.objectContaining({ merchant: 'Dell', cardName: 'Amex' })],
      3,
    );
  });

  it('sends a weekly-digest push alongside the email', async () => {
    const push = makePush();
    const { runChecks } = loadScheduler({ push });
    const db = makeDb([
      makeUser({
        settings: { billReminders: false, weeklyDigest: true, pushNotifications: true },
        bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 18 }],
      }),
    ]);
    const emails = mailer();

    await runChecks(MONDAY, { db, emails });

    expect(emails.sendWeeklyDigest).toHaveBeenCalledOnce();
    expect(push.sendWeeklyDigestPush).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ upcomingTotal: 1450 }),
      'USD',
    );
  });

  it('sends a monthly-summary push alongside the email', async () => {
    const push = makePush();
    const { runChecks } = loadScheduler({ push });
    const db = makeDb([
      makeUser({
        settings: {
          billReminders: false,
          monthlySummary: true,
          pushNotifications: true,
        },
        bills: [{ id: 'b1', name: 'Rent', amount: 1500 }],
        payments: [{ monthKey: '2026-05', amount: 1800 }],
      }),
    ]);
    const emails = mailer();

    await runChecks(FIRST_OF_MONTH, { db, emails });

    expect(emails.sendMonthlySummary).toHaveBeenCalledOnce();
    expect(push.sendMonthlySummaryPush).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ paid: 1800, billsTotal: 1500 }),
      'USD',
    );
  });

  it('leaves push alone when the user has not opted in', async () => {
    const push = makePush();
    const { runChecks } = loadScheduler({ push });
    const db = makeDb([
      makeUser({ bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 20 }] }),
    ]);
    const emails = mailer();

    await runChecks(AT_SEND_HOUR, { db, emails });

    expect(emails.sendBillReminder).toHaveBeenCalledOnce();
    expect(push.sendBillReminderPush).not.toHaveBeenCalled();
  });

  /* A push failure is swallowed: it has its own delivery path, so letting it
     block the email stamp would re-send the email on every later pass. */
  it('a failing push is logged but still stamps the email as delivered', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const push = makePush({
      sendBillReminderPush: vi.fn().mockRejectedValue(new Error('token gone')),
    });
    const { runChecks } = loadScheduler({ push });
    const db = makeDb([
      makeUser({
        settings: { pushNotifications: true },
        bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 20 }],
      }),
    ]);

    await runChecks(AT_SEND_HOUR, { db, emails: mailer() });

    expect(db.setReminderDay).toHaveBeenCalledWith(1, '2026-06-17');
    expect(err).toHaveBeenCalledWith(
      'push reminder failed', 'user@example.com', 'token gone',
    );
    err.mockRestore();
  });
});

describe('scheduler — autopayDay overrides the due day', () => {
  const lpFor = (sched) => sched.localParts(new Date('2026-06-17T12:00:00.000Z'), 'America/New_York');

  it('marks a bill on its autopay day rather than its due day', () => {
    const sched = loadScheduler({ pro: true });
    const lp = lpFor(sched);   // the 17th
    const data = {
      // Due on the 25th, but the bank pulls on the 17th.
      bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 25, autopayDay: lp.d, autopay: true }],
      payments: [],
      settings: {},
    };

    expect(sched.markAutopay(data, lp)).toBe(true);
    expect(data.payments).toEqual([
      expect.objectContaining({ type: 'bill', refId: 'b1', amount: 1450, date: '2026-06-17' }),
    ]);
  });

  it('waits for the autopay day even when the bill is due today', () => {
    const sched = loadScheduler({ pro: true });
    const lp = lpFor(sched);
    const data = {
      bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: lp.d, autopayDay: lp.d + 1, autopay: true }],
      payments: [],
      settings: {},
    };

    expect(sched.markAutopay(data, lp)).toBe(false);
    expect(data.payments).toEqual([]);
  });

  /* The autopay day is only the trigger — the bill still has to be scheduled
     somewhere in this month, or an annual bill would be pulled every month. */
  it('does not mark on the autopay day when the bill is not scheduled this month', () => {
    const sched = loadScheduler({ pro: true });
    const lp = lpFor(sched);
    const data = {
      bills: [{
        id: 'b1', name: 'Domain', amount: 18, frequency: 'Annually',
        startDate: '2026-01-10', autopayDay: lp.d, autopay: true,
      }],
      payments: [],
      settings: {},
    };

    expect(sched.markAutopay(data, lp)).toBe(false);
    expect(data.payments).toEqual([]);
  });

  it('honors an autopayDay on a card too', () => {
    const sched = loadScheduler({ pro: true });
    const lp = lpFor(sched);
    const data = {
      cards: [{ id: 'c1', name: 'Amex', minPayment: 35, dueDay: 25, autopayDay: lp.d, autopay: true }],
      payments: [],
      settings: {},
    };

    expect(sched.markAutopay(data, lp)).toBe(true);
    expect(data.payments).toEqual([
      expect.objectContaining({ type: 'card', refId: 'c1', amount: 35 }),
    ]);
  });
});

describe('scheduler — weeklyDigest ordering', () => {
  it('sorts upcoming bills soonest-first', () => {
    const sched = loadScheduler();
    const lp = sched.localParts(new Date('2026-06-15T12:00:00.000Z'), 'America/New_York');
    const data = {
      bills: [
        { id: 'b1', name: 'Later', amount: 30, dueDay: 20 },
        { id: 'b2', name: 'Today', amount: 10, dueDay: 15 },
        { id: 'b3', name: 'Soon', amount: 20, dueDay: 17 },
        { id: 'b4', name: 'Beyond the window', amount: 99, dueDay: 30 },
      ],
    };

    const out = sched.weeklyDigest(data, lp);
    expect(out.upcoming.map((b) => b.name)).toEqual(['Today', 'Soon', 'Later']);
    expect(out.upcoming.map((b) => b.daysUntil)).toEqual([0, 2, 5]);
    expect(out.upcomingTotal).toBe(60);
  });

  /* A startDate-only bill has no dueDay — its recurrence keys off the start
     day-of-month — so the digest has to accept either as "schedulable". */
  it('includes a startDate-only bill', () => {
    const sched = loadScheduler();
    const lp = sched.localParts(new Date('2026-06-15T12:00:00.000Z'), 'America/New_York');
    const out = sched.weeklyDigest(
      { bills: [{ id: 'b1', name: 'Weekly gym', amount: 12, frequency: 'Weekly', startDate: '2026-06-01' }] },
      lp,
    );
    expect(out.upcoming.map((b) => b.name)).toEqual(['Weekly gym']);
  });
});

describe('scheduler — daysUntilYmd', () => {
  it('is null for anything that is not a plain YYYY-MM-DD', () => {
    const sched = loadScheduler();
    const lp = sched.localParts(new Date('2026-06-15T12:00:00.000Z'), 'America/New_York');

    expect(sched.daysUntilYmd('', lp)).toBeNull();
    expect(sched.daysUntilYmd(null, lp)).toBeNull();
    expect(sched.daysUntilYmd('2026-6-5', lp)).toBeNull();     // unpadded
    expect(sched.daysUntilYmd('2026-06-15T00:00', lp)).toBeNull(); // has a time
    expect(sched.daysUntilYmd('2026-06-20', lp)).toBe(5);
  });

  it('propagates through the trial and offer scans as "never matches"', () => {
    const sched = loadScheduler();
    const lp = sched.localParts(new Date('2026-06-15T12:00:00.000Z'), 'America/New_York');

    expect(sched.trialsEndingOn({ bills: [{ id: 'b1', trialEnds: '20260620' }] }, lp, 3)).toEqual([]);
    expect(sched.offersExpiringOn(
      { cards: [{ id: 'c1', offers: [{ merchant: 'Dell', expires: 'soon' }] }] }, lp, 3,
    )).toEqual([]);
  });
});

describe('scheduler — offersExpiringOn labels', () => {
  it('falls back to generic labels for an offer or card with no name', () => {
    const sched = loadScheduler();
    const lp = sched.localParts(new Date('2026-06-17T12:00:00.000Z'), 'America/New_York');

    const out = sched.offersExpiringOn(
      { cards: [{ id: 'c1', offers: [{ id: 'o1', expires: '2026-06-20' }] }] },
      lp,
      3,
    );
    expect(out).toEqual([
      { merchant: 'Offer', detail: '', expires: '2026-06-20', cardName: 'Card' },
    ]);
  });
});

describe('scheduler — billActiveOn without an item', () => {
  it('is false rather than throwing', () => {
    const sched = loadScheduler();
    expect(sched.billActiveOn(null, '2026-06-17')).toBe(false);
    expect(sched.billActiveOn(undefined, '2026-06-17')).toBe(false);
  });
});

/* markAutopay is the one place the server writes into a user's data, so its
   guards matter more than most: everything it declines to mark is a phantom
   payment that would otherwise sync to every device. */
describe('scheduler — markAutopay guards', () => {
  const lpFor = (sched, iso = '2026-06-20T13:00:00.000Z') =>
    sched.localParts(new Date(iso), 'America/New_York');

  it('creates the payments and settings containers when the blob has none', () => {
    const sched = loadScheduler();
    const data = { bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }] };

    expect(sched.markAutopay(data, lpFor(sched))).toBe(true);
    expect(data.payments).toHaveLength(1);
    expect(data.settings.autopayDone['2026-06']).toEqual(['bill:b1']);
  });

  it('ignores items that are not on autopay', () => {
    const sched = loadScheduler();
    const data = {
      bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 20 }],
      cards: [{ id: 'c1', name: 'Visa', minPayment: 35, dueDay: 20 }],
      payments: [], settings: {},
    };
    expect(sched.markAutopay(data, lpFor(sched))).toBe(false);
    expect(data.payments).toEqual([]);
  });

  /* Blank is unfinished setup, not a $0 charge: marking it would invent a
     payment that never happened and feed a 0 into the rollover prefill. */
  it('ignores an item whose amount was never filled in', () => {
    const sched = loadScheduler();
    const data = {
      bills: [
        { id: 'b1', name: 'Water', amount: null, dueDay: 20, autopay: true },
        { id: 'b2', name: 'Power', amount: '', dueDay: 20, autopay: true },
        { id: 'b3', name: 'Gas', amount: '   ', dueDay: 20, autopay: true },
        { id: 'b4', name: 'Trash', amount: 'n/a', dueDay: 20, autopay: true },
      ],
      cards: [{ id: 'c1', name: 'Visa', dueDay: 20, autopay: true }],
      payments: [], settings: {},
    };
    expect(sched.markAutopay(data, lpFor(sched))).toBe(false);
    expect(data.payments).toEqual([]);

    // An explicit 0 is a real answer and still marks.
    data.bills = [{ id: 'b5', name: 'Water', amount: 0, dueDay: 20, autopay: true }];
    expect(sched.markAutopay(data, lpFor(sched))).toBe(true);
    expect(data.payments[0].amount).toBe(0);
  });

  it('ignores a bill that is not due today and a card whose day has not come', () => {
    const sched = loadScheduler();
    const data = {
      bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 25, autopay: true }],
      cards: [
        { id: 'c1', name: 'Visa', minPayment: 35, dueDay: 25, autopay: true },
        { id: 'c2', name: 'No day', minPayment: 35, autopay: true },
      ],
      payments: [], settings: {},
    };
    expect(sched.markAutopay(data, lpFor(sched))).toBe(false);
    expect(data.payments).toEqual([]);
  });

  it('names an unnamed bill and card in the payments it writes', () => {
    const sched = loadScheduler();
    const data = {
      bills: [{ id: 'b1', amount: 1500, dueDay: 20, autopay: true }],
      cards: [{ id: 'c1', minPayment: 35, dueDay: 20, autopay: true }],
      payments: [], settings: {},
    };
    expect(sched.markAutopay(data, lpFor(sched))).toBe(true);
    expect(data.payments.map((p) => p.name)).toEqual(['Bill', 'Card (payment)']);
  });

  /* The memory is pruned as it is written: buckets older than the longest
     rolling window a client may read across go, the rest stay. */
  it('prunes autopayDone buckets older than four months', () => {
    const sched = loadScheduler();
    const data = {
      bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }],
      payments: [],
      settings: {
        autopayDone: {
          '2025-11': ['bill:ancient'],  // dropped
          '2026-04': ['bill:keep'],     // kept
          '2026-06': ['bill:earlier'],  // this month — merged
        },
      },
    };

    expect(sched.markAutopay(data, lpFor(sched))).toBe(true);
    const done = data.settings.autopayDone;
    expect(Object.keys(done).sort()).toEqual(['2026-04', '2026-06']);
    expect(done['2026-04']).toEqual(['bill:keep']);
    expect(done['2026-06'].sort()).toEqual(['bill:b1', 'bill:earlier']);
  });
});

describe('scheduler — runChecks fallbacks and failure paths', () => {
  const userWith = (overrides = {}) => ({
    id: 1,
    email: 'user@example.com',
    email_verified: 1,
    last_reminder_day: null,
    last_summary_month: null,
    last_offer_reminder_day: null,
    last_digest_week: null,
    last_autopay_day: null,
    ...overrides,
  });

  it('falls back to the default timezone when the user has not chosen one', async () => {
    const sendBillReminder = vi.fn().mockResolvedValue(undefined);
    const setReminderDay = vi.fn();
    const db = {
      allUsersWithData: vi.fn().mockReturnValue([userWith({
        data: {
          settings: { billReminders: true },   // no timezone
          bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 20 }],
        },
      })]),
      setReminderDay,
    };
    const sched = loadScheduler();

    // 12:00 UTC is 08:00 in America/New_York, the default send hour.
    await sched.runChecks(new Date('2026-06-17T12:00:00.000Z'), { db, emails: { sendBillReminder } });

    expect(sendBillReminder).toHaveBeenCalledOnce();
    expect(setReminderDay).toHaveBeenCalledWith(1, '2026-06-17');
  });

  /* Nothing can place a user's local day if the clock itself is unusable, so
     the pass skips them rather than sending against a NaN date. */
  it('skips a user when the local day cannot be resolved at all', async () => {
    const sendBillReminder = vi.fn().mockResolvedValue(undefined);
    const setReminderDay = vi.fn();
    const db = {
      allUsersWithData: vi.fn().mockReturnValue([userWith({
        data: {
          settings: { timezone: 'Not/AZone', billReminders: true },
          bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 20 }],
        },
      })]),
      setReminderDay,
    };
    const sched = loadScheduler();

    await expect(sched.runChecks(new Date('nonsense'), { db, emails: { sendBillReminder } }))
      .resolves.toBeUndefined();
    expect(sendBillReminder).not.toHaveBeenCalled();
    expect(setReminderDay).not.toHaveBeenCalled();
  });

  it('treats an entitlement lookup failure as not Pro', async () => {
    const upsertUserData = vi.fn();
    const db = {
      allUsersWithData: vi.fn().mockReturnValue([userWith({
        data: {
          settings: { timezone: 'America/New_York', autopayMark: true },
          bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 20, autopay: true }],
        },
      })]),
      upsertUserData,
      setAutopayDay: vi.fn(),
    };
    const sched = loadScheduler({
      billing: { computeEntitlement: () => { throw new Error('db unavailable'); } },
    });

    await sched.runChecks(new Date('2026-06-20T13:00:00.000Z'), { db, emails: {} });

    // Pro-gated, and the entitlement is unknown → no auto-mark.
    expect(upsertUserData).not.toHaveBeenCalled();
  });

  /* Every "already sent" stamp is optional on the db handle so an older
     deployment (or a partial fake) does not crash the whole pass. */
  it('runs without the optional stamp helpers on the db handle', async () => {
    const sched = loadScheduler({ pro: true });
    const db = {
      allUsersWithData: vi.fn().mockReturnValue([userWith({
        data: {
          settings: {
            timezone: 'America/New_York',
            autopayMark: true, offerReminders: true, weeklyDigest: true,
          },
          bills: [{ id: 'b1', name: 'Rent', amount: 1500, dueDay: 22, autopay: true }],
          cards: [{ id: 'c1', name: 'Amex', offers: [{ id: 'o1', merchant: 'Dell', expires: '2026-06-25' }] }],
        },
      })]),
      upsertUserData: vi.fn(),
      // No setAutopayDay / setOfferReminderDay / setDigestWeek.
    };
    const emails = {
      sendOfferReminder: vi.fn().mockResolvedValue(undefined),
      sendWeeklyDigest: vi.fn().mockResolvedValue(undefined),
    };

    // Mon 2026-06-22, 08:00 local — autopay hour is 09:00, digest day is Monday.
    await sched.runChecks(new Date('2026-06-22T12:00:00.000Z'), { db, emails });
    expect(emails.sendWeeklyDigest).toHaveBeenCalledOnce();
    expect(emails.sendOfferReminder).toHaveBeenCalledOnce();

    // 09:00 local — the autopay mark runs and has no day-stamp helper to call.
    await sched.runChecks(new Date('2026-06-22T13:00:00.000Z'), { db, emails });
    expect(db.upsertUserData).toHaveBeenCalledOnce();
  });

  it('does not stamp the offer-reminder day when nothing is expiring', async () => {
    const sendOfferReminder = vi.fn().mockResolvedValue(undefined);
    const setOfferReminderDay = vi.fn();
    const db = {
      allUsersWithData: vi.fn().mockReturnValue([userWith({
        data: {
          settings: { timezone: 'America/New_York', offerReminders: true },
          cards: [{ id: 'c1', name: 'Amex', offers: [{ id: 'o1', merchant: 'Dell', expires: '2027-01-01' }] }],
        },
      })]),
      setOfferReminderDay,
    };
    const sched = loadScheduler({ pro: true });

    await sched.runChecks(new Date('2026-06-17T12:00:00.000Z'), { db, emails: { sendOfferReminder } });

    expect(sendOfferReminder).not.toHaveBeenCalled();
    // Nothing was due, so the day is still stamped — we should not rescan all day.
    expect(setOfferReminderDay).toHaveBeenCalledWith(1, '2026-06-17');
  });

  /* `deps` is a test seam; the production tick calls runChecks(new Date())
     with nothing, so the real db/mailer modules have to be the defaults. */
  it('uses the real mailer module when none is injected', async () => {
    const sendBillReminder = vi.fn().mockResolvedValue(undefined);
    const setReminderDay = vi.fn();
    const sched = loadScheduler({ emails: { sendBillReminder } });
    const db = {
      allUsersWithData: vi.fn().mockReturnValue([userWith({
        data: {
          settings: { timezone: 'America/New_York', billReminders: true },
          bills: [{ id: 'b1', name: 'Rent', amount: 1450, dueDay: 20 }],
        },
      })]),
      setReminderDay,
    };

    await sched.runChecks(new Date('2026-06-17T12:00:00.000Z'), { db });

    expect(sendBillReminder).toHaveBeenCalledOnce();
    expect(setReminderDay).toHaveBeenCalledWith(1, '2026-06-17');
  });

  it('does not stamp the summary month when the summary email fails', async () => {
    const sendMonthlySummary = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const setSummaryMonth = vi.fn();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = {
      allUsersWithData: vi.fn().mockReturnValue([userWith({
        data: {
          settings: { timezone: 'America/New_York', monthlySummary: true },
          bills: [], cards: [], payments: [],
        },
      })]),
      setSummaryMonth,
    };
    const sched = loadScheduler();

    await sched.runChecks(new Date('2026-07-01T12:00:00.000Z'), { db, emails: { sendMonthlySummary } });

    expect(sendMonthlySummary).toHaveBeenCalledOnce();
    expect(setSummaryMonth).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
