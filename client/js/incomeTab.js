/* ═══════════════════════════════════════════════════════════
   incomeTab.js — mounts the Svelte IncomeView component into
   the Income tab. Named apart from income.js, which holds the
   frequency table and the shared monthly-total helpers.
═══════════════════════════════════════════════════════════ */

import { mount } from 'svelte';
import IncomeView from '../svelte/IncomeView.svelte';
import { setRenderer } from './utils.js';

let instance = null;

export function renderIncome() {
  const target = document.getElementById('income-mount');
  if (!target || instance) return;
  instance = mount(IncomeView, { target });
}

setRenderer('income', renderIncome);
