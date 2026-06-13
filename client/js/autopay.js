/* ═══════════════════════════════════════════════════════════
   autopay.js — opt-in auto-marking of autopay bills/cards.
   On load (and focus) any autopay item whose due date in the
   current period has arrived and has no payment yet is marked
   paid. Idempotent; mirrors the server scheduler's safety net so
   it also works when the app isn't opened. Gated on
   settings.autopayMark.
═══════════════════════════════════════════════════════════ */

import { bills, cards, payments, settings, save, entitlement } from './storage.svelte.js';
import {
  currentPeriodKey, paidAmount, goalAmountFor, isSkipped, monthKey,
} from './utils.js';
import { boundsForKey } from './period.js';
import { today, todayISO } from './tz.js';

// First occurrence of day-of-month `dueDay` within [start, end), or null.
function dueDateInPeriod(dueDay, bounds) {
  const start = bounds.start;
  let d = new Date(start.getFullYear(), start.getMonth(), dueDay);
  if (d < start) d = new Date(start.getFullYear(), start.getMonth() + 1, dueDay);
  return d < bounds.end ? d : null;
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function runAutopayMark() {
  // Pro-only (Balanced tiering) and opt-in. The server scheduler applies the
  // same gate, so this just mirrors it for an open client.
  if (!settings || !settings.autopayMark || !entitlement.pro) return false;
  const mk = currentPeriodKey();
  const bounds = boundsForKey(mk);
  const now = today();
  let added = false;

  const mark = (item, type, name, amount) => {
    if (!item.autopay || !item.dueDay) return;
    const due = dueDateInPeriod(parseInt(item.dueDay, 10), bounds);
    if (!due || due > now) return;                       // not due yet this period
    const refId = String(item.id);
    if (paidAmount(type, refId, mk) > 0.005) return;     // already has a payment
    if (isSkipped(type, refId, mk)) return;              // explicitly skipped
    payments.push({
      id: newId(), type, refId, name,
      amount: Number(amount) || 0, date: todayISO(), monthKey: monthKey(),
      note: 'Auto-marked (autopay)',
    });
    added = true;
  };

  bills.forEach((b) => mark(b, 'bill', b.name, parseFloat(b.amount) || 0));
  cards.forEach((c) => mark(c, 'card', (c.name || 'Card') + ' (payment)',
    goalAmountFor('card', String(c.id), mk)));

  if (added) save('fh_payments', payments);
  return added;
}
