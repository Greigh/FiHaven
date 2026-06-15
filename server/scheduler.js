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
const billing = require('./billing');
const {
  billDueOn, daysUntilBillDue, billDueOnOrBeforeInPeriod,
  monthBoundsFromParts, atMidnight,
} = require('./billSchedule');

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

// A bill's optional active window (bills-only feature; mirrors the
// client's billActive). `ymd` is the user's local "YYYY-MM-DD". A
// not-yet-started or stopped bill is excluded from autopay, reminders,
// and the monthly summary total.
function billActiveOn(item, ymd) {
  if (!item) return false;
  if (item.startDate && ymd < item.startDate) return false;
  if (item.endDate && ymd > item.endDate) return false;
  return true;
}

// A web-compatible payment id (base36 timestamp + random), matching the
// client's format so ids round-trip.
function newPaymentId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Auto-mark autopay bills/cards paid on their due day (opt-in). Mutates
// `data.payments`; returns true if anything was added. Idempotent: only
// adds when the item has no (non-skip) payment for the current month.
// Bills mark their full amount; cards mark the minimum payment (what an
// autopay typically covers) — the client reconciles to the policy goal.
function markAutopay(data, lp) {
  const payments = data.payments || (data.payments = []);
  const monthKey = lp.ym;
  let changed = false;

  const markIfDue = (item, type, amount, name) => {
    if (!item || !item.autopay) return;
    if (type === 'bill') {
      if (!item.dueDay && !item.startDate) return;
      const today = atMidnight(new Date(lp.y, lp.m - 1, lp.d));
      if (!billDueOn(item, today)) return;
      if (!billActiveOn(item, lp.ymd)) return;
    } else {
      if (!item.dueDay || parseInt(item.dueDay, 10) !== lp.d) return;
    }
    const refId = String(item.id);
    const already = payments.some(
      (p) => !p.skipped && p.type === type && String(p.refId) === refId && p.monthKey === monthKey
    );
    if (already) return;
    payments.push({
      id: newPaymentId(), type, refId, name,
      amount: Number(amount) || 0, date: lp.ymd, monthKey,
      note: 'Auto-marked (autopay)',
    });
    changed = true;
  };

  (data.bills || []).forEach((b) => markIfDue(b, 'bill', b.amount, b.name || 'Bill'));
  (data.cards || []).forEach((c) => markIfDue(c, 'card', c.minPayment, (c.name || 'Card') + ' (payment)'));
  return changed;
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
    billsTotal: bills.filter((b) => billActiveOn(b, lp.ymd)).reduce((s, b) => s + (Number(b.amount) || 0), 0),
    debtTotal: cards.reduce((s, c) => s + (Number(c.balance) || 0), 0),
    billsCount: bills.filter((b) => billActiveOn(b, lp.ymd)).length,
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
    if (!s.billReminders && !s.monthlySummary && !s.autopayMark) continue;

    let lp;
    try { lp = localParts(now, s.timezone || DEFAULT_TZ); }
    catch (e) {
      try { lp = localParts(now, DEFAULT_TZ); } catch (e2) { continue; }
    }
    const currency = s.currency || 'USD';

    // Auto-mark autopay items paid on their due day, at the user's chosen
    // local hour (default 9). Writes back to the user's data blob; clients
    // pick it up on next sync. Pro-only (Balanced tiering) — the server is
    // authoritative, so a non-Pro user toggling it on is a no-op here.
    let isPro = false;
    try { isPro = !!billing.computeEntitlement(u.id).pro; } catch (_) { isPro = false; }
    if (s.autopayMark && isPro) {
      const markHour = Math.min(23, Math.max(0, parseInt(s.autopayMarkHour, 10) || 9));
      if (lp.hour === markHour && u.last_autopay_day !== lp.ymd) {
        try {
          if (markAutopay(u.data, lp)) {
            db.upsertUserData(u.id, {
              bills: u.data.bills || [],
              cards: u.data.cards || [],
              payments: u.data.payments || [],
              settings: u.data.settings || {},
            });
          }
          if (db.setAutopayDay) db.setAutopayDay(u.id, lp.ymd);
        } catch (e) { console.error('autopay-mark failed', u.email, e && e.message); }
      }
    }

    // Reminders + summary send at the fixed SEND_HOUR.
    if (lp.hour === SEND_HOUR) {
      // Bill reminders — bills whose next due day is exactly LEAD days out.
      if (s.billReminders && u.last_reminder_day !== lp.ymd) {
        const today = atMidnight(new Date(lp.y, lp.m - 1, lp.d));
        const due = (u.data.bills || []).filter(
          (b) => billActiveOn(b, lp.ymd) &&
            (b.dueDay || b.startDate) &&
            daysUntilBillDue(b, today) === REMINDER_LEAD_DAYS
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
}

let timer = null;
function start() {
  if (timer) return;
  const tick = () => module.exports.runChecks(new Date())
    .catch((e) => console.error('scheduler tick failed', e && e.message));
  timer = setInterval(tick, 60 * 60 * 1000);
  timer.unref();
  // Also catch the current hour shortly after boot.
  setTimeout(tick, 5000).unref();
  console.log('scheduler started (reminders + monthly summary)');
}

module.exports = {
  start, runChecks, localParts, daysUntilDue, summarize,
  SEND_HOUR, REMINDER_LEAD_DAYS, DEFAULT_TZ,
};
