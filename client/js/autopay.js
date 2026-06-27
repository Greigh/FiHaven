/* ═══════════════════════════════════════════════════════════
   autopay.js — opt-in auto-marking of autopay bills/cards.
   On load (and focus) any autopay item whose due date in the
   current period has arrived is marked paid — at most ONCE per
   period. A per-month memory (settings.autopayDone) makes the mark
   stick once: if the user undoes it we don't re-add it, and $0
   items (where paidAmount can't tell us it was handled) work too.
   The memory is keyed by calendar month so it lines up with the
   server scheduler; a non-calendar period can span several months,
   so we look across all the months it overlaps. Gated on
   settings.autopayMark.
═══════════════════════════════════════════════════════════ */

import { bills, cards, payments, settings, save, entitlement } from './storage.svelte.js';
import {
  currentPeriodKey, paidAmount, goalAmountFor, isSkipped, monthKey, billActive,
} from './utils.js';
import { boundsForKey, monthsInBounds } from './period.js';
import { billDueOnOrBeforeInPeriod, billDueInPeriod } from './billSchedule.js';
import { today, todayISO } from './tz.js';

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Shift a "YYYY-MM" key by `delta` months.
function shiftMonthKey(mk, delta) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

export function runAutopayMark() {
  // Pro-only (Balanced tiering) and opt-in. The server scheduler applies the
  // same gate, so this just mirrors it for an open client.
  if (!settings || !settings.autopayMark || !entitlement.pro) return false;
  const mk = currentPeriodKey();
  const bounds = boundsForKey(mk);
  const now = today();
  // Calendar-month key — matches the stored payment monthKey and the
  // server's per-month autopay memory.
  const calKey = monthKey();
  let added = false;

  // Items autopay has already acted on, read across every calendar month
  // the current period overlaps (so a long rolling window's earlier marks
  // still count). Membership — not a payment amount — is what stops a
  // second mark, so an undo sticks and $0 items behave.
  const done = (settings.autopayDone && typeof settings.autopayDone === 'object')
    ? settings.autopayDone : {};
  const handled = new Set();
  for (const m of monthsInBounds(bounds)) {
    const arr = done[m];
    if (Array.isArray(arr)) arr.forEach((k) => handled.add(k));
  }
  const newlyMarked = [];

  // The day-of-month an autopay item's `autopayDay` lands on within the
  // current period — true once that day has arrived (on or before now).
  const autopayDayReached = (day) => {
    let d = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), day);
    if (d < bounds.start) d = new Date(bounds.start.getFullYear(), bounds.start.getMonth() + 1, day);
    return d < bounds.end && d <= now;
  };

  const mark = (item, type, name, amount) => {
    if (!item.autopay) return;
    const refKey = type + ':' + String(item.id);
    if (handled.has(refKey)) return;                     // already auto-marked this period
    // Explicit autopay pull day; blank → falls back to the due day.
    const apDay = parseInt(item.autopayDay, 10) || 0;
    if (type === 'bill') {
      if (!item.dueDay && !item.startDate) return;
      if (apDay) {
        // Autopay pulls on its own day; the bill must still be scheduled
        // in this period, but the trigger is the autopay day, not the due date.
        if (!billDueInPeriod(item, bounds)) return;
        if (!autopayDayReached(apDay)) return;
      } else {
        const due = billDueOnOrBeforeInPeriod(item, bounds, now);
        if (!due) return;
      }
    } else {
      const dd = apDay || parseInt(item.dueDay, 10);
      if (!dd) return;
      if (!autopayDayReached(dd)) return;
    }

    const refId = String(item.id);
    if (paidAmount(type, refId, mk) > 0.005) return;     // already has a real payment
    if (isSkipped(type, refId, mk)) return;              // explicitly skipped
    payments.push({
      id: newId(), type, refId, name,
      amount: Number(amount) || 0, date: todayISO(), monthKey: calKey,
      note: 'Auto-marked (autopay)',
    });
    handled.add(refKey);
    newlyMarked.push(refKey);
    added = true;
  };

  bills.forEach((b) => mark(b, 'bill', b.name, parseFloat(b.amount) || 0));
  cards.forEach((c) => mark(c, 'card', (c.name || 'Card') + ' (payment)',
    goalAmountFor('card', String(c.id), mk)));

  if (added) {
    // New marks go in this calendar month's bucket; keep per-month buckets
    // for the last 4 months (covers the longest rolling window) and drop
    // anything older.
    const calBucket = new Set(Array.isArray(done[calKey]) ? done[calKey] : []);
    newlyMarked.forEach((k) => calBucket.add(k));
    const minKey = shiftMonthKey(calKey, -3);
    const next = {};
    Object.keys(done).forEach((k) => { if (k >= minKey && k !== calKey) next[k] = done[k]; });
    next[calKey] = Array.from(calBucket);
    settings.autopayDone = next;
    save('fh_payments', payments);
    save('fh_settings', settings);
  }
  return added;
}
