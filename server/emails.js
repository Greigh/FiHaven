/* ═══════════════════════════════════════════════════════════
   emails.js — transactional email templates (verify, reset,
   2FA recovery). Each builds a branded HTML + plaintext body and
   hands off to mail.sendMail. Links are absolute, built from
   PUBLIC_ORIGIN so they work from any inbox.
═════════════════════════════════════════════════════════════════ */

'use strict';

const mail = require('./mail');

const ACCENT = '#3D6FE1';

function origin() {
  return (process.env.PUBLIC_ORIGIN || 'https://fihaven.app').replace(/\/+$/, '');
}

function link(pathWithQuery) {
  return origin() + pathWithQuery;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function ordinal(n) {
  n = parseInt(n, 10) || 0;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Format money in the user's currency. Locale stays en-US for emails —
// the currency code drives the symbol; we just want a stable rendering.
function money(n, currency) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(Number(n || 0));
  } catch (e) {
    return '$' + Number(n || 0).toFixed(2);
  }
}

// Shared, inline-styled shell so it renders in every mail client.
// `cta` is { href, label }; `lines` is an array of paragraph strings.
function layout({ heading, lines, cta, footnote }) {
  const paras = lines
    .map(
      (t) =>
        `<p style="margin:0 0 14px;color:#1f2430;font-size:15px;line-height:1.6;">${t}</p>`
    )
    .join('');
  const button = cta
    ? `<p style="margin:22px 0;">
         <a href="${cta.href}" style="display:inline-block;background:${ACCENT};color:#fff;
            text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;font-size:15px;">
           ${cta.label}
         </a>
       </p>
       <p style="margin:0 0 14px;color:#6b7280;font-size:13px;line-height:1.6;word-break:break-all;">
         Or paste this link into your browser:<br/><a href="${cta.href}" style="color:${ACCENT};">${cta.href}</a>
       </p>`
    : '';
  const foot = footnote
    ? `<p style="margin:18px 0 0;color:#9aa1ad;font-size:12px;line-height:1.6;">${footnote}</p>`
    : '';
  return `<!doctype html>
<html><body style="margin:0;background:#f4f6fb;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;border:1px solid #e6e9f0;overflow:hidden;">
      <tr><td style="padding:22px 28px;border-bottom:1px solid #eef1f6;">
        <span style="font-size:18px;font-weight:700;color:${ACCENT};letter-spacing:-.02em;">FiHaven</span>
      </td></tr>
      <tr><td style="padding:26px 28px;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#111827;letter-spacing:-.02em;">${heading}</h1>
        ${paras}${button}${foot}
      </td></tr>
    </table>
    <p style="max-width:520px;margin:16px auto 0;color:#9aa1ad;font-size:12px;text-align:center;">
      FiHaven · You're receiving this because someone used this address at fihaven.app.
    </p>
  </td></tr></table>
</body></html>`;
}

/* ── Password reset ──────────────────────────────────────────── */
async function sendPasswordReset(to, rawToken) {
  const href = link('/reset?token=' + encodeURIComponent(rawToken));
  return mail.sendMail({
    to,
    subject: 'Reset your FiHaven password',
    text:
      `Reset your FiHaven password\n\n` +
      `Open this link to choose a new password (valid for 30 minutes):\n${href}\n\n` +
      `If you didn't request this, you can safely ignore this email — your password won't change.`,
    html: layout({
      heading: 'Reset your password',
      lines: [
        'We got a request to reset the password for your FiHaven account.',
        'This link is valid for 30 minutes and can be used once.',
      ],
      cta: { href, label: 'Choose a new password' },
      footnote:
        "If you didn't request this, ignore this email — nothing changes until you open the link and set a new password.",
    }),
  });
}

/* ── Email verification ──────────────────────────────────────── */
async function sendVerifyEmail(to, rawToken) {
  const href = link('/verify-email?token=' + encodeURIComponent(rawToken));
  return mail.sendMail({
    to,
    subject: 'Confirm your FiHaven email',
    text:
      `Confirm your email to finish setting up FiHaven.\n\n` +
      `Open this link (valid for 24 hours):\n${href}\n\n` +
      `If you didn't create a FiHaven account, you can ignore this email.`,
    html: layout({
      heading: 'Confirm your email',
      lines: [
        'Welcome to FiHaven! Confirm this is your email to finish setting up your account.',
        'This link is valid for 24 hours.',
      ],
      cta: { href, label: 'Confirm email' },
      footnote: "If you didn't create a FiHaven account, you can ignore this email.",
    }),
  });
}

/* ── 2FA recovery ────────────────────────────────────────────── */
// Destructive: confirming disables 2FA and erases bills/cards/payments
// (settings are kept). The copy makes the consequence explicit.
async function sendRecovery(to, rawToken) {
  const href = link('/recover?token=' + encodeURIComponent(rawToken));
  return mail.sendMail({
    to,
    subject: 'Recover access to your FiHaven account',
    text:
      `Recover access to FiHaven\n\n` +
      `You asked to recover an account locked by two-factor authentication.\n\n` +
      `WARNING: Confirming will turn off two-factor authentication AND permanently delete your bills, cards, and payment history. Your settings are kept. This cannot be undone.\n\n` +
      `Open this link to continue (valid for 30 minutes):\n${href}\n\n` +
      `If you didn't request this, ignore this email — nothing changes.`,
    html: layout({
      heading: 'Recover account access',
      lines: [
        'You asked to recover a FiHaven account that’s locked by two-factor authentication.',
        '<strong style="color:#b42318;">Confirming will turn off two-factor authentication and permanently delete your bills, cards, and payment history.</strong> Your settings are kept. This can’t be undone.',
        'The link is valid for 30 minutes and can be used once.',
      ],
      cta: { href, label: 'Continue recovery' },
      footnote: "If you didn't request this, ignore this email — nothing changes.",
    }),
  });
}

/* ── Bill reminders ──────────────────────────────────────────── */
async function sendBillReminder(to, bills, leadDays, currency) {
  const n = bills.length;
  const plural = n === 1 ? '' : 's';
  const href = link('/dashboard');
  const items = bills
    .map((b) => `<li style="margin:0 0 6px;">${esc(b.name) || 'Bill'} — <strong>${money(b.amount, currency)}</strong> (due on the ${ordinal(b.dueDay)})</li>`)
    .join('');
  const textItems = bills
    .map((b) => `• ${b.name || 'Bill'} — ${money(b.amount, currency)} (due on the ${ordinal(b.dueDay)})`)
    .join('\n');
  return mail.sendMail({
    to,
    subject: n === 1
      ? `Reminder: ${bills[0].name || 'a bill'} is due in ${leadDays} days`
      : `Reminder: ${n} bills due in ${leadDays} days`,
    text:
      `You have ${n} bill${plural} due in ${leadDays} days:\n\n${textItems}\n\n` +
      `Open FiHaven: ${href}\n\n` +
      `You're getting this because bill reminders are on — turn them off any time in Settings.`,
    html: layout({
      heading: `${n} bill${plural} due in ${leadDays} days`,
      lines: [
        'A quick heads-up on what’s coming due:',
        `<ul style="margin:0 0 4px;padding-left:18px;color:#1f2430;font-size:15px;line-height:1.7;">${items}</ul>`,
      ],
      cta: { href, label: 'Open FiHaven' },
      footnote: 'You’re getting this because bill reminders are on — turn them off any time in Settings.',
    }),
  });
}

/* ── Monthly summary ─────────────────────────────────────────── */
async function sendMonthlySummary(to, summary, currency) {
  const href = link('/dashboard');
  const row = (label, val) =>
    `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">${label}</td>` +
    `<td style="padding:6px 0;text-align:right;font-weight:600;color:#111827;">${val}</td></tr>`;
  const table =
    `<table style="width:100%;border-collapse:collapse;margin:2px 0 10px;">` +
    row('Paid last month', money(summary.paid, currency)) +
    row('Recurring bills', `${summary.billsCount} · ${money(summary.billsTotal, currency)}/mo`) +
    row('Total card debt', money(summary.debtTotal, currency)) +
    `</table>`;
  return mail.sendMail({
    to,
    subject: `Your FiHaven summary — ${summary.month}`,
    text:
      `Your FiHaven monthly summary (${summary.month}):\n` +
      `• Paid last month: ${money(summary.paid, currency)}\n` +
      `• Recurring bills: ${summary.billsCount} (${money(summary.billsTotal, currency)}/mo)\n` +
      `• Total card debt: ${money(summary.debtTotal, currency)}\n\n` +
      `Open FiHaven: ${href}\n\n` +
      `You're getting this because the monthly summary is on — turn it off any time in Settings.`,
    html: layout({
      heading: `Your ${summary.month} summary`,
      lines: ['Here’s where things stand:', table],
      cta: { href, label: 'Open FiHaven' },
      footnote: 'You’re getting this because the monthly summary is on — turn it off any time in Settings.',
    }),
  });
}

module.exports = {
  sendPasswordReset,
  sendVerifyEmail,
  sendRecovery,
  sendBillReminder,
  sendMonthlySummary,
};
