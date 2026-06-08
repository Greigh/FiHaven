/* ═══════════════════════════════════════════════════════════
   scheduler.js — opt-in email reminders + monthly summaries.
   Ticks hourly; for each verified, opted-in user it checks THEIR
   local time (from the saved timezone). Bill reminders go out at a
   fixed local hour for bills due in REMINDER_LEAD_DAYS days; the
   monthly summary goes out on the 1st. Per-day / per-month stamps
   on the user row guarantee a single send across restarts.

   Pure helpers (localParts / daysUntilDue / summarize) and runChecks
   are exported so the behaviour can be unit-tested with a fixed clock
   and an injected mailer.
═════════════════════════════════════════════════════════════════ */

'use strict';

const dbApi = require('./db');
const emails = require('./emails');

const SEND_HOUR = 8;            // local hour (24h) to send
const REMINDER_LEAD_DAYS = 3;  // remind this many days before a due day
const DEFAULT_TZ = 'America/New_York';

// Local calendar parts for `tz` at `date`. Throws on an invalid tz.
function localParts(date, tz) {
  const parts = {};
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(date).forEach((p) => { parts[p.type] = p.value; });
  // Intl can emit hour "24" at midnight in some engines — normalize to 0.
  const hour = parts.hour === '24' ? 0 : parseInt(parts.hour, 10);
  return {
    y: +parts.year, m: +parts.month, d: +parts.day, hour,
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    ym: `${parts.year}-${parts.month}`,
  };
}

// Days from local-today until the next occurrence of a day-of-month
// `dueDay`. Both dates are built in the same frame so there's no tz skew.
function daysUntilDue(dueDay, lp) {
  const today = Date.UTC(lp.y, lp.m - 1, lp.d);
  let due = Date.UTC(lp.y, lp.m - 1, dueDay);
  let diff = Math.round((due - today) / 864e5);
  if (diff < 0) {
    due = Date.UTC(lp.y, lp.m, dueDay); // roll to next month
    diff = Math.round((due - today) / 864e5);
  }
  return diff;
}

// Stats for the monthly summary (covers the month that just ended).
function summarize(data, lp) {
  const bills = data.bills || [];
  const cards = data.cards || [];
  const payments = data.payments || [];
  const prev = new Date(Date.UTC(lp.y, lp.m - 1, 1));
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const prevKey = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
  const paid = payments
    .filter((p) => p.monthKey === prevKey)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return {
    month: prev.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    paid,
    billsTotal: bills.reduce((s, b) => s + (Number(b.amount) || 0), 0),
    debtTotal: cards.reduce((s, c) => s + (Number(c.balance) || 0), 0),
    billsCount: bills.length,
  };
}

// One pass over all verified users. `deps` lets tests inject a fake
// db / mailer; defaults to the real ones.
async function runChecks(now = new Date(), deps = {}) {
  const db = deps.db || dbApi;
  const mailer = deps.emails || emails;

  let users;
  try { users = db.allUsersWithData(); }
  catch (e) { console.error('scheduler: load failed', e && e.message); return; }

  for (const u of users) {
    if (!u.email_verified) continue;
    const s = (u.data && u.data.settings) || {};
    if (!s.billReminders && !s.monthlySummary) continue;

    let lp;
    try { lp = localParts(now, s.timezone || DEFAULT_TZ); }
    catch (e) {
      try { lp = localParts(now, DEFAULT_TZ); } catch (e2) { continue; }
    }
    if (lp.hour !== SEND_HOUR) continue;
    const currency = s.currency || 'USD';

    // Bill reminders — bills whose next due day is exactly LEAD days out.
    if (s.billReminders && u.last_reminder_day !== lp.ymd) {
      const due = (u.data.bills || []).filter(
        (b) => b.dueDay && daysUntilDue(parseInt(b.dueDay, 10), lp) === REMINDER_LEAD_DAYS
      );
      if (due.length) {
        try { await mailer.sendBillReminder(u.email, due, REMINDER_LEAD_DAYS, currency); }
        catch (e) { console.error('reminder send failed', u.email, e && e.message); }
      }
      db.setReminderDay(u.id, lp.ymd); // stamp even with 0 due, so we don't rescan all day
    }

    // Monthly summary — the 1st of the local month.
    if (s.monthlySummary && lp.d === 1 && u.last_summary_month !== lp.ym) {
      try { await mailer.sendMonthlySummary(u.email, summarize(u.data, lp), currency); }
      catch (e) { console.error('summary send failed', u.email, e && e.message); }
      db.setSummaryMonth(u.id, lp.ym);
    }
  }
}

let timer = null;
function start() {
  if (timer) return;
  timer = setInterval(() => {
    runChecks(new Date()).catch((e) => console.error('scheduler tick failed', e && e.message));
  }, 60 * 60 * 1000);
  timer.unref();
  // Also catch the current hour shortly after boot.
  setTimeout(() => runChecks(new Date()).catch(() => {}), 5000).unref();
  console.log('scheduler started (reminders + monthly summary)');
}

module.exports = {
  start, runChecks, localParts, daysUntilDue, summarize,
  SEND_HOUR, REMINDER_LEAD_DAYS, DEFAULT_TZ,
};
