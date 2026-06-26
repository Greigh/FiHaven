import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('emails.js', () => {
  const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-id' });
  let emails;

  beforeEach(() => {
    sendMailMock.mockClear();
    clearModule('./emails');
    clearModule('./mail');
    stubModule('./mail', { sendMail: sendMailMock });
    process.env.PUBLIC_ORIGIN = 'https://fihaven.app';
    emails = require('./emails');
  });

  it('sendPasswordReset builds reset link, subject, and branded HTML', async () => {
    const token = 'abc+def/token';
    await emails.sendPasswordReset('user@test.com', token);

    expect(sendMailMock).toHaveBeenCalledOnce();
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.to).toBe('user@test.com');
    expect(msg.subject).toBe('Reset your FiHaven password');
    expect(msg.text).toContain('https://fihaven.app/reset?token=' + encodeURIComponent(token));
    expect(msg.html).toContain('FiHaven');
    expect(msg.html).toContain('Choose a new password');
    expect(msg.html).toContain('30 minutes');
  });

  it('sendVerifyEmail builds verification link and welcome copy', async () => {
    await emails.sendVerifyEmail('new@test.com', 'verify-token');

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.subject).toBe('Confirm your FiHaven email');
    expect(msg.text).toContain('https://fihaven.app/verify-email?token=verify-token');
    expect(msg.html).toContain('Confirm email');
    expect(msg.html).toContain('24 hours');
  });

  it('sendRecovery includes destructive warning in text and HTML', async () => {
    await emails.sendRecovery('locked@test.com', 'recover-token');

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.subject).toBe('Recover access to your FiHaven account');
    expect(msg.text).toContain('WARNING');
    expect(msg.text).toContain('permanently delete your bills, cards, and payment history');
    expect(msg.html).toContain('permanently delete your bills, cards, and payment history');
    expect(msg.text).toContain('https://fihaven.app/recover?token=recover-token');
  });

  it('sendBillReminder uses singular subject for one bill', async () => {
    await emails.sendBillReminder(
      'user@test.com',
      [{ name: 'Rent', amount: 1450, dueDay: 20 }],
      3,
      'USD',
    );

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.subject).toBe('Reminder: Rent is due in 3 days');
    expect(msg.text).toContain('• Rent — $1,450.00 (due on the 20th)');
    expect(msg.html).toContain('$1,450.00');
    expect(msg.html).toContain('due on the 20th');
    expect(msg.text).toContain('https://fihaven.app/dashboard');
  });

  it('sendBillReminder uses plural subject for multiple bills', async () => {
    await emails.sendBillReminder(
      'user@test.com',
      [
        { name: 'Rent', amount: 1450, dueDay: 20 },
        { name: 'Internet', amount: 80, dueDay: 22 },
      ],
      3,
      'USD',
    );

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.subject).toBe('Reminder: 2 bills due in 3 days');
    expect(msg.text).toContain('You have 2 bills due in 3 days');
  });

  it('sendBillReminder escapes HTML in bill names', async () => {
    await emails.sendBillReminder(
      'user@test.com',
      [{ name: '<script>alert(1)</script>', amount: 10, dueDay: 5 }],
      3,
      'USD',
    );

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.html).not.toContain('<script>');
    expect(msg.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(msg.text).toContain('<script>alert(1)</script>');
  });

  it('sendBillReminder says "due today" for a 0-day lead', async () => {
    await emails.sendBillReminder(
      'user@test.com',
      [{ name: 'Power', amount: 90, dueDay: 17 }],
      0,
      'USD',
    );
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.subject).toBe('Reminder: Power is due today');
    expect(msg.html).toContain('1 bill due today');
  });

  it('sendBillReminder says "due tomorrow" for a 1-day lead', async () => {
    await emails.sendBillReminder(
      'user@test.com',
      [{ name: 'Rent', amount: 1450, dueDay: 18 }],
      1,
      'USD',
    );
    expect(sendMailMock.mock.calls[0][0].subject).toBe('Reminder: Rent is due tomorrow');
  });

  it('sendWeeklyDigest lists upcoming bills with relative due timing', async () => {
    await emails.sendWeeklyDigest(
      'user@test.com',
      {
        upcoming: [
          { name: 'Power', amount: 90, daysUntil: 0 },
          { name: 'Rent', amount: 1450, daysUntil: 3 },
        ],
        upcomingTotal: 1540,
        debtTotal: 300,
      },
      'USD',
    );
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.subject).toBe('FiHaven weekly: 2 bills due soon');
    expect(msg.text).toContain('• Power — $90.00 (due today)');
    expect(msg.text).toContain('• Rent — $1,450.00 (due in 3 days)');
    expect(msg.html).toContain('$1,540.00'); // upcoming total
    expect(msg.html).toContain('$300.00');   // card debt
  });

  it('sendWeeklyDigest handles an empty week', async () => {
    await emails.sendWeeklyDigest(
      'user@test.com',
      { upcoming: [], upcomingTotal: 0, debtTotal: 0 },
      'USD',
    );
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.subject).toBe('FiHaven weekly: nothing due in the next 7 days');
    expect(msg.text).toContain('No bills are due in the next 7 days');
  });

  it('sendMonthlySummary includes paid, bills, and debt totals', async () => {
    await emails.sendMonthlySummary(
      'user@test.com',
      {
        month: 'May 2026',
        paid: 2100,
        billsCount: 3,
        billsTotal: 1800,
        debtTotal: 4500,
      },
      'USD',
    );

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.subject).toBe('Your FiHaven summary — May 2026');
    expect(msg.text).toContain('Paid last month: $2,100.00');
    expect(msg.text).toContain('Recurring bills: 3 ($1,800.00/mo)');
    expect(msg.text).toContain('Total card debt: $4,500.00');
    expect(msg.html).toContain('Your May 2026 summary');
    expect(msg.html).toContain('$2,100.00');
  });

  it('uses PUBLIC_ORIGIN without a trailing slash', async () => {
    process.env.PUBLIC_ORIGIN = 'https://staging.fihaven.app/';
    clearModule('./emails');
    emails = require('./emails');
    await emails.sendVerifyEmail('user@test.com', 't');

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.text).toContain('https://staging.fihaven.app/verify-email?token=t');
    expect(msg.text).not.toContain('https://staging.fihaven.app//');
  });

  it('falls back to a plain dollar format for invalid currency codes', async () => {
    await emails.sendBillReminder(
      'user@test.com',
      [{ name: 'Rent', amount: 12.5, dueDay: 1 }],
      3,
      'NOT_A_REAL_CURRENCY',
    );

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.text).toContain('$12.50');
    expect(msg.html).toContain('$12.50');
  });

  it('sendTrialReminder builds trial-ending copy', async () => {
    await emails.sendTrialReminder(
      'user@test.com',
      [{ name: 'Hulu', amount: 7.99, trialEnds: '2026-06-25' }],
      3,
      'USD',
    );
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.subject).toContain('Hulu');
    expect(msg.text).toContain('trial ends');
    expect(msg.html).toContain('Review subscriptions');
  });
});
