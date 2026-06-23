/* ═══════════════════════════════════════════════════════════
   income.js — frequency table + helpers for income sources.
   Shared between BudgetView (the editor) and the dashboard
   runway number so both compute monthly totals the same way.
═══════════════════════════════════════════════════════════ */

export const FREQUENCIES = [
  { key: 'hourly',      label: 'Hourly',       perMonth: 52 / 12 }, // ×hoursPerWeek
  { key: 'weekly',      label: 'Weekly',       perMonth: 52 / 12 },
  { key: 'biweekly',    label: 'Bi-weekly',    perMonth: 26 / 12 },
  { key: 'semimonthly', label: 'Semi-monthly', perMonth: 2 },
  { key: 'monthly',     label: 'Monthly',      perMonth: 1 },
  { key: 'annual',      label: 'Annual',       perMonth: 1 / 12 },
];

export const FREQ_MAP = Object.fromEntries(FREQUENCIES.map((f) => [f.key, f]));

// Weeks per month — converts an hourly rate (× hours/week) to a monthly figure.
export const WEEKS_PER_MONTH = 52 / 12;

export function perMonthFor(frequency) {
  return (FREQ_MAP[frequency] || FREQ_MAP.monthly).perMonth;
}

// Monthly equivalent of a recurring source. Hourly multiplies rate (amount) ×
// hoursPerWeek × weeks-per-month; every other frequency multiplies the amount
// by its per-month count.
export function monthlyOfSource(src) {
  const amount = parseFloat(src.amount) || 0;
  if (src.frequency === 'hourly') {
    return amount * (parseFloat(src.hoursPerWeek) || 0) * WEEKS_PER_MONTH;
  }
  return amount * perMonthFor(src.frequency);
}

// Resolve the user's *base* monthly income from the settings object
// (recurring sources only). Honors the multi-source `settings.incomes`
// array; falls back to the legacy single `settings.income` field.
export function monthlyIncomeFromSettings(settings) {
  if (!settings) return 0;
  if (Array.isArray(settings.incomes) && settings.incomes.length) {
    return settings.incomes.reduce((s, src) => s + monthlyOfSource(src), 0);
  }
  return parseFloat(settings.income) || 0;
}

/* ── Per-period income adjustments ───────────────────────────
   A one-off or recurring change to a single period's income:
   a bonus (+), unpaid time off (−), a raise (recurring +). Stored
   in `settings.incomeAdjustments` as signed amounts. */
export function normalizeAdjustment(a) {
  a = a || {};
  return {
    id: a.id || ('adj-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    label: a.label || '',
    amount: parseFloat(a.amount) || 0,         // signed: + adds, − subtracts
    kind: a.kind === 'recurring' ? 'recurring' : 'once',
    monthKey: a.monthKey || '',                // 'once' → the single month it applies
    startMonth: a.startMonth || '',            // 'recurring' → first month (inclusive)
    endMonth: a.endMonth || '',                // 'recurring' → last month ('' = ongoing)
  };
}

// True if adjustment `a` affects the period `mk` ("YYYY-MM").
export function adjustmentAppliesTo(a, mk) {
  if (!a || !mk) return false;
  if (a.kind === 'recurring') {
    if (a.startMonth && mk < a.startMonth) return false;
    if (a.endMonth && mk > a.endMonth) return false;
    return true;
  }
  return a.monthKey === mk;
}

export function adjustmentsForMonth(settings, mk) {
  const list = settings && Array.isArray(settings.incomeAdjustments) ? settings.incomeAdjustments : [];
  return list.filter((a) => adjustmentAppliesTo(a, mk));
}

export function adjustmentsTotalForMonth(settings, mk) {
  return adjustmentsForMonth(settings, mk).reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
}

// Effective income for a specific period: base recurring income plus any
// adjustments that apply to that month.
export function monthlyIncomeForMonth(settings, mk) {
  return monthlyIncomeFromSettings(settings) + adjustmentsTotalForMonth(settings, mk);
}

/* ── Period-aware income (calendar / startDay / rolling) ───────
   Calendar months use the full monthly total. Other period modes
   prorate base income by period length and weight one-off /
   recurring adjustments by how much of each calendar month falls
   inside the active period. */

export const AVG_MONTH_DAYS = 365 / 12;

export function periodDays(bounds) {
  if (!bounds || !bounds.start || !bounds.end) return AVG_MONTH_DAYS;
  return Math.round((bounds.end - bounds.start) / 864e5);
}

// Each calendar month overlapping [bounds.start, bounds.end) with the
// fraction of that month covered (0–1).
export function monthOverlaps(bounds) {
  if (!bounds || !bounds.start || !bounds.end) return [];
  const out = [];
  let cursor = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), 1);
  while (cursor < bounds.end) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const overlapStart = bounds.start > monthStart ? bounds.start : monthStart;
    const overlapEnd = bounds.end < monthEnd ? bounds.end : monthEnd;
    const overlapDays = (overlapEnd - overlapStart) / 864e5;
    const monthDays = (monthEnd - monthStart) / 864e5;
    if (overlapDays > 0 && monthDays > 0) {
      const mk = cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0');
      out.push({ mk, fraction: overlapDays / monthDays });
    }
    cursor = monthEnd;
  }
  return out;
}

export function adjustmentsTotalForPeriod(settings, bounds) {
  if (!bounds) return 0;
  if (bounds.mode === 'calendar') return adjustmentsTotalForMonth(settings, bounds.key);
  return monthOverlaps(bounds).reduce(
    (s, { mk, fraction }) => s + adjustmentsTotalForMonth(settings, mk) * fraction,
    0
  );
}

// Effective income for the active budgeting period.
export function periodIncome(settings, bounds) {
  const base = monthlyIncomeFromSettings(settings);
  if (!bounds) return base;
  if (bounds.mode === 'calendar') {
    return base + adjustmentsTotalForMonth(settings, bounds.key);
  }
  const days = periodDays(bounds);
  const prorate = days / AVG_MONTH_DAYS;
  return base * prorate + adjustmentsTotalForPeriod(settings, bounds);
}

export function incomeLabelFor(cfg) {
  return cfg && cfg.mode !== 'calendar' ? 'Period income' : 'Monthly income';
}

export function owedLabelFor(cfg) {
  return cfg && cfg.mode !== 'calendar' ? 'Still owed this period' : 'Still owed this month';
}
