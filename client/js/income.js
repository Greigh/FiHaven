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

// Resolve the user's monthly income from the settings object.
// Honors the multi-source `settings.incomes` array; falls back
// to the legacy single `settings.income` field for older data.
export function monthlyIncomeFromSettings(settings) {
  if (!settings) return 0;
  if (Array.isArray(settings.incomes) && settings.incomes.length) {
    return settings.incomes.reduce((s, src) => s + monthlyOfSource(src), 0);
  }
  return parseFloat(settings.income) || 0;
}
