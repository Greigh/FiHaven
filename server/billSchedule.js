'use strict';

/** When a bill is actually due, honoring its frequency label. Cards stay monthly-on-dueDay. */

const MAX_LOOKAHEAD = 400;
const DAY = 864e5;

function atMidnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseBillYmd(s) {
  if (!s) return null;
  const parts = s.split('-').map(Number);
  if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  return atMidnight(new Date(parts[0], parts[1] - 1, parts[2]));
}

function billFrequencySpec(frequency) {
  switch (frequency) {
    case 'Weekly': return { unit: 'day', step: 7 };
    case 'Bi-weekly': return { unit: 'day', step: 14 };
    case 'Quarterly': return { unit: 'month', step: 3 };
    case 'Annually': return { unit: 'month', step: 12 };
    default: return { unit: 'month', step: 1 };
  }
}

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function billActiveOn(item, ymdStr) {
  if (!item) return false;
  if (item.startDate && ymdStr < item.startDate) return false;
  if (item.endDate && ymdStr > item.endDate) return false;
  return true;
}

function billAnchor(bill) {
  if (bill.startDate) {
    const p = parseBillYmd(bill.startDate);
    if (p) return p;
  }
  const dd = parseInt(bill.dueDay, 10) || 1;
  const t = new Date();
  return atMidnight(new Date(t.getFullYear(), 0, dd));
}

function billDueOn(bill, date) {
  const dd = parseInt(bill.dueDay, 10);
  if (!dd && !bill.startDate) return false;
  const d = atMidnight(date instanceof Date ? date : parseBillYmd(date) || new Date());
  if (!billActiveOn(bill, ymd(d))) return false;

  const spec = billFrequencySpec(bill.frequency);
  const anchor = billAnchor(bill);

  if (spec.unit === 'day') {
    const days = Math.round((d - anchor) / DAY);
    return days >= 0 && days % spec.step === 0;
  }

  const dueDay = dd || anchor.getDate();
  const dueThisMonth = atMidnight(new Date(d.getFullYear(), d.getMonth(), dueDay));
  if (ymd(dueThisMonth) !== ymd(d)) return false;
  const monthsDiff = (d.getFullYear() - anchor.getFullYear()) * 12 + (d.getMonth() - anchor.getMonth());
  return monthsDiff >= 0 && monthsDiff % spec.step === 0;
}

function nextBillDueDate(bill, fromDate) {
  if (!bill.dueDay && !bill.startDate) return null;
  let from = atMidnight(fromDate || new Date());
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

function daysUntilBillDue(bill, today) {
  const next = nextBillDueDate(bill, today);
  if (!next) return 9999;
  return Math.round((next - atMidnight(today || new Date())) / DAY);
}

function billDueOnOrBeforeInPeriod(bill, bounds, asOf) {
  asOf = atMidnight(asOf || new Date());
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

/** Build period bounds for calendar-month mode from local parts. */
function monthBoundsFromParts(lp) {
  const start = new Date(lp.y, lp.m - 1, 1);
  const end = new Date(lp.y, lp.m, 1);
  return { start, end };
}

module.exports = {
  billDueOn,
  nextBillDueDate,
  daysUntilBillDue,
  billDueOnOrBeforeInPeriod,
  monthBoundsFromParts,
  atMidnight,
  ymd,
};
