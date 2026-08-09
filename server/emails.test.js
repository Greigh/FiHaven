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
    process.env.MFA_ENCRYPTION_KEY = 'a'.repeat(64);
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
    expect(msg.html).toContain('Due on the 20th');
    expect(msg.text).toContain('https://fihaven.app/dashboard');
  });

  // A bill with no amount set must not be reported as "$0.00" — that reads as
  // "this costs nothing", the opposite of what the app's own rows say ("No
  // amount set"). An explicit 0 is a real answer and still shows as $0.00.
  it('sendBillReminder says "no amount set" for a blank amount', async () => {
    await emails.sendBillReminder(
      'user@test.com',
      [{ name: 'Water', amount: null, dueDay: 12 }],
      3,
      'USD',
    );

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.text).toContain('• Water — no amount set (due on the 12th)');
    expect(msg.text).not.toContain('Water — $0.00');
    expect(msg.html).toContain('no amount set');
  });

  it('sendBillReminder still shows $0.00 for a deliberate zero', async () => {
    await emails.sendBillReminder(
      'user@test.com',
      [{ name: 'Water', amount: 0, dueDay: 12 }],
      3,
      'USD',
    );

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.text).toContain('• Water — $0.00 (due on the 12th)');
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

  // Links have to be absolute to work from an inbox, so an unset PUBLIC_ORIGIN
  // falls back to production rather than emitting a relative path.
  it('falls back to the production origin when PUBLIC_ORIGIN is unset', async () => {
    delete process.env.PUBLIC_ORIGIN;
    clearModule('./emails');
    emails = require('./emails');
    await emails.sendVerifyEmail('user@test.com', 't');

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.text).toContain('https://fihaven.app/verify-email?token=t');
    expect(msg.html).toContain('src="https://fihaven.app/email-logo.png"');
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

  it('sendWeeklyDigest carries an unsubscribe link, a preferences link, and the one-click header', async () => {
    await emails.sendWeeklyDigest(
      'user@test.com',
      { upcoming: [], upcomingTotal: 0, debtTotal: 0 },
      'USD',
      7,
    );
    const msg = sendMailMock.mock.calls[0][0];
    const unsubscribe = require('./unsubscribe');
    const href = 'https://fihaven.app/unsubscribe?t=' +
      encodeURIComponent(unsubscribe.token(7, 'digest'));

    expect(msg.listUnsubscribe).toBe(href);
    expect(msg.html).toContain(href);
    expect(msg.text).toContain(href);
    expect(msg.html).toContain('https://fihaven.app/settings?tab=notifications#notifications');
    expect(msg.text).toContain('Manage your notification preferences');
  });

  it('scopes the unsubscribe token to the email it is sent with', async () => {
    const unsubscribe = require('./unsubscribe');
    await emails.sendMonthlySummary(
      'user@test.com',
      { month: 'May 2026', paid: 0, billsCount: 0, billsTotal: 0, debtTotal: 0 },
      'USD',
      7,
    );
    expect(sendMailMock.mock.calls[0][0].listUnsubscribe).toContain(
      encodeURIComponent(unsubscribe.token(7, 'summary')),
    );

    sendMailMock.mockClear();
    await emails.sendOfferReminder(
      'user@test.com',
      [{ merchant: 'Delta', detail: '10% back', expires: '2026-07-01' }],
      3,
      'USD',
      7,
    );
    expect(sendMailMock.mock.calls[0][0].listUnsubscribe).toContain(
      encodeURIComponent(unsubscribe.token(7, 'offers')),
    );
  });

  it('falls back to the settings link when no user id is supplied', async () => {
    await emails.sendWeeklyDigest(
      'user@test.com',
      { upcoming: [], upcomingTotal: 0, debtTotal: 0 },
      'USD',
    );
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.listUnsubscribe).toBeUndefined();
    expect(msg.html).not.toContain('/unsubscribe?t=');
    expect(msg.text).toContain('https://fihaven.app/settings?tab=notifications#notifications');
  });

  it('offers no unsubscribe on security email — those are not optional', async () => {
    await emails.sendPasswordReset('user@test.com', 'tok');
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.listUnsubscribe).toBeUndefined();
    expect(msg.html).not.toContain('Unsubscribe');
  });

  it('renders a dark-mode block and an inbox preheader', async () => {
    await emails.sendWeeklyDigest(
      'user@test.com',
      { upcoming: [{ name: 'Rent', amount: 10, daysUntil: 2 }], upcomingTotal: 10, debtTotal: 0 },
      'USD',
      7,
    );
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.html).toContain('prefers-color-scheme: dark');
    expect(msg.html).toContain('<meta name="color-scheme" content="light dark"/>');
    expect(msg.html).toContain('1 bill due');
  });

  it('heads every email with the logo and the wordmark', async () => {
    // Both, deliberately: the mark is a hosted PNG, so an inbox with images
    // off keeps the brand only because the wordmark is live text.
    for (const send of [
      () => emails.sendPasswordReset('user@test.com', 'tok'),
      () => emails.sendVerifyEmail('user@test.com', 'tok'),
      () => emails.sendMonthlySummary('user@test.com', { month: 'May 2026' }, 'USD', 7),
    ]) {
      sendMailMock.mockClear();
      await send();
      const html = sendMailMock.mock.calls[0][0].html;
      expect(html).toContain('src="https://fihaven.app/email-logo.png"');
      expect(html).toContain('alt="FiHaven"');
      expect(html).toContain('>FiHaven</span>');
    }
  });

  it('uses the app palette, not an email-only one', async () => {
    await emails.sendVerifyEmail('user@test.com', 'tok');
    const html = sendMailMock.mock.calls[0][0].html;
    expect(html).toContain('#3D6FE1');   // --accent
    expect(html).toContain('#15161A');   // --text
    expect(html).toContain('#6098F6');   // dark-mode --accent
    expect(html).toContain('Manrope');   // the product typeface
  });

  /* Records arrive from the user's own data, where any field can be blank —
     a bill saved with just a name, an offer synced without a merchant. Every
     one of those has to render as readable copy, not "undefined". */
  it('sendBillReminder falls back to generic copy for an unnamed, undated bill', async () => {
    await emails.sendBillReminder('user@test.com', [{ id: 'b1' }], 3, 'USD');

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.subject).toBe('Reminder: a bill is due in 3 days');
    expect(msg.text).toContain('• Bill — no amount set (due on the 0th)');
    expect(msg.html).toContain('>Bill<');
    expect(msg.html).not.toContain('undefined');
  });

  it('sendBillReminder defaults to USD when no currency is given', async () => {
    await emails.sendBillReminder('user@test.com', [{ name: 'Rent', amount: 1450, dueDay: 20 }], 3);
    expect(sendMailMock.mock.calls[0][0].text).toContain('$1,450.00');
  });

  // The Intl fallback path with a total of exactly zero — `Number(0 || 0)`.
  it('formats a zero total through the plain-dollar fallback', async () => {
    await emails.sendBillReminder(
      'user@test.com',
      [{ name: 'Water', amount: '', dueDay: 12 }],
      3,
      'NOT_A_REAL_CURRENCY',
    );
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.text).toContain('Total: $0.00');
    expect(msg.text).toContain('• Water — no amount set');
  });

  it('sendWeeklyDigest tolerates a digest with no upcoming array and unnamed bills', async () => {
    await emails.sendWeeklyDigest('user@test.com', { upcomingTotal: 0, debtTotal: 0 }, 'USD');
    expect(sendMailMock.mock.calls[0][0].subject)
      .toBe('FiHaven weekly: nothing due in the next 7 days');

    sendMailMock.mockClear();
    await emails.sendWeeklyDigest(
      'user@test.com',
      { upcoming: [{ amount: 40, daysUntil: 1 }], upcomingTotal: 40, debtTotal: 0 },
      'USD',
    );
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.text).toContain('• Bill — $40.00 (due tomorrow)');
    expect(msg.html).toContain('due tomorrow');
    expect(msg.html).not.toContain('undefined');
  });

  it('sendTrialReminder pluralizes and fills in blanks across several trials', async () => {
    await emails.sendTrialReminder(
      'user@test.com',
      [
        { id: 't1' },                                  // no name, no end date, no amount
        { id: 't2', name: 'Hulu', trialEnds: '2026-06-25', amount: 7.99 },
      ],
      1,
      'USD',
    );

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.subject).toBe('2 subscription trials ending tomorrow');
    expect(msg.text).toContain('You have 2 free trials ending tomorrow');
    expect(msg.text).toContain('• Subscription — trial ends');
    expect(msg.html).toContain('Review them before the first charge.');
    expect(msg.html).toContain('>Subscription<');
    expect(msg.html).not.toContain('undefined');
  });

  it('sendTrialReminder names a single unnamed trial generically', async () => {
    await emails.sendTrialReminder('user@test.com', [{ id: 't1' }], 3, 'USD');
    expect(sendMailMock.mock.calls[0][0].subject).toBe('Trial ending soon: a subscription');
  });

  it('sendOfferReminder builds copy for a complete offer', async () => {
    await emails.sendOfferReminder(
      'user@test.com',
      [{ merchant: 'Delta', detail: '10% back', expires: '2026-07-01', cardName: 'Amex Gold' }],
      3,
      'USD',
    );

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.subject).toBe('Offer expiring in 3 days: Delta');
    expect(msg.text).toContain('• Delta — 10% back on Amex Gold (expires 2026-07-01)');
    expect(msg.html).toContain('10% back');
    expect(msg.html).toContain(' · ');           // detail and card name are joined
    expect(msg.html).toContain('expires Jul 1');
  });

  it('sendOfferReminder pluralizes and fills in blanks across several offers', async () => {
    await emails.sendOfferReminder(
      'user@test.com',
      [
        { id: 'o1' },                                     // nothing at all
        { id: 'o2', cardName: 'Amex Gold' },              // card only, no detail
      ],
      3,
      'USD',
    );

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.subject).toBe('2 card offers expiring in 3 days');
    expect(msg.text).toContain('• Offer (expires )');
    expect(msg.text).toContain('• Offer on Amex Gold (expires )');
    expect(msg.html).toContain('>Offer<');
    // No detail, so no separator dot is invented before the card name.
    expect(msg.html).not.toContain(' · Amex Gold');
    expect(msg.html).toContain('Amex Gold');
    expect(msg.html).not.toContain('undefined');
  });

  it('sendOfferReminder names a single unnamed offer generically', async () => {
    await emails.sendOfferReminder('user@test.com', [{ id: 'o1' }], 3, 'USD');
    expect(sendMailMock.mock.calls[0][0].subject).toBe('Offer expiring in 3 days: a card offer');
  });
});

/* An invite is the one email addressed to someone who may not have an account
   yet, and both names on it are optional — the household may be unnamed, and
   the inviter's display name may never have been set. */
describe('emails.js — household invite', () => {
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

  it('names the inviter and the household when both are known', async () => {
    await emails.sendHouseholdInvite('invitee@test.com', {
      rawToken: 'inv+token/1',
      householdName: 'The Hipskinds',
      inviterName: 'Dana',
    });

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.to).toBe('invitee@test.com');
    expect(msg.subject).toBe("You're invited to join The Hipskinds on FiHaven");
    expect(msg.text).toContain('Dana invited you to join The Hipskinds on FiHaven.');
    expect(msg.text).toContain(
      'https://fihaven.app/login?household=' + encodeURIComponent('inv+token/1'),
    );
    expect(msg.html).toContain('<strong>Dana</strong>');
    expect(msg.html).toContain('<strong>The Hipskinds</strong>');
    expect(msg.html).toContain('Join the household');
  });

  it('falls back to neutral wording when neither name is set', async () => {
    await emails.sendHouseholdInvite('invitee@test.com', { rawToken: 'tok' });

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.subject).toBe("You're invited to join a household on FiHaven");
    expect(msg.text).toContain('Someone invited you to join their household on FiHaven.');
    expect(msg.html).toContain('<strong>Someone</strong>');
    expect(msg.html).toContain('<strong>their household</strong>');
    expect(msg.html).not.toContain('undefined');
  });

  it('escapes both names in the HTML body', async () => {
    await emails.sendHouseholdInvite('invitee@test.com', {
      rawToken: 'tok',
      householdName: '<img src=x onerror=alert(1)>',
      inviterName: '<script>alert(1)</script>',
    });

    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.html).not.toContain('<script>');
    expect(msg.html).not.toContain('<img src=x');
    expect(msg.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('offers no unsubscribe — an invite is not a notification', async () => {
    await emails.sendHouseholdInvite('invitee@test.com', { rawToken: 'tok' });
    const msg = sendMailMock.mock.calls[0][0];
    expect(msg.listUnsubscribe).toBeUndefined();
    expect(msg.html).not.toContain('Unsubscribe');
  });
});
