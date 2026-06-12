/* ═══════════════════════════════════════════════════════════
   income.js — frequency table + helpers for income sources.
   Shared between BudgetView (the editor) and the dashboard
   runway number so both compute monthly totals the same way.
═══════════════════════════════════════════════════════════ */

export const FREQUENCIES = [
  { key: 'weekly',      label: 'Weekly',       perMonth: 52 / 12 },
  { key: 'biweekly',    label: 'Bi-weekly',    perMonth: 26 / 12 },
  { key: 'semimonthly', label: 'Semi-monthly', perMonth: 2 },
  { key: 'monthly',     label: 'Monthly',      perMonth: 1 },
  { key: 'annual',      label: 'Annual',       perMonth: 1 / 12 },
];

export const FREQ_MAP = Object.fromEntries(FREQUENCIES.map((f) => [f.key, f]));

export function perMonthFor(frequency) {
  return (FREQ_MAP[frequency] || FREQ_MAP.monthly).perMonth;
}

export function monthlyOfSource(src) {
  return (parseFloat(src.amount) || 0) * perMonthFor(src.frequency);
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
