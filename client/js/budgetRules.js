/* ═══════════════════════════════════════════════════════════
   budgetRules.js — optional budget lenses on the Budget tab.
   Modes: split presets, obligations-first, debt-focus, envelope (Pro).
═══════════════════════════════════════════════════════════ */

import { monthsUntil } from './utils.js';

export const BUDGET_BUCKETS = ['needs', 'wants', 'save'];

export const DEFAULT_SPLITS = { needs: 50, wants: 30, save: 20 };

/** Named split presets (percent of income). */
export const PRESET_SPLITS = {
  '50-30-20': { needs: 50, wants: 30, save: 20 },
  '80-20': { needs: 80, wants: 0, save: 20 },
  '60-20-20': { needs: 60, wants: 20, save: 20 },
  '70-20-10': { needs: 70, wants: 20, save: 10 },
};

export const SPLIT_MODES = Object.keys(PRESET_SPLITS).concat(['custom']);

export const LENS_TITLES = {
  off: 'Off',
  '50-30-20': '50 / 30 / 20',
  '80-20': '80 / 20',
  '60-20-20': '60 / 20 / 20',
  '70-20-10': '70 / 20 / 10',
  custom: 'Custom split',
  'obligations-first': 'Obligations first',
  'debt-focus': 'Debt focus',
  envelope: 'Envelope lite',
};

export const HOUSING_RATIO_LIMIT = 30;
export const DEBT_RATIO_LIMIT = 36;

/** Bill category → bucket. Credit-card mins are always needs. */
export const BILL_BUCKET = {
  Housing: 'needs',
  Utilities: 'needs',
  Insurance: 'needs',
  Loan: 'needs',
  Auto: 'needs',
  Subscriptions: 'wants',
  Investment: 'save',
  Other: 'needs',
};

/** Spending category → bucket (matches SPENDING_CATEGORIES in cores). */
export const SPENDING_BUCKET = {
  Groceries: 'needs',
  Dining: 'wants',
  Shopping: 'wants',
  Transport: 'needs',
  Entertainment: 'wants',
  Health: 'needs',
  Bills: 'needs',
  Other: 'wants',
};

const DEBT_BILL_CATEGORIES = new Set(['Loan', 'Auto']);

export function budgetRuleMode(settings) {
  const r = settings && settings.budgetRule;
  if (r === '50-30-20' || r === '503020') return '50-30-20';
  if (r && PRESET_SPLITS[r]) return r;
  if (r === 'custom') return 'custom';
  if (r === 'obligations-first' || r === 'obligations') return 'obligations-first';
  if (r === 'debt-focus' || r === 'debt') return 'debt-focus';
  if (r === 'envelope') return 'envelope';
  return 'off';
}

export function budgetRuleEnabled(settings) {
  return budgetRuleMode(settings) !== 'off';
}

export function isSplitMode(mode) {
  return SPLIT_MODES.includes(mode);
}

export function budgetLensTitle(mode) {
  return LENS_TITLES[mode] || mode;
}

/** Percentages that sum to ~100 for split modes; null otherwise. */
export function budgetRuleSplits(settings) {
  const mode = budgetRuleMode(settings);
  if (PRESET_SPLITS[mode]) return { ...PRESET_SPLITS[mode] };
  if (mode !== 'custom') return null;
  const raw = (settings && settings.budgetRuleSplits) || DEFAULT_SPLITS;
  let needs = Math.max(0, Number(raw.needs) || 0);
  let wants = Math.max(0, Number(raw.wants) || 0);
  let save = Math.max(0, Number(raw.save) || 0);
  const sum = needs + wants + save;
  if (sum <= 0) return { ...DEFAULT_SPLITS };
  return {
    needs: Math.round((needs / sum) * 100),
    wants: Math.round((wants / sum) * 100),
    save: Math.round((save / sum) * 100),
  };
}

export const BILL_CATEGORIES = Object.keys(BILL_BUCKET);
export const SPENDING_CATEGORIES = Object.keys(SPENDING_BUCKET);

function bucketOverrides(settings) {
  const raw = settings && settings.budgetBucketOverrides;
  if (!raw || typeof raw !== 'object') return { bills: {}, spending: {} };
  return {
    bills: (raw.bills && typeof raw.bills === 'object') ? raw.bills : {},
    spending: (raw.spending && typeof raw.spending === 'object') ? raw.spending : {},
  };
}

export function billBucket(category, settings) {
  const o = bucketOverrides(settings).bills[category];
  if (o && BUDGET_BUCKETS.includes(o)) return o;
  return BILL_BUCKET[category] || 'needs';
}

export function spendingBucket(category, settings) {
  const o = bucketOverrides(settings).spending[category];
  if (o && BUDGET_BUCKETS.includes(o)) return o;
  return SPENDING_BUCKET[category] || 'wants';
}

export function suggestedGoalMonthly(g) {
  const remaining = Math.max(0, (parseFloat(g.target) || 0) - (parseFloat(g.saved) || 0));
  if (!g.targetDate || remaining <= 0) return 0;
  const m = Math.max(1, monthsUntil(g.targetDate));
  return remaining / m;
}

function ymdLocal(d) {
  if (!(d instanceof Date)) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function transactionInPeriod(t, periodBounds) {
  const date = (t && t.date) || '';
  if (!date || !periodBounds || !periodBounds.start || !periodBounds.end) return false;
  const start = ymdLocal(periodBounds.start);
  const end = ymdLocal(periodBounds.end);
  return date >= start && date < end;
}

function billAmt(b, goalAmountFor, mk) {
  return goalAmountFor
    ? goalAmountFor('bill', String(b.id), mk)
    : (parseFloat(b.amount) || 0);
}

function cardAmt(c, goalAmountFor, mk) {
  return goalAmountFor
    ? goalAmountFor('card', String(c.id), mk)
    : (parseFloat(c.minPayment) || 0);
}

export function obligationsTotal({
  bills = [],
  cards = [],
  periodBounds,
  billDueInPeriod,
  goalAmountFor,
  mk,
}) {
  let total = 0;
  bills.filter((b) => (billDueInPeriod ? billDueInPeriod(b, periodBounds) : true)).forEach((b) => {
    total += billAmt(b, goalAmountFor, mk);
  });
  cards.filter((c) => !c.archived).forEach((c) => { total += cardAmt(c, goalAmountFor, mk); });
  return total;
}

export function housingMonthly({
  bills = [],
  periodBounds,
  billDueInPeriod,
  goalAmountFor,
  mk,
}) {
  return bills
    .filter((b) => b.category === 'Housing')
    .filter((b) => (billDueInPeriod ? billDueInPeriod(b, periodBounds) : true))
    .reduce((s, b) => s + billAmt(b, goalAmountFor, mk), 0);
}

export function debtPaymentsMonthly({
  bills = [],
  cards = [],
  periodBounds,
  billDueInPeriod,
  goalAmountFor,
  mk,
}) {
  let total = cards.filter((c) => !c.archived).reduce((s, c) => s + cardAmt(c, goalAmountFor, mk), 0);
  bills
    .filter((b) => DEBT_BILL_CATEGORIES.has(b.category))
    .filter((b) => (billDueInPeriod ? billDueInPeriod(b, periodBounds) : true))
    .forEach((b) => { total += billAmt(b, goalAmountFor, mk); });
  return total;
}

export function goalsMonthlyTotal(goals = []) {
  return (goals || []).reduce((s, g) => s + suggestedGoalMonthly(g), 0);
}

export function categoryBudgetsTotal(settings) {
  const budgets = (settings && settings.categoryBudgets) || {};
  return Object.values(budgets).reduce((s, v) => s + (parseFloat(v) || 0), 0);
}

export function envelopeAssignments(settings, goals = []) {
  const raw = (settings && settings.envelopeAssign) || {};
  const goalMap = { ...(raw.goals || {}) };
  const catMap = { ...(raw.categories || {}) };
  const rollover = (settings && settings.envelopeRolloverBal) || {};
  const rolloverCats = rollover.categories || {};

  (goals || []).forEach((g) => {
    const id = String(g.id);
    if (goalMap[id] == null) {
      const sug = suggestedGoalMonthly(g);
      if (sug > 0) goalMap[id] = sug;
    }
  });

  const budgets = (settings && settings.categoryBudgets) || {};
  Object.keys(budgets).forEach((cat) => {
    if (catMap[cat] == null) catMap[cat] = parseFloat(budgets[cat]) || 0;
  });

  if (settings && settings.envelopeRollover) {
    Object.keys(rolloverCats).forEach((cat) => {
      const extra = parseFloat(rolloverCats[cat]) || 0;
      if (extra > 0) catMap[cat] = (parseFloat(catMap[cat]) || 0) + extra;
    });
  }

  const goalsTotal = Object.values(goalMap).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const catsTotal = Object.values(catMap).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  return { goalMap, catMap, goalsTotal, catsTotal, total: goalsTotal + catsTotal };
}

/** Apply unused category budget from prev period into envelopeRolloverBal. */
export function applyEnvelopeRollover(settings, transactions, prevBounds) {
  if (!settings || !settings.envelopeRollover || !prevBounds) return settings;
  const mk = prevBounds.key || prevBounds.start;
  const appliedFor = settings.envelopeRolloverAppliedFor;
  if (appliedFor === mk) return settings;

  const spent = spentByCategory(transactions, prevBounds);
  const budgets = settings.categoryBudgets || {};
  const assign = (settings.envelopeAssign && settings.envelopeAssign.categories) || {};
  const nextBal = { categories: { ...((settings.envelopeRolloverBal || {}).categories || {}) } };

  Object.keys(budgets).forEach((cat) => {
    const budget = parseFloat(assign[cat] != null ? assign[cat] : budgets[cat]) || 0;
    const unused = Math.max(0, budget - (spent[cat] || 0));
    if (unused > 0.005) nextBal.categories[cat] = (parseFloat(nextBal.categories[cat]) || 0) + unused;
  });

  return {
    ...settings,
    envelopeRolloverBal: nextBal,
    envelopeRolloverAppliedFor: mk,
  };
}

function spentByCategory(transactions, periodBounds) {
  const m = {};
  (transactions || []).forEach((t) => {
    if (!transactionInPeriod(t, periodBounds)) return;
    const cat = t.category || 'Other';
    m[cat] = (m[cat] || 0) + (parseFloat(t.amount) || 0);
  });
  return m;
}

/** Housing / debt ratio warnings — shown on any active lens. */
export function computeRatioWarnings({
  income,
  bills = [],
  cards = [],
  periodBounds,
  billDueInPeriod,
  goalAmountFor,
  mk,
}) {
  if (!(income > 0)) return [];
  const base = { bills, cards, periodBounds, billDueInPeriod, goalAmountFor, mk };
  const housing = housingMonthly(base);
  const debt = debtPaymentsMonthly(base);
  const housingPct = (housing / income) * 100;
  const debtPct = (debt / income) * 100;
  const out = [];
  if (housing > 0) {
    out.push({
      key: 'housing',
      label: 'Housing',
      amount: housing,
      pct: Math.round(housingPct * 10) / 10,
      limit: HOUSING_RATIO_LIMIT,
      over: housingPct > HOUSING_RATIO_LIMIT + 0.05,
    });
  }
  if (debt > 0) {
    out.push({
      key: 'debt',
      label: 'Debt payments',
      amount: debt,
      pct: Math.round(debtPct * 10) / 10,
      limit: DEBT_RATIO_LIMIT,
      over: debtPct > DEBT_RATIO_LIMIT + 0.05,
    });
  }
  return out;
}

function rowStatus(actual, target, { higherIsBetter = false } = {}) {
  if (higherIsBetter) return actual >= target - 0.005 ? 'ok' : 'under';
  return actual <= target + 0.005 ? 'ok' : 'over';
}

function computeSplitLens(mode, ctx) {
  const { settings, income } = ctx;
  const splits = budgetRuleSplits(settings);
  if (!splits) return null;

  const targets = {
    needs: (income * splits.needs) / 100,
    wants: (income * splits.wants) / 100,
    save: (income * splits.save) / 100,
  };

  const actual = { needs: 0, wants: 0, save: 0 };
  ctx.bills.filter((b) => (ctx.billDueInPeriod ? ctx.billDueInPeriod(b, ctx.periodBounds) : true)).forEach((b) => {
    actual[billBucket(b.category, settings)] += billAmt(b, ctx.goalAmountFor, ctx.mk);
  });
  ctx.cards.filter((c) => !c.archived).forEach((c) => { actual.needs += cardAmt(c, ctx.goalAmountFor, ctx.mk); });
  (ctx.transactions || []).forEach((t) => {
    if (!transactionInPeriod(t, ctx.periodBounds)) return;
    actual[spendingBucket(t.category, settings)] += Math.abs(parseFloat(t.amount) || 0);
  });
  actual.save = Math.max(0, income - actual.needs - actual.wants);

  const rows = BUDGET_BUCKETS.map((key) => {
    const target = targets[key];
    const act = actual[key];
    const isSave = key === 'save';
    return {
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      pct: splits[key],
      target,
      actual: act,
      delta: act - target,
      status: rowStatus(act, target, { higherIsBetter: isSave }),
    };
  });

  return {
    mode,
    title: budgetLensTitle(mode),
    subtitle: 'Needs, wants, and save targets from income — compared to bills, minimums, and spending.',
    headline: null,
    rows,
    warnings: computeRatioWarnings(ctx),
    proLocked: false,
  };
}

function computeObligationsFirst(ctx) {
  const { income, settings, goals } = ctx;
  const obligations = obligationsTotal(ctx);
  const goalMonthly = goalsMonthlyTotal(goals);
  const safe = income - obligations - goalMonthly;

  const rows = [
    {
      key: 'income',
      label: 'Income',
      actual: income,
      status: 'ok',
    },
    {
      key: 'obligations',
      label: 'Bills + minimums',
      actual: obligations,
      status: 'ok',
    },
    {
      key: 'goals',
      label: 'Goal contributions',
      actual: goalMonthly,
      status: goalMonthly > 0 ? 'ok' : 'ok',
      hint: goalMonthly > 0 ? 'Suggested monthly from your savings goals' : 'Add target dates on goals to plan contributions',
    },
  ];

  return {
    mode: 'obligations-first',
    title: budgetLensTitle('obligations-first'),
    subtitle: 'What is left after fixed obligations and planned savings.',
    headline: {
      label: 'Safe to spend',
      amount: safe,
      status: safe >= 0 ? 'ok' : 'over',
    },
    rows,
    warnings: computeRatioWarnings(ctx),
    proLocked: false,
  };
}

function computeDebtFocus(ctx) {
  const { income, settings } = ctx;
  const mins = debtPaymentsMonthly(ctx);
  const extra = Math.max(0, parseFloat(settings.debtFocusExtra) || 0);
  const committed = mins + extra;
  const flex = income - committed;

  const rows = [
    { key: 'minimums', label: 'Debt minimums', actual: mins, target: mins, status: 'ok' },
    {
      key: 'extra',
      label: 'Extra debt payment',
      actual: extra,
      target: extra,
      status: 'ok',
      hint: 'Set in Settings → Budget rule (Debt focus)',
    },
    {
      key: 'flex',
      label: 'Flexible spending',
      actual: flex,
      target: Math.max(0, flex),
      status: flex >= 0 ? 'ok' : 'over',
    },
  ];

  return {
    mode: 'debt-focus',
    title: budgetLensTitle('debt-focus'),
    subtitle: 'Minimums plus your planned extra payment — tied to the Payoff planner mindset.',
    headline: {
      label: 'After debt plan',
      amount: flex,
      status: flex >= 0 ? 'ok' : 'over',
    },
    rows,
    warnings: computeRatioWarnings(ctx),
    proLocked: false,
  };
}

function computeEnvelope(ctx) {
  const { income, settings, goals, isPro } = ctx;
  if (!isPro) {
    return {
      mode: 'envelope',
      title: budgetLensTitle('envelope'),
      subtitle: 'Assign every dollar — goals plus category budgets.',
      headline: null,
      rows: [],
      warnings: [],
      proLocked: true,
    };
  }

  const obligations = obligationsTotal(ctx);
  const env = envelopeAssignments(settings, goals);
  const unassigned = income - obligations - env.total;

  const rows = [
    { key: 'obligations', label: 'Fixed obligations', actual: obligations, status: 'ok' },
    { key: 'goals', label: 'Assigned to goals', actual: env.goalsTotal, status: 'ok' },
    { key: 'categories', label: 'Assigned to categories', actual: env.catsTotal, status: 'ok' },
    {
      key: 'unassigned',
      label: 'Left to assign',
      actual: unassigned,
      status: Math.abs(unassigned) < 0.01 ? 'ok' : (unassigned > 0 ? 'under' : 'over'),
      hint: unassigned > 0 ? 'Assign to goals or category budgets' : 'Over-assigned — reduce envelopes',
    },
  ];

  return {
    mode: 'envelope',
    title: budgetLensTitle('envelope'),
    subtitle: 'Zero-based lite: goals + category budgets should use your income after obligations.',
    headline: {
      label: 'Unassigned',
      amount: unassigned,
      status: Math.abs(unassigned) < 0.01 ? 'ok' : (unassigned > 0 ? 'under' : 'over'),
    },
    rows,
    warnings: computeRatioWarnings(ctx),
    proLocked: false,
    envelope: env,
  };
}

/**
 * Compute the active budget lens summary.
 * Returns null when the rule is off or income ≤ 0 (except envelope pro lock).
 */
export function computeBudgetLens(ctx) {
  const settings = ctx.settings || {};
  const mode = budgetRuleMode(settings);
  if (mode === 'off') return null;

  const income = parseFloat(ctx.income) || 0;
  if (mode !== 'envelope' && income <= 0) return null;

  const full = {
    ...ctx,
    settings,
    income,
    bills: ctx.bills || [],
    cards: ctx.cards || [],
    transactions: ctx.transactions || [],
    goals: ctx.goals || [],
    isPro: !!ctx.isPro,
  };

  if (mode === 'obligations-first') return computeObligationsFirst(full);
  if (mode === 'debt-focus') return computeDebtFocus(full);
  if (mode === 'envelope') return computeEnvelope(full);
  if (isSplitMode(mode)) return computeSplitLens(mode, full);
  return null;
}

/** @deprecated use computeBudgetLens */
export function computeBudgetRuleSummary(ctx) {
  const lens = computeBudgetLens(ctx);
  if (!lens || lens.proLocked) return lens;
  if (!isSplitMode(lens.mode)) return lens;
  return {
    mode: lens.mode,
    splits: budgetRuleSplits(ctx.settings),
    targets: {
      needs: lens.rows.find((r) => r.key === 'needs')?.target,
      wants: lens.rows.find((r) => r.key === 'wants')?.target,
      save: lens.rows.find((r) => r.key === 'save')?.target,
    },
    actual: {
      needs: lens.rows.find((r) => r.key === 'needs')?.actual,
      wants: lens.rows.find((r) => r.key === 'wants')?.actual,
      save: lens.rows.find((r) => r.key === 'save')?.actual,
    },
    rows: lens.rows,
    warnings: lens.warnings,
  };
}
