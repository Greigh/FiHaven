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
const push = require('./push');
const billing = require('./billing');
const {
  billDueOn, daysUntilBillDue, billDueOnOrBeforeInPeriod,
  monthBoundsFromParts, atMidnight,
} = require('./billSchedule');

const SEND_HOUR = 8;            // default local hour (24h) to send
const REMINDER_LEAD_DAYS = 3;  // default days before a due day to remind
const DEFAULT_TZ = 'America/New_York';

// Clamp a user-supplied integer setting, falling back to `def` if unset/invalid.
function clampInt(v, lo, hi, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
}

// ISO-8601 weekday (Mon=0 … Sun=6) and week key ("YYYY-Www") from local parts.
function isoWeekday(lp) {
  return (new Date(Date.UTC(lp.y, lp.m - 1, lp.d)).getUTCDay() + 6) % 7;
}
function isoWeekKey(lp) {
  const d = new Date(Date.UTC(lp.y, lp.m - 1, lp.d));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(
    ((d - firstThursday) / 864e5 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
  );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

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

// Days from local-today until a "YYYY-MM-DD" date (trial end, etc.).
function daysUntilYmd(ymd, lp) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const today = Date.UTC(lp.y, lp.m - 1, lp.d);
  const target = Date.UTC(y, m - 1, d);
  return Math.round((target - today) / 864e5);
}

/** Subscription bills with a trial ending in exactly `days` local days. */
function trialsEndingOn(data, lp, days) {
  return (data.bills || []).filter((b) => {
    if (!b.trialEnds || !billActiveOn(b, lp.ymd)) return false;
    return daysUntilYmd(b.trialEnds, lp) === days;
  });
}

/** Active (unused) card-linked offers expiring in exactly `days` local days,
 *  flattened with the card name for the reminder email. */
function offersExpiringOn(data, lp, days) {
  const out = [];
  (data.cards || []).forEach((c) => {
    (c.offers || []).forEach((o) => {
      if (!o || o.used || !o.expires) return;
      if (daysUntilYmd(o.expires, lp) === days) {
        out.push({ merchant: o.merchant || 'Offer', detail: o.detail || '', expires: o.expires, cardName: c.name || 'Card' });
      }
    });
  });
  return out;
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

// Shift a "YYYY-MM" key by `delta` months.
function shiftMonthKey(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Auto-mark autopay bills/cards paid on their due day (opt-in). Mutates
// `data.payments`; returns true if anything was added. Marks each item at
// most once per calendar month, tracked in `settings.autopayDone` so a
// user's undo isn't reverted and $0 items behave (the same per-month
// memory the clients keep — see autopay.js). Bills mark their full amount;
// cards mark the minimum payment (what an autopay typically covers) — the
// client reconciles to the policy goal.
function markAutopay(data, lp) {
  const payments = data.payments || (data.payments = []);
  const settings = data.settings || (data.settings = {});
  const monthKey = lp.ym;
  const done = (settings.autopayDone && typeof settings.autopayDone === 'object')
    ? settings.autopayDone : {};
  const handled = new Set(Array.isArray(done[monthKey]) ? done[monthKey] : []);
  let changed = false;

  const markIfDue = (item, type, amount, name) => {
    if (!item || !item.autopay) return;
    const refId = String(item.id);
    const refKey = `${type}:${refId}`;
    if (handled.has(refKey)) return;                 // already auto-marked this month
    // Explicit autopay pull day; blank → falls back to the due day.
    const apDay = parseInt(item.autopayDay, 10) || 0;
    if (type === 'bill') {
      if (!item.dueDay && !item.startDate) return;
      if (!billActiveOn(item, lp.ymd)) return;
      if (apDay) {
        // Autopay pulls on its own day; the bill must still be scheduled
        // this month, but the trigger is the autopay day, not the due date.
        if (apDay !== lp.d) return;
        const mb = monthBoundsFromParts(lp);
        if (!billDueOnOrBeforeInPeriod(item, mb, mb.end)) return;
      } else {
        const today = atMidnight(new Date(lp.y, lp.m - 1, lp.d));
        if (!billDueOn(item, today)) return;
      }
    } else {
      const dd = apDay || parseInt(item.dueDay, 10);
      if (!dd || dd !== lp.d) return;
    }
    const already = payments.some(
      (p) => !p.skipped && p.type === type && String(p.refId) === refId && p.monthKey === monthKey
    );
    if (already) { handled.add(refKey); return; }
    payments.push({
      id: newPaymentId(), type, refId, name,
      amount: Number(amount) || 0, date: lp.ymd, monthKey,
      note: 'Auto-marked (autopay)',
    });
    handled.add(refKey);
    changed = true;
  };

  (data.bills || []).forEach((b) => markIfDue(b, 'bill', b.amount, b.name || 'Bill'));
  (data.cards || []).forEach((c) => markIfDue(c, 'card', c.minPayment, (c.name || 'Card') + ' (payment)'));

  if (changed) {
    // Persist the memory, keeping per-month buckets for the last 4 months
    // (covers the longest rolling window a client may read across) and
    // dropping anything older.
    const minKey = shiftMonthKey(monthKey, -3);
    const keep = {};
    Object.keys(done).forEach((k) => { if (k >= minKey && k !== monthKey) keep[k] = done[k]; });
    keep[monthKey] = Array.from(handled);
    settings.autopayDone = keep;
  }
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

// Bills coming due within the next 7 local days, plus balances — the
// content of the opt-in weekly digest.
function weeklyDigest(data, lp) {
  const today = atMidnight(new Date(lp.y, lp.m - 1, lp.d));
  const upcoming = (data.bills || [])
    .filter((b) => billActiveOn(b, lp.ymd) && (b.dueDay || b.startDate))
    .map((b) => ({ ...b, daysUntil: daysUntilBillDue(b, today) }))
    .filter((b) => b.daysUntil >= 0 && b.daysUntil <= 7)
    .sort((a, b) => a.daysUntil - b.daysUntil);
  return {
    upcoming,
    upcomingTotal: upcoming.reduce((s, b) => s + (Number(b.amount) || 0), 0),
    debtTotal: (data.cards || []).reduce((s, c) => s + (Number(c.balance) || 0), 0),
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
    if (!s.billReminders && !s.monthlySummary && !s.autopayMark && !s.weeklyDigest
      && !s.offerReminders && !s.pushNotifications) continue;

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

    // Reminders + digest + summary send at the user's chosen local hour
    // (default SEND_HOUR).
    const notifyHour = clampInt(s.notifyHour, 0, 23, SEND_HOUR);
    if (lp.hour === notifyHour) {
      // Bill reminders — bills due `leadDays` out, and (if enabled) on the due
      // day itself. One email per distinct lead so the "due in N days" copy
      // stays accurate when both fire the same day.
      if (s.billReminders && u.last_reminder_day !== lp.ymd) {
        const today = atMidnight(new Date(lp.y, lp.m - 1, lp.d));
        const lead = clampInt(s.reminderLeadDays, 0, 14, REMINDER_LEAD_DAYS);
        const leads = s.remindOnDueDay ? [...new Set([lead, 0])] : [lead];
        for (const days of leads) {
          const due = (u.data.bills || []).filter(
            (b) => billActiveOn(b, lp.ymd) &&
              (b.dueDay || b.startDate) &&
              daysUntilBillDue(b, today) === days
          );
          if (due.length) {
            try { await mailer.sendBillReminder(u.email, due, days, currency); }
            catch (e) { console.error('reminder send failed', u.email, e && e.message); }
            if (s.pushNotifications) {
              try { await push.sendBillReminderPush(u.id, due, days, currency); }
              catch (e) { console.error('push reminder failed', u.email, e && e.message); }
            }
          }
        }
        db.setReminderDay(u.id, lp.ymd); // stamp even with 0 due, so we don't rescan all day
      }

      // Trial-ending reminders — same lead window as bill reminders.
      if (s.billReminders && u.last_trial_reminder_day !== lp.ymd) {
        const lead = clampInt(s.reminderLeadDays, 0, 14, REMINDER_LEAD_DAYS);
        const leads = s.remindOnDueDay ? [...new Set([lead, 0])] : [lead];
        for (const days of leads) {
          const ending = trialsEndingOn(u.data, lp, days);
          if (ending.length) {
            try { await mailer.sendTrialReminder(u.email, ending, days, currency); }
            catch (e) { console.error('trial reminder send failed', u.email, e && e.message); }
            if (s.pushNotifications) {
              try { await push.sendTrialReminderPush(u.id, ending, days); }
              catch (e) { console.error('push trial reminder failed', u.email, e && e.message); }
            }
          }
        }
        if (db.setTrialReminderDay) db.setTrialReminderDay(u.id, lp.ymd);
      }

      // Card-linked offer expiry reminders — Pro (offers are a Pro Rewards
      // feature). Uses the same lead window as bill reminders. Nudges the
      // user to use an activated offer before it lapses.
      if (s.offerReminders && isPro && u.last_offer_reminder_day !== lp.ymd) {
        const lead = clampInt(s.reminderLeadDays, 0, 14, REMINDER_LEAD_DAYS);
        const leads = s.remindOnDueDay ? [...new Set([lead, 0])] : [lead];
        for (const days of leads) {
          const expiring = offersExpiringOn(u.data, lp, days);
          if (expiring.length) {
            try { await mailer.sendOfferReminder(u.email, expiring, days, currency); }
            catch (e) { console.error('offer reminder send failed', u.email, e && e.message); }
            if (s.pushNotifications) {
              try { await push.sendOfferReminderPush(u.id, expiring, days); }
              catch (e) { console.error('push offer reminder failed', u.email, e && e.message); }
            }
          }
        }
        if (db.setOfferReminderDay) db.setOfferReminderDay(u.id, lp.ymd);
      }

      // Weekly digest — once a week (Monday), upcoming bills + balances.
      const weekKey = isoWeekKey(lp);
      if (s.weeklyDigest && isoWeekday(lp) === 0 && u.last_digest_week !== weekKey) {
        const digest = weeklyDigest(u.data, lp);
        try { await mailer.sendWeeklyDigest(u.email, digest, currency); }
        catch (e) { console.error('digest send failed', u.email, e && e.message); }
        if (s.pushNotifications) {
          try { await push.sendWeeklyDigestPush(u.id, digest, currency); }
          catch (e) { console.error('push digest failed', u.email, e && e.message); }
        }
        if (db.setDigestWeek) db.setDigestWeek(u.id, weekKey);
      }

      // Monthly summary — the 1st of the local month.
      if (s.monthlySummary && lp.d === 1 && u.last_summary_month !== lp.ym) {
        const summary = summarize(u.data, lp);
        try { await mailer.sendMonthlySummary(u.email, summary, currency); }
        catch (e) { console.error('summary send failed', u.email, e && e.message); }
        if (s.pushNotifications) {
          try { await push.sendMonthlySummaryPush(u.id, summary, currency); }
          catch (e) { console.error('push summary failed', u.email, e && e.message); }
        }
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
  start, runChecks, localParts, daysUntilDue, daysUntilYmd, trialsEndingOn,
  offersExpiringOn, summarize, weeklyDigest, isoWeekKey, isoWeekday,
  SEND_HOUR, REMINDER_LEAD_DAYS, DEFAULT_TZ,
};
