/* ═══════════════════════════════════════════════════════════
   billSchedule.js — when a bill is actually due, honoring its
   frequency (Monthly / Weekly / Bi-weekly / Quarterly / Annually).
   Cards stay monthly-on-dueDay; only bills use this module.
═══════════════════════════════════════════════════════════ */

import { today as todayInTz } from './tz.js';
import { billActive, ymd } from './utils.js';

const DAY = 864e5;
const MAX_LOOKAHEAD = 400;

export function billFrequencySpec(frequency) {
  switch (frequency) {
    case 'Weekly': return { unit: 'day', step: 7 };
    case 'Bi-weekly': return { unit: 'day', step: 14 };
    case 'Quarterly': return { unit: 'month', step: 3 };
    case 'Annually': return { unit: 'month', step: 12 };
    default: return { unit: 'month', step: 1 };
  }
}

/** The billing-cycle noun for a bill's frequency, for labels like
 *  "Paid this quarter" / "Skip this week". Cards are always monthly,
 *  so this is bills-only. */
export function billPeriodNoun(frequency) {
  switch (frequency) {
    case 'Weekly': return 'week';
    case 'Bi-weekly': return 'cycle';
    case 'Quarterly': return 'quarter';
    case 'Annually': return 'year';
    default: return 'month';
  }
}

function atMidnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function parseBillYmd(s) {
  if (!s) return null;
  const parts = s.split('-').map(Number);
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  return atMidnight(new Date(parts[0], parts[1] - 1, parts[2]));
}

/** Stable anchor for the recurrence cycle. */
export function billAnchor(bill) {
  if (bill.startDate) {
    const p = parseBillYmd(bill.startDate);
    if (p) return p;
  }
  const dd = parseInt(bill.dueDay, 10) || 1;
  const t = todayInTz();
  return atMidnight(new Date(t.getFullYear(), 0, dd));
}

function dateForDueDay(year, month, dueDay) {
  return atMidnight(new Date(year, month, dueDay));
}

/** True if `date` is a scheduled due date for this bill. */
export function billDueOn(bill, date) {
  const dd = parseInt(bill.dueDay, 10);
  if (!dd && !bill.startDate) return false;
  const d = atMidnight(date instanceof Date ? date : parseBillYmd(date) || todayInTz());
  if (!billActive(bill, d)) return false;

  const spec = billFrequencySpec(bill.frequency);
  const anchor = billAnchor(bill);

  if (spec.unit === 'day') {
    const days = Math.round((d - anchor) / DAY);
    return days >= 0 && days % spec.step === 0;
  }

  const dueDay = dd || anchor.getDate();
  const dueThisMonth = dateForDueDay(d.getFullYear(), d.getMonth(), dueDay);
  if (ymd(dueThisMonth) !== ymd(d)) return false;
  const monthsDiff = (d.getFullYear() - anchor.getFullYear()) * 12 + (d.getMonth() - anchor.getMonth());
  return monthsDiff >= 0 && monthsDiff % spec.step === 0;
}

/** Next due date on or after `fromDate` (defaults to today). */
export function nextBillDueDate(bill, fromDate) {
  if (!bill.dueDay && !bill.startDate) return null;
  let from = atMidnight(fromDate || todayInTz());
  if (bill.startDate) {
    const start = parseBillYmd(bill.startDate);
    if (start && from < start) from = start;
  }
  let d = from;
  for (let i = 0; i <= MAX_LOOKAHEAD; i++) {
    if (billDueOn(bill, d)) return d;
    d = new Date(d.getTime() + DAY);
  }
  return null;
}

export function daysUntilBillDue(bill) {
  const next = nextBillDueDate(bill);
  if (!next) return 9999;
  return Math.round((next - todayInTz()) / DAY);
}

/** True if the bill has at least one due date in [bounds.start, bounds.end). */
export function billDueInPeriod(bill, bounds) {
  if (!bounds?.start || !bounds?.end) return billDueOn(bill, todayInTz());
  let d = atMidnight(bounds.start);
  const end = atMidnight(bounds.end);
  while (d < end) {
    if (billDueOn(bill, d)) return true;
    d = new Date(d.getTime() + DAY);
  }
  return false;
}

/** Latest due date in the period that is on or before `asOf` (for autopay). */
export function billDueOnOrBeforeInPeriod(bill, bounds, asOf) {
  asOf = atMidnight(asOf || todayInTz());
  if (!bounds?.start || !bounds?.end) return null;
  let d = atMidnight(bounds.start);
  const end = atMidnight(bounds.end);
  let last = null;
  while (d < end) {
    if (billDueOn(bill, d) && d <= asOf) last = d;
    d = new Date(d.getTime() + DAY);
  }
  return last;
}
