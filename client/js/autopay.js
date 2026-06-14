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
  currentPeriodKey, paidAmount, goalAmountFor, isSkipped, monthKey, billActive,
} from './utils.js';
import { boundsForKey } from './period.js';
import { billDueOnOrBeforeInPeriod } from './billSchedule.js';
import { today, todayISO } from './tz.js';

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
    if (!item.autopay) return;
    if (type === 'bill') {
      if (!item.dueDay && !item.startDate) return;
      const due = billDueOnOrBeforeInPeriod(item, bounds, now);
      if (!due) return;
    } else {
      if (!item.dueDay) return;
      const dd = parseInt(item.dueDay, 10);
      let d = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), dd);
      if (d < bounds.start) d = new Date(bounds.start.getFullYear(), bounds.start.getMonth() + 1, dd);
      if (d >= bounds.end || d > now) return;
    }

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
