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
  daysUntilBillDue, billDueInPeriod, billDueOnOrBeforeInPeriod, atMidnight,
} = require('./billSchedule');
const {
  getPeriodConfig, periodBounds, monthsInBounds, paymentInBounds,
} = require('./period');
const { paidGoalPolicy, goalAmountForCard, cardNeedsAmount } = require('./paidGoal');

const SEND_HOUR = 8;            // default local hour (24h) to send
const REMINDER_LEAD_DAYS = 3;  // default days before a due day to remind
const DEFAULT_TZ = 'America/New_York';

const MAX_REMINDER_OFFSETS = 5;  // how many lead days a user may pick

// Clamp a user-supplied integer setting, falling back to `def` if unset/invalid.
function clampInt(v, lo, hi, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
}

/* The lead days a user wants reminding on, newest-first (e.g. [7, 3, 0]).

   `reminderOffsets` is the current setting — an array, because a user can pick
   several. The single `reminderLeadDays` + `remindOnDueDay` pair it replaced is
   still read as the fallback, and still written alongside it by every client,
   so an app version that predates the array keeps working against the same
   account. Only fall back when the array is absent, not when it's empty: an
   empty array is a real choice on the clients ("don't remind me"), and reading
   the legacy keys there would resurrect reminders the user just cleared. */
function reminderOffsets(s) {
  const raw = s && s.reminderOffsets;
  if (Array.isArray(raw)) {
    const days = raw
      .map((d) => parseInt(d, 10))
      .filter((d) => Number.isFinite(d) && d >= 0 && d <= 14);
    return [...new Set(days)].sort((a, b) => b - a).slice(0, MAX_REMINDER_OFFSETS);
  }
  const lead = clampInt(s && s.reminderLeadDays, 0, 14, REMINDER_LEAD_DAYS);
  const legacy = (s && s.remindOnDueDay) ? [lead, 0] : [lead];
  return [...new Set(legacy)].sort((a, b) => b - a);
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
  activeCards(data).forEach((c) => {
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
//
// `archived` is part of that gate on every client (`!archived && !notStarted
// && !ended`) and was missing here, so the server kept treating soft-deleted
// bills as live: it emailed and pushed reminders for them, counted them in the
// monthly summary and weekly digest, and — worst — auto-marked them paid,
// writing phantom payments into the user's data that then synced everywhere.
// True when a money field was actually filled in. Blank ('' / null / undefined)
// means "not set", which is different from an explicit 0. Mirrors amountIsSet in
// client/js/utils.js.
function hasAmount(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return !isNaN(parseFloat(v));
}

function billActiveOn(item, ymd) {
  if (!item) return false;
  if (item.archived) return false;
  if (item.startDate && ymd < item.startDate) return false;
  if (item.endDate && ymd > item.endDate) return false;
  return true;
}

/** Non-archived cards — the client's `activeCards`. Archived records stay in
 *  the blob so they round-trip and can be restored, but must never drive a
 *  reminder, a total, or an autopay mark. */
function activeCards(data) {
  return (data.cards || []).filter((c) => c && !c.archived);
}

/* ── Already-paid suppression ────────────────────────────────────
   A reminder for a bill the user already paid is noise. "Paid" is per billing
   period, so the check must run against the period the UPCOMING due date falls
   in — NOT the one today sits in. At a 7-day lead on Aug 28 the due date is in
   September; matching on today's period would read the August payment and
   silence a September reminder that should fire.

   Placement mirrors the clients exactly (see server/period.js, which is
   parity-tested against client/js/period.js): a payment is located by its
   `date` inside the period's [start, end), falling back to `monthKey` for
   legacy date-less rows. */

// Cent-level tolerance so a goal met to the penny reads as full — the
// clients' Schedule.PAID_EPSILON / isFullyPaid.
const PAID_EPSILON = 0.005;

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/* Payments of one type for one item, inside `bounds`. */
function paymentsForItem(data, type, refId, bounds) {
  return (data.payments || []).filter(
    (p) => p && p.type === type && String(p.refId) === String(refId) &&
      paymentInBounds(p, bounds)
  );
}

function paidAmountIn(data, type, refId, bounds) {
  return paymentsForItem(data, type, refId, bounds)
    .filter((p) => !p.skipped)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

function isSkippedIn(data, type, refId, bounds) {
  return paymentsForItem(data, type, refId, bounds).some((p) => p.skipped);
}

/* True when `bill` needs no reminder for the period containing `dueDate`:
   either explicitly skipped, or paid up to its full amount.

   A PARTIAL payment still reminds — money is still owed that period.

   The `paid > 0` gate matters for a bill with no amount set: its goal is 0,
   which `paid >= goal` satisfies trivially, so without the gate every
   amount-less bill would count as paid forever and go silent. That's the same
   zero-goal trap `needsAmount` guards against on the clients. */
function billSettledForDue(data, bill, dueDate, cfg) {
  const refId = String(bill.id);
  const bounds = periodBounds(dueDate, cfg || getPeriodConfig(data.settings));
  if (!bounds) return false;
  if (isSkippedIn(data, 'bill', refId, bounds)) return true;
  const paid = paidAmountIn(data, 'bill', refId, bounds);
  if (paid <= 0) return false;
  const goal = hasAmount(bill.amount) ? Number(bill.amount) : 0;
  return paid >= goal - PAID_EPSILON;
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

/* Auto-mark autopay bills/cards paid once their pull day has arrived (opt-in).
   Mutates `data.payments`; returns true if anything was added. Mirrors
   runAutopayMark in client/js/autopay.js.

   Marks each item at most once per PERIOD. The done-memory is still bucketed by
   CALENDAR MONTH — that's the stored format the clients read and write, and a
   non-calendar period can straddle two months, so the read side unions every
   month the period overlaps (monthsInBounds) while new marks go into the
   current calendar month's bucket. Same for the payment's own `monthKey`: it
   stays calendar so records round-trip byte-identically with the clients.

   Bills mark their full amount; cards mark the minimum payment (what an
   autopay typically covers) — the client reconciles to the policy goal. */
function markAutopay(data, lp) {
  const payments = data.payments || (data.payments = []);
  const settings = data.settings || (data.settings = {});
  const cfg = getPeriodConfig(settings);
  const policy = paidGoalPolicy(settings);
  const now = atMidnight(new Date(lp.y, lp.m - 1, lp.d));
  const bounds = periodBounds(now, cfg);
  if (!bounds) return false;
  const calKey = lp.ym;                              // stored bucket / payment monthKey
  const done = (settings.autopayDone && typeof settings.autopayDone === 'object')
    ? settings.autopayDone : {};

  // Items autopay has already acted on, read across every calendar month the
  // current period overlaps, so a long rolling window's earlier marks still
  // count. Membership — not a payment amount — is what stops a second mark, so
  // an undo sticks and $0 items behave.
  const handled = new Set();
  for (const m of monthsInBounds(bounds)) {
    const arr = done[m];
    if (Array.isArray(arr)) arr.forEach((k) => handled.add(k));
  }
  const newlyMarked = [];
  let changed = false;

  /* The day-of-month an autopay item's pull day lands on within the current
     period — true once that day has arrived. Note this is "on or after", not
     "exactly today": under a custom period the pull day is a day INSIDE the
     period, not a day-of-month equal to today's. The handled-set is what holds
     it to one mark, so a late pass (downtime, a timezone change) catches up
     instead of skipping the period entirely. */
  const autopayDayReached = (day) => {
    let d = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), day);
    if (d < bounds.start) d = new Date(bounds.start.getFullYear(), bounds.start.getMonth() + 1, day);
    return d < bounds.end && d <= now;
  };

  /* Gate order mirrors `mark` in client/js/autopay.js: due → already-paid →
     skipped → nothing-to-measure → write. The amount is resolved LAST because
     a card's goal depends on what's already been paid this period. */
  const markIfDue = (item, type, name) => {
    if (!item || !item.autopay) return;
    const refId = String(item.id);
    const refKey = `${type}:${refId}`;
    if (handled.has(refKey)) return;                 // already auto-marked this period
    // Explicit autopay pull day; blank → falls back to the due day.
    const apDay = parseInt(item.autopayDay, 10) || 0;
    if (type === 'bill') {
      if (!item.dueDay && !item.startDate) return;
      if (!billActiveOn(item, lp.ymd)) return;
      if (apDay) {
        // Autopay pulls on its own day; the bill must still be scheduled in
        // this period, but the trigger is the autopay day, not the due date.
        if (!billDueInPeriod(item, bounds)) return;
        if (!autopayDayReached(apDay)) return;
      } else {
        if (!billDueOnOrBeforeInPeriod(item, bounds, now)) return;
      }
    } else {
      const dd = apDay || parseInt(item.dueDay, 10);
      if (!dd) return;
      if (!autopayDayReached(dd)) return;
    }
    /* A real payment already covers it. Deliberately NOT recorded in
       `handled`: only newly-marked keys are persisted, and each item is
       visited once per run, so noting it here would do nothing. The paid
       check re-runs every pass and is what keeps this idempotent — same as
       `mark` in client/js/autopay.js. */
    const paid = paidAmountIn(data, type, refId, bounds);
    if (paid > PAID_EPSILON) return;
    // Explicitly skipped for this period. Auto-marking it paid would overrule
    // the user's own answer with a payment that never happened.
    if (isSkippedIn(data, type, refId, bounds)) return;

    /* Nothing to auto-mark when the field the goal actually reads was never
       filled in: recording a $0 payment invents a payment that did not happen,
       puts a phantom row in History, and feeds a 0 into recentPaymentAverage
       (which drives the rollover prefill). Blank is unfinished setup, not a $0
       charge — the row says "No amount set" and stays that way.

       For a card that question depends on the policy: a balance-derived goal
       never reads minPayment, so a card without one is fine under
       recommended/full and unfinished under minimum. */
    let amount;
    if (type === 'bill') {
      if (!hasAmount(item.amount)) return;
      amount = Number(item.amount) || 0;
    } else {
      if (cardNeedsAmount(item, policy)) return;
      // The policy goal, NOT a flat minPayment — what every client marks.
      amount = goalAmountForCard(item, policy, paid, now);
    }
    payments.push({
      id: newPaymentId(), type, refId, name,
      amount: Number(amount) || 0, date: lp.ymd, monthKey: calKey,
      note: 'Auto-marked (autopay)',
    });
    handled.add(refKey);
    newlyMarked.push(refKey);
    changed = true;
  };

  (data.bills || []).forEach((b) => markIfDue(b, 'bill', b.name || 'Bill'));
  activeCards(data).forEach((c) => markIfDue(c, 'card', (c.name || 'Card') + ' (payment)'));

  if (changed) {
    /* New marks go in THIS calendar month's bucket. `handled` can hold keys
       unioned in from a neighbouring month's bucket, so writing it wholesale
       would migrate those keys into this month and resurrect them once the old
       bucket ages out — push only what we actually marked. Keep the last 4
       months (covers the longest rolling window a client may read across) and
       drop anything older. */
    const calBucket = new Set(Array.isArray(done[calKey]) ? done[calKey] : []);
    newlyMarked.forEach((k) => calBucket.add(k));
    const minKey = shiftMonthKey(calKey, -3);
    const keep = {};
    Object.keys(done).forEach((k) => { if (k >= minKey && k !== calKey) keep[k] = done[k]; });
    keep[calKey] = Array.from(calBucket);
    settings.autopayDone = keep;
  }
  return changed;
}

/* Stats for the monthly summary (covers the month that just ended).

   Deliberately still CALENDAR-based while the reminders, digest and autopay are
   period-aware: this email is titled "Your FiHaven summary — August 2026" and
   fires on the 1st, so the calendar month IS the subject. Making it follow a
   custom period would put a range in a mail that names a month. Not an
   oversight — leave it. */
function summarize(data, lp) {
  const bills = data.bills || [];
  // Archived cards are soft-deleted, so they must not count as debt (the
  // clients' `liabilities` reads activeCards).
  const cards = activeCards(data);
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
  const cfg = getPeriodConfig(data.settings);
  const upcoming = (data.bills || [])
    .filter((b) => billActiveOn(b, lp.ymd) && (b.dueDay || b.startDate))
    .map((b) => ({ ...b, daysUntil: daysUntilBillDue(b, today) }))
    .filter((b) => b.daysUntil >= 0 && b.daysUntil <= 7)
    // Already paid (or skipped) for the period it's about to hit — listing it
    // under "due in the next 7 days" is the same false alarm the per-bill
    // reminder used to send.
    .filter((b) => !billSettledForDue(data, b, addDays(today, b.daysUntil), cfg))
    .sort((a, b) => a.daysUntil - b.daysUntil);
  return {
    upcoming,
    upcomingTotal: upcoming.reduce((s, b) => s + (Number(b.amount) || 0), 0),
    debtTotal: activeCards(data).reduce((s, c) => s + (Number(c.balance) || 0), 0),
  };
}

/* Send one notification email, reporting whether it actually landed.

   This return value gates the "already sent" stamp, and that matters more than
   it looks: the stamp is the ONLY thing that stops a re-send. Stamping after a
   FAILED send marks a mail that never arrived as delivered, so it's dropped
   rather than retried — one SMTP blip silently costs the user that day's
   reminder, with nothing but a console line to show for it. Leaving the stamp
   unset lets the next pass in this same hour (a restart fires the boot
   catch-up) try again; nothing was sent, so there's nothing to double up on. */
async function trySend(label, email, send) {
  try {
    await send();
    return true;
  } catch (e) {
    console.error(`${label} send failed`, email, e && e.message);
    return false;
  }
}

// Push is best-effort and has its own delivery path. A push failure must NOT
// gate the email stamp, or a dead push token would make us re-send the email.
async function tryPush(label, email, send) {
  try { await send(); } catch (e) { console.error(`${label} failed`, email, e && e.message); }
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
            // Write the WHOLE record back. upsertUserData replaces it, so a
            // snapshot naming only some lists silently erases the rest — this
            // dropped the user's transactions, net-worth accounts, and savings
            // goals every time autopay auto-marked something.
            db.upsertUserData(u.id, {
              bills: u.data.bills || [],
              cards: u.data.cards || [],
              payments: u.data.payments || [],
              accounts: u.data.accounts || [],
              goals: u.data.goals || [],
              transactions: u.data.transactions || [],
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
        const leads = reminderOffsets(s);
        const cfg = getPeriodConfig(s);
        let delivered = true;
        for (const days of leads) {
          const dueDate = addDays(today, days);
          const due = (u.data.bills || []).filter(
            (b) => billActiveOn(b, lp.ymd) &&
              (b.dueDay || b.startDate) &&
              daysUntilBillDue(b, today) === days &&
              !billSettledForDue(u.data, b, dueDate, cfg)
          );
          if (due.length) {
            const ok = await trySend('reminder', u.email,
              () => mailer.sendBillReminder(u.email, due, days, currency, u.id));
            delivered = delivered && ok;
            if (s.pushNotifications) {
              await tryPush('push reminder', u.email,
                () => push.sendBillReminderPush(u.id, due, days, currency));
            }
          }
        }
        // Stamp even with 0 due, so we don't rescan all day — but never stamp a
        // send that failed, or it's silently dropped instead of retried.
        if (delivered) db.setReminderDay(u.id, lp.ymd);
      }

      // Trial-ending reminders — same lead window as bill reminders.
      if (s.billReminders && u.last_trial_reminder_day !== lp.ymd) {
        const leads = reminderOffsets(s);
        let delivered = true;
        for (const days of leads) {
          const ending = trialsEndingOn(u.data, lp, days);
          if (ending.length) {
            const ok = await trySend('trial reminder', u.email,
              () => mailer.sendTrialReminder(u.email, ending, days, currency, u.id));
            delivered = delivered && ok;
            if (s.pushNotifications) {
              await tryPush('push trial reminder', u.email,
                () => push.sendTrialReminderPush(u.id, ending, days));
            }
          }
        }
        if (delivered && db.setTrialReminderDay) db.setTrialReminderDay(u.id, lp.ymd);
      }

      // Card-linked offer expiry reminders — Pro (offers are a Pro Rewards
      // feature). Uses the same lead window as bill reminders. Nudges the
      // user to use an activated offer before it lapses.
      if (s.offerReminders && isPro && u.last_offer_reminder_day !== lp.ymd) {
        const leads = reminderOffsets(s);
        let delivered = true;
        for (const days of leads) {
          const expiring = offersExpiringOn(u.data, lp, days);
          if (expiring.length) {
            const ok = await trySend('offer reminder', u.email,
              () => mailer.sendOfferReminder(u.email, expiring, days, currency, u.id));
            delivered = delivered && ok;
            if (s.pushNotifications) {
              await tryPush('push offer reminder', u.email,
                () => push.sendOfferReminderPush(u.id, expiring, days));
            }
          }
        }
        if (delivered && db.setOfferReminderDay) db.setOfferReminderDay(u.id, lp.ymd);
      }

      // Weekly digest — once a week (Monday), upcoming bills + balances.
      const weekKey = isoWeekKey(lp);
      if (s.weeklyDigest && isoWeekday(lp) === 0 && u.last_digest_week !== weekKey) {
        const digest = weeklyDigest(u.data, lp);
        const ok = await trySend('digest', u.email,
          () => mailer.sendWeeklyDigest(u.email, digest, currency, u.id));
        if (s.pushNotifications) {
          await tryPush('push digest', u.email,
            () => push.sendWeeklyDigestPush(u.id, digest, currency));
        }
        if (ok && db.setDigestWeek) db.setDigestWeek(u.id, weekKey);
      }

      // Monthly summary — the 1st of the local month.
      if (s.monthlySummary && lp.d === 1 && u.last_summary_month !== lp.ym) {
        const summary = summarize(u.data, lp);
        const ok = await trySend('summary', u.email,
          () => mailer.sendMonthlySummary(u.email, summary, currency, u.id));
        if (s.pushNotifications) {
          await tryPush('push summary', u.email,
            () => push.sendMonthlySummaryPush(u.id, summary, currency));
        }
        if (ok) db.setSummaryMonth(u.id, lp.ym);
      }
    }
  }
}

let timer = null;
let started = false;
function start() {
  if (started) return;
  started = true;

  const tick = () => module.exports.runChecks(new Date())
    .catch((e) => console.error('scheduler tick failed', e && e.message));

  /* Re-arm against the wall clock rather than setInterval(3_600_000) from boot.
     Every send here fires on an exact hour match (`lp.hour === notifyHour`), and
     Node re-arms an interval only AFTER its callback resolves — so each pass's
     duration is added to the next delay. A pass that awaits SMTP for every user
     is not fast, so the drift accumulates until a whole hour is stepped over,
     and every user whose notifyHour lands in the skipped hour silently gets
     nothing that day. Aligning to :00 keeps one tick per real hour however long
     a pass takes. */
  const armNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(now.getHours() + 1, 0, 30, 0);   // :00:30, safely inside the hour
    timer = setTimeout(async () => {
      await tick();
      armNext();
    }, Math.max(1000, next.getTime() - now.getTime()));
    timer.unref();
  };

  armNext();
  // Also catch the current hour shortly after boot.
  setTimeout(tick, 5000).unref();
  console.log('scheduler started (reminders + monthly summary)');
}

module.exports = {
  start, runChecks, localParts, daysUntilDue, daysUntilYmd, trialsEndingOn,
  offersExpiringOn, summarize, weeklyDigest, isoWeekKey, isoWeekday,
  reminderOffsets, billActiveOn, markAutopay,
  SEND_HOUR, REMINDER_LEAD_DAYS, MAX_REMINDER_OFFSETS, DEFAULT_TZ,
};
