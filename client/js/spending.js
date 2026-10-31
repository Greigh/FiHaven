/* ═══════════════════════════════════════════════════════════
   spending.js — mounts SpendingPanel into the Spending tab.
═══════════════════════════════════════════════════════════ */

import { mount } from 'svelte';
import SpendingPanel from '../svelte/SpendingPanel.svelte';
import { setRenderer } from './utils.js';

let instance;

export function renderSpending() {
  const target = document.getElementById('spending-mount');
  if (!target || instance) return;
  instance = mount(SpendingPanel, { target });
}

setRenderer('spending', renderSpending);
