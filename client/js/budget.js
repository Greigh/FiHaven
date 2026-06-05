/* ═══════════════════════════════════════════════════════════
   budget.js — mounts the Svelte BudgetView component into the
   Monthly Budget tab. Also keeps a module-level monthOffset
   that the component reads/writes, so export.js can include
   the right month in CSV exports.
═══════════════════════════════════════════════════════════ */

import { mount } from 'svelte';
import BudgetView from '../svelte/BudgetView.svelte';
import { setRenderer } from './utils.js';

let budgetMonthOffset = 0;

export function getBudgetMonthOffset() { return budgetMonthOffset; }
export function setBudgetMonthOffset(v) { budgetMonthOffset = v; }

let instance = null;

export function renderBudget() {
  const target = document.getElementById('budget-mount');
  if (!target || instance) return;
  instance = mount(BudgetView, { target });
}

setRenderer('budget', renderBudget);
