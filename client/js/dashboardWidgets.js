/* ═══════════════════════════════════════════════════════════
   dashboardWidgets.js — the dashboard widget catalog + helpers,
   shared by DashboardView (rendering) and settings (the editor).

   "classic" renders the fixed dashboard; "widgets" renders only
   the enabled widgets, in the user's order. Stored in
   settings.dashboardLayout + settings.dashboardWidgets.
═══════════════════════════════════════════════════════════ */

export const DASHBOARD_WIDGETS = [
  { id: 'stats',         label: 'Overview tiles' },
  { id: 'cashflow',      label: "This period's payments" },
  { id: 'alerts',        label: 'Alerts' },
  { id: 'upcoming',      label: 'Upcoming payments' },
  { id: 'networth',      label: 'Net worth' },
  { id: 'spending',      label: 'Spending' },
  { id: 'goals',         label: 'Savings goals' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'incomeHistory', label: 'Income history' },
];

// What "Widgets" mode shows by default — the same blocks as Classic.
export const DEFAULT_DASHBOARD_WIDGETS = ['stats', 'cashflow', 'alerts', 'upcoming'];

const VALID = new Set(DASHBOARD_WIDGETS.map((w) => w.id));
export function widgetLabel(id) {
  const w = DASHBOARD_WIDGETS.find((x) => x.id === id);
  return w ? w.label : id;
}

export function dashboardLayout(settings) {
  return settings && settings.dashboardLayout === 'widgets' ? 'widgets' : 'classic';
}

// The ordered, de-duped list of enabled widget ids (falls back to default).
export function enabledWidgets(settings) {
  const arr = settings && Array.isArray(settings.dashboardWidgets) ? settings.dashboardWidgets : null;
  const src = arr && arr.length ? arr : DEFAULT_DASHBOARD_WIDGETS;
  const seen = new Set();
  return src.filter((id) => VALID.has(id) && !seen.has(id) && seen.add(id));
}
