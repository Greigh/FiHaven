/* ═══════════════════════════════════════════════════════════
   balancesTab.js — mounts the Svelte BalancesView component into
   the Balances tab ("Account Balances" in the More menu).
═══════════════════════════════════════════════════════════ */

import { mount } from 'svelte';
import BalancesView from '../svelte/BalancesView.svelte';
import { setRenderer } from './utils.js';

let instance = null;

export function renderBalances() {
  const target = document.getElementById('balances-mount');
  if (!target || instance) return;
  instance = mount(BalancesView, { target });
}

setRenderer('balances', renderBalances);
