/* ═══════════════════════════════════════════════════════════
   emails.js — every email FiHaven sends: the security/transactional
   ones (verify, reset, 2FA recovery, household invite) and the
   recurring notifications (bill + trial + offer reminders, weekly
   digest, monthly summary). Each builds a branded HTML + plaintext
   body and hands off to mail.sendMail. Links are absolute, built from
   PUBLIC_ORIGIN so they work from any inbox.

   The notification emails additionally carry a preferences link, a
   signed unsubscribe link, and the one-click List-Unsubscribe header
   (see ./unsubscribe.js). The security ones deliberately do not —
   there is no opting out of a password-reset email.
═════════════════════════════════════════════════════════════════ */

'use strict';

const mail = require('./mail');
const unsubscribe = require('./unsubscribe');

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

/* ── Design tokens ───────────────────────────────────────────
   These are the app's own tokens from client/css/tokens.css, not a
   second palette invented for email — an email that lands next to the
   product should look like the product. Keep the two in step.

   Inline styles carry the light palette (they survive every client);
   the <style> block re-colors the same elements by class for dark
   mode. Clients that strip <style> — or that force their own dark
   inversion — still land on a legible light card, which is why the
   inline values stay the source of truth.                          */
const TEXT = '#15161A';        // --text
const BODY = '#33353D';        // --text, lightened for long-form copy
const MUTED = '#6C6E77';       // --muted
const FAINT = '#8A8C95';       // --muted, one step back for the footer
const BORDER = '#E5E7EB';      // --border
const PANEL = '#F2F3F6';       // --surface2
const ACCENT_BG = '#EAF0FE';   // --accent-bg
const CARD = '#FFFFFF';        // --surface
const SKY = '#F2F3F6';         // page behind the card

/* Manrope is the product typeface. Apple Mail / iOS Mail honour the
   @import; everyone else lands on the system stack, which is what the
   inline font-family says — so the fallback is never a surprise. */
const FONT =
  "'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
// Amounts are mono in the app (.mono); they line up in a column here too.
const MONO = "'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

const DARK_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap');
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  a { text-decoration: none; }
  @media (max-width:600px) {
    .gutter { padding-left:22px !important; padding-right:22px !important; }
    .h1 { font-size:21px !important; }
  }
  /* The CTA keeps the light accent in dark mode on purpose: the dark-theme
     accent (#6098F6) under white label text is only ~3:1, and the label is
     15px — below the large-text bar. #3D6FE1 holds 5:1 and is still ours. */
  @media (prefers-color-scheme: dark) {
    .sky    { background:#0C0D0F !important; }
    .card   { background:#17181B !important; border-color:#292B31 !important; }
    .rule   { border-color:#292B31 !important; }
    .tx     { color:#ECEDF0 !important; }
    .body   { color:#C6C8CF !important; }
    .mut    { color:#868892 !important; }
    .faint  { color:#75777F !important; }
    .panel  { background:#1F2126 !important; border-color:#292B31 !important; }
    .brand, .lnk { color:#6098F6 !important; }
    .chip   { background:#122544 !important; color:#6098F6 !important; }
    .bar    { background:#6098F6 !important; }
  }`;

/* Brand lockup: the FiHaven mark plus the wordmark, side by side.

   The mark is a hosted PNG rather than the inline SVG the site uses —
   no mail client renders SVG reliably. The wordmark stays live text, so
   an inbox with images off (still the default in plenty of clients)
   loses the tile and keeps the brand. */
function brandBlock() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr>
      <td width="34" style="width:34px;padding-right:10px;vertical-align:middle;">
        <img src="${origin()}/email-logo.png" width="34" height="34" alt="FiHaven"
             style="display:block;width:34px;height:34px;border:0;border-radius:8px;"/>
      </td>
      <td style="vertical-align:middle;">
        <span class="brand" style="font-family:${FONT};font-size:18px;font-weight:800;color:${ACCENT};letter-spacing:-.04em;">FiHaven</span>
      </td>
    </tr>
  </table>`;
}

// Hidden inbox-preview line. The zero-width padding keeps the client
// from pulling body copy in after it.
function preheaderBlock(text) {
  if (!text) return '';
  return `<div style="display:none;font-size:1px;color:${SKY};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${esc(text)}${'&#8199;&#65279;&#847; '.repeat(30)}
  </div>`;
}

// Bulletproof-ish CTA: the background lives on a <td>, not the <a>, so
// Outlook (which ignores padding on inline elements) still renders a button.
function ctaBlock(cta) {
  if (!cta) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 16px;">
    <tr><td class="btn" align="center" bgcolor="${ACCENT}" style="border-radius:10px;background:${ACCENT};">
      <a href="${cta.href}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:-.01em;color:#ffffff;text-decoration:none;border-radius:10px;">${cta.label}</a>
    </td></tr>
  </table>
  <p class="mut" style="margin:0;color:${MUTED};font-size:12px;line-height:1.6;word-break:break-all;">
    Or paste this link into your browser:<br/><a class="lnk" href="${cta.href}" style="color:${ACCENT};">${cta.href}</a>
  </p>`;
}

/* A list of records — bill, trial, offer. Each item is
   { label, meta, value }: name on the left, optional secondary line
   under it, amount (or date) right-aligned. Reads far better than a
   <ul> once the amounts stop lining up. */
function itemList(items) {
  const rows = items
    .map(
      (it, i) => `<tr>
      <td class="rule" style="padding:12px 14px 12px 0;${i ? `border-top:1px solid ${BORDER};` : ''}">
        <span class="tx" style="color:${TEXT};font-size:15px;font-weight:600;line-height:1.4;">${it.label}</span>
        ${it.meta ? `<br/><span class="mut" style="color:${MUTED};font-size:13px;line-height:1.5;">${it.meta}</span>` : ''}
      </td>
      <td class="rule" align="right" valign="top" style="padding:12px 0;white-space:nowrap;${i ? `border-top:1px solid ${BORDER};` : ''}">
        ${it.value ? `<span class="tx" style="font-family:${MONO};color:${TEXT};font-size:14px;font-weight:600;">${it.value}</span>` : ''}
      </td>
    </tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:4px 0 2px;">${rows}</table>`;
}

// Small pill for relative timing ("due in 3 days").
function chip(text) {
  return `<span class="chip" style="display:inline-block;background:${ACCENT_BG};color:${ACCENT};font-size:11px;font-weight:600;letter-spacing:.02em;padding:3px 10px;border-radius:999px;">${text}</span>`;
}

/* Totals / at-a-glance figures in a tinted panel: label left, value
   right, one row each. */
function statPanel(stats) {
  const rows = stats
    .map(
      (s, i) => `<tr>
      <td class="mut" style="padding:${i ? '8px' : '0'} 0 0;color:${MUTED};font-size:14px;">${s.label}</td>
      <td class="tx" align="right" style="padding:${i ? '8px' : '0'} 0 0;font-family:${MONO};color:${TEXT};font-size:14px;font-weight:600;white-space:nowrap;">${s.value}</td>
    </tr>`
    )
    .join('');
  return `<table role="presentation" class="panel" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;background:${PANEL};border:1px solid ${BORDER};border-radius:10px;margin:18px 0 4px;">
    <tr><td style="padding:16px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;">${rows}</table>
    </td></tr>
  </table>`;
}

/* Shared, inline-styled shell so it renders in every mail client.
   `cta` is { href, label }; `lines` is an array of paragraph strings
   (a string that already starts with `<table` is dropped in as-is).
   `prefs` is { manageHref, unsubHref } — present on the notification
   emails, absent on the security/transactional ones, which have no
   opt-out to offer. */
function layout({ heading, lines, cta, footnote, preheader, prefs }) {
  const paras = lines
    .filter(Boolean)
    .map((t) =>
      String(t).trim().startsWith('<table')
        ? t
        : `<p class="body" style="margin:0 0 14px;color:${BODY};font-size:15px;line-height:1.65;">${t}</p>`
    )
    .join('');
  const foot = footnote
    ? `<p class="faint" style="margin:20px 0 0;color:${FAINT};font-size:12px;line-height:1.6;">${footnote}</p>`
    : '';
  const prefLinks = prefs
    ? `<span style="white-space:nowrap;"><a class="lnk" href="${prefs.manageHref}" style="color:${ACCENT};font-weight:600;">Manage notification preferences</a></span>
       <span class="faint" style="color:${FAINT};"> · </span>
       <span style="white-space:nowrap;"><a class="lnk" href="${prefs.unsubHref}" style="color:${ACCENT};font-weight:600;">Unsubscribe</a></span><br/>`
    : '';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light dark"/>
<meta name="supported-color-schemes" content="light dark"/>
<title>${esc(heading)}</title>
<style>${DARK_CSS}</style>
</head>
<body class="sky" style="margin:0;padding:0;background:${SKY};font-family:${FONT};-webkit-font-smoothing:antialiased;">
  ${preheaderBlock(preheader)}
  <table role="presentation" class="sky" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:${SKY};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:${CARD};border-radius:20px;border:1px solid ${BORDER};overflow:hidden;">
        <tr><td class="bar" bgcolor="${ACCENT}" height="4" style="height:4px;line-height:4px;font-size:0;background:${ACCENT};border-radius:19px 19px 0 0;">&nbsp;</td></tr>
        <tr><td class="gutter rule" style="padding:20px 30px;border-bottom:1px solid ${BORDER};">
          ${brandBlock()}
        </td></tr>
        <tr><td class="gutter" style="padding:28px 30px 30px;">
          <h1 class="h1 tx" style="margin:0 0 14px;font-size:24px;font-weight:800;color:${TEXT};letter-spacing:-.04em;line-height:1.2;">${heading}</h1>
          ${paras}${ctaBlock(cta)}${foot}
        </td></tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
        <tr><td class="gutter" align="center" style="padding:18px 30px 4px;">
          <p class="faint" style="margin:0;color:${FAINT};font-size:12px;line-height:1.9;text-align:center;">
            ${prefLinks}FiHaven · Greigh Studios LLC<br/>
            <a class="lnk" href="${origin()}/privacy" style="color:${FAINT};text-decoration:underline;">Privacy</a>
            <span> · </span>
            <a class="lnk" href="${origin()}/terms" style="color:${FAINT};text-decoration:underline;">Terms</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* ── Notification-email plumbing ─────────────────────────────
   Every recurring email gets a visible unsubscribe + preferences
   link and the RFC 8058 one-click header. `userId` is optional so a
   caller (or an old test) that omits it still sends — it just falls
   back to the sign-in-required settings link. */
function prefsFor(userId, kind) {
  // Both forms on purpose: the #hash opens the tab for a signed-in
  // reader, and ?tab= is what survives the sign-in redirect for one
  // who isn't (a fragment never reaches the server).
  const manageHref = link('/settings?tab=notifications#notifications');
  if (userId == null) return { prefs: { manageHref, unsubHref: manageHref } };
  const t = unsubscribe.token(userId, kind);
  const unsubHref = link('/unsubscribe?t=' + encodeURIComponent(t));
  return { prefs: { manageHref, unsubHref }, listUnsubscribe: unsubHref };
}

// The plaintext tail every notification email shares.
function prefsText(prefs, why) {
  return (
    `${why}\n\n` +
    `Manage your notification preferences: ${prefs.manageHref}\n` +
    `Unsubscribe from these emails: ${prefs.unsubHref}`
  );
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
      preheader: 'Choose a new password — the link expires in 30 minutes.',
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
      preheader: 'One tap to finish setting up your FiHaven account.',
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
      preheader: 'Read this carefully — recovery erases your bills, cards, and payments.',
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

// True when a bill's amount was actually filled in. A blank one ('' / null /
// undefined) is unfinished setup, not a $0 bill, and formatting it as "$0.00"
// tells the reader the opposite of what the app's own rows now say ("No amount
// set"). Mirrors amountIsSet in client/js/utils.js.
function hasAmount(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return !isNaN(parseFloat(v));
}

// "due today" / "due tomorrow" / "due in N days" for a lead-day count.
function leadPhrase(days) {
  const d = parseInt(days, 10) || 0;
  if (d <= 0) return 'due today';
  if (d === 1) return 'due tomorrow';
  return `due in ${d} days`;
}

/* ── Bill reminders ──────────────────────────────────────────── */
async function sendBillReminder(to, bills, leadDays, currency, userId) {
  const n = bills.length;
  const plural = n === 1 ? '' : 's';
  const phrase = leadPhrase(leadDays);
  const href = link('/dashboard');
  const { prefs, listUnsubscribe } = prefsFor(userId, 'reminders');
  const total = bills.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  // A bill with no amount set says so, rather than reporting "$0.00" — which
  // would read as "this costs nothing" and contradict the app. It contributes
  // nothing to the total either way.
  const amountLabel = (b) => (hasAmount(b.amount) ? money(b.amount, currency) : 'no amount set');
  const items = itemList(
    bills.map((b) => ({
      label: esc(b.name) || 'Bill',
      meta: `Due on the ${ordinal(b.dueDay)}`,
      value: amountLabel(b),
    }))
  );
  const textItems = bills
    .map((b) => `• ${b.name || 'Bill'} — ${amountLabel(b)} (due on the ${ordinal(b.dueDay)})`)
    .join('\n');
  const why = "You're getting this because bill reminders are on.";
  return mail.sendMail({
    to,
    listUnsubscribe,
    subject: n === 1
      ? `Reminder: ${bills[0].name || 'a bill'} is ${phrase}`
      : `Reminder: ${n} bills ${phrase}`,
    text:
      `You have ${n} bill${plural} ${phrase}:\n\n${textItems}\n\n` +
      `Total: ${money(total, currency)}\n\n` +
      `Open FiHaven: ${href}\n\n` +
      prefsText(prefs, why),
    html: layout({
      preheader: `${n} bill${plural} ${phrase} — ${money(total, currency)} total.`,
      heading: `${n} bill${plural} ${phrase}`,
      lines: [
        'A quick heads-up on what’s coming due:',
        items,
        n > 1 ? statPanel([{ label: 'Total due', value: money(total, currency) }]) : '',
      ],
      cta: { href, label: 'Open FiHaven' },
      footnote: `${why} You can change the timing or turn them off any time.`,
      prefs,
    }),
  });
}

/* ── Weekly digest ───────────────────────────────────────────── */
// `digest` is { upcoming: [{name, amount, dueDay, daysUntil}], upcomingTotal,
// debtTotal } — the bills coming due in the next 7 days plus balances.
async function sendWeeklyDigest(to, digest, currency, userId) {
  const href = link('/dashboard');
  const { prefs, listUnsubscribe } = prefsFor(userId, 'digest');
  const upcoming = Array.isArray(digest.upcoming) ? digest.upcoming : [];
  const n = upcoming.length;
  const phrase = (d) => (d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);
  const items = itemList(
    upcoming.map((b) => ({
      label: esc(b.name) || 'Bill',
      meta: chip(`due ${phrase(b.daysUntil)}`),
      value: money(b.amount, currency),
    }))
  );
  const textItems = upcoming
    .map((b) => `• ${b.name || 'Bill'} — ${money(b.amount, currency)} (due ${phrase(b.daysUntil)})`)
    .join('\n');
  const totals = statPanel([
    { label: 'Upcoming this week', value: money(digest.upcomingTotal, currency) },
    { label: 'Card debt', value: money(digest.debtTotal, currency) },
  ]);
  const textTotals =
    `Upcoming this week: ${money(digest.upcomingTotal, currency)}\n` +
    `Card debt: ${money(digest.debtTotal, currency)}`;
  const why = "You're getting this because the weekly digest is on.";
  return mail.sendMail({
    to,
    listUnsubscribe,
    subject: n === 0
      ? 'FiHaven weekly: nothing due in the next 7 days'
      : `FiHaven weekly: ${n} bill${n === 1 ? '' : 's'} due soon`,
    text:
      (n === 0
        ? 'No bills are due in the next 7 days. 🎉\n\n'
        : `Bills due in the next 7 days:\n\n${textItems}\n\n`) +
      `${textTotals}\n\n` +
      `Open FiHaven: ${href}\n\n` +
      prefsText(prefs, why),
    html: layout({
      preheader:
        n === 0
          ? 'Nothing due in the next 7 days.'
          : `${n} bill${n === 1 ? '' : 's'} due · ${money(digest.upcomingTotal, currency)} this week.`,
      heading: 'Your week ahead',
      lines: [
        n === 0
          ? 'No bills are due in the next 7 days. 🎉'
          : 'Here are the bills coming due in the next 7 days:',
        n === 0 ? '' : items,
        totals,
      ],
      cta: { href, label: 'Open FiHaven' },
      footnote: `${why} Turn it off any time.`,
      prefs,
    }),
  });
}

/* ── Monthly summary ─────────────────────────────────────────── */
async function sendMonthlySummary(to, summary, currency, userId) {
  const href = link('/dashboard');
  const { prefs, listUnsubscribe } = prefsFor(userId, 'summary');
  const table = statPanel([
    { label: 'Paid last month', value: money(summary.paid, currency) },
    {
      label: 'Recurring bills',
      value: `${summary.billsCount} · ${money(summary.billsTotal, currency)}/mo`,
    },
    { label: 'Total card debt', value: money(summary.debtTotal, currency) },
  ]);
  const why = "You're getting this because the monthly summary is on.";
  return mail.sendMail({
    to,
    listUnsubscribe,
    subject: `Your FiHaven summary — ${summary.month}`,
    text:
      `Your FiHaven monthly summary (${summary.month}):\n` +
      `• Paid last month: ${money(summary.paid, currency)}\n` +
      `• Recurring bills: ${summary.billsCount} (${money(summary.billsTotal, currency)}/mo)\n` +
      `• Total card debt: ${money(summary.debtTotal, currency)}\n\n` +
      `Open FiHaven: ${href}\n\n` +
      prefsText(prefs, why),
    html: layout({
      preheader: `Paid ${money(summary.paid, currency)} last month · ${money(summary.debtTotal, currency)} card debt.`,
      heading: `Your ${summary.month} summary`,
      lines: ['Here’s where things stand:', table],
      cta: { href, label: 'Open FiHaven' },
      footnote: `${why} Turn it off any time.`,
      prefs,
    }),
  });
}

/* ── Trial-ending reminders ──────────────────────────────────── */
async function sendTrialReminder(to, trials, leadDays, currency, userId) {
  const n = trials.length;
  const plural = n === 1 ? '' : 's';
  // A trial isn't "due" — it ends. Same lead wording, right verb.
  const phrase = leadPhrase(leadDays).replace('due', 'ending');
  const href = link('/dashboard');
  const { prefs, listUnsubscribe } = prefsFor(userId, 'reminders');
  const items = itemList(
    trials.map((b) => {
      const end = b.trialEnds
        ? new Date(b.trialEnds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '';
      return {
        label: esc(b.name) || 'Subscription',
        meta: `Trial ends ${esc(end)}`,
        value: b.amount ? `${money(b.amount, currency)}<span class="mut" style="color:${MUTED};font-weight:500;">/cycle</span>` : '',
      };
    })
  );
  const textItems = trials
    .map((b) => {
      const end = b.trialEnds || '';
      return `• ${b.name || 'Subscription'} — trial ends ${end}`;
    })
    .join('\n');
  const why = "You're getting this because bill reminders are on.";
  return mail.sendMail({
    to,
    listUnsubscribe,
    subject: n === 1
      ? `Trial ending soon: ${trials[0].name || 'a subscription'}`
      : `${n} subscription trial${plural} ${phrase}`,
    text:
      `You have ${n} free trial${plural} ${phrase}:\n\n${textItems}\n\n` +
      `Open FiHaven to review or cancel before you're charged:\n${href}\n\n` +
      prefsText(prefs, why),
    html: layout({
      preheader: `Review ${n === 1 ? 'it' : 'them'} before the first charge.`,
      heading: `${n} trial${plural} ${phrase}`,
      lines: [
        'A subscription free trial is about to end — review it before the first charge:',
        items,
      ],
      cta: { href, label: 'Review subscriptions' },
      footnote: `${why} Turn them off any time.`,
      prefs,
    }),
  });
}

/* ── Card-linked offer expiry reminders ──────────────────────── */
// `offers` is [{ merchant, detail, expires, cardName }] — activated card
// offers about to lapse. The nudge is "use it before you lose it".
async function sendOfferReminder(to, offers, leadDays, currency, userId) {
  const n = offers.length;
  const plural = n === 1 ? '' : 's';
  const phrase = leadPhrase(leadDays).replace('due', 'expiring').replace('today', 'expiring today');
  const href = link('/dashboard');
  const { prefs, listUnsubscribe } = prefsFor(userId, 'offers');
  const items = itemList(
    offers.map((o) => {
      const end = o.expires
        ? new Date(o.expires + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : '';
      const det = o.detail ? esc(o.detail) : '';
      const where = o.cardName ? `${det ? ' · ' : ''}${esc(o.cardName)}` : '';
      return {
        label: esc(o.merchant) || 'Offer',
        meta: `${det}${where}`,
        value: end ? chip(`expires ${esc(end)}`) : '',
      };
    })
  );
  const textItems = offers
    .map((o) => `• ${o.merchant || 'Offer'}${o.detail ? ' — ' + o.detail : ''}${o.cardName ? ' on ' + o.cardName : ''} (expires ${o.expires || ''})`)
    .join('\n');
  const why = "You're getting this because offer reminders are on.";
  return mail.sendMail({
    to,
    listUnsubscribe,
    subject: n === 1
      ? `Offer ${phrase}: ${offers[0].merchant || 'a card offer'}`
      : `${n} card offer${plural} ${phrase}`,
    text:
      `You have ${n} card-linked offer${plural} ${phrase}:\n\n${textItems}\n\n` +
      `Use them before they lapse — open FiHaven: ${href}\n\n` +
      prefsText(prefs, why),
    html: layout({
      preheader: 'Use them before you lose the credit.',
      heading: `${n} offer${plural} ${phrase}`,
      lines: [
        'These activated card offers are about to expire — use them before you lose the credit:',
        items,
      ],
      cta: { href, label: 'Open FiHaven' },
      footnote: `${why} Turn them off any time.`,
      prefs,
    }),
  });
}

/* ── Household invite ────────────────────────────────────────── */
async function sendHouseholdInvite(to, { rawToken, householdName, inviterName }) {
  const href = link('/login?household=' + encodeURIComponent(rawToken));
  const who = inviterName ? esc(inviterName) : 'Someone';
  const hh = householdName ? esc(householdName) : 'their household';
  return mail.sendMail({
    to,
    subject: `You're invited to join ${householdName ? householdName : 'a household'} on FiHaven`,
    text:
      `${inviterName || 'Someone'} invited you to join ${householdName || 'their household'} on FiHaven.\n\n` +
      `Sign in (or create a free account) with this email, then open this link to join (valid for 7 days):\n${href}\n\n` +
      `If you weren't expecting this, you can ignore this email.`,
    html: layout({
      preheader: 'Share bills, budgets, and goals on FiHaven.',
      heading: 'Join a shared household',
      lines: [
        `<strong>${who}</strong> invited you to join <strong>${hh}</strong> on FiHaven, where you can share bills, budgets, and goals.`,
        'Sign in (or create a free account) with this email address, then open the link below to join. It is valid for 7 days.',
      ],
      cta: { href, label: 'Join the household' },
      footnote:
        "If you weren't expecting this invite, you can safely ignore this email — nothing is shared until you accept.",
    }),
  });
}

module.exports = {
  sendPasswordReset,
  sendVerifyEmail,
  sendRecovery,
  sendBillReminder,
  sendTrialReminder,
  sendOfferReminder,
  sendMonthlySummary,
  sendWeeklyDigest,
  sendHouseholdInvite,
};
