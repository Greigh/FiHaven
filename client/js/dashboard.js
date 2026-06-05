/* ═══════════════════════════════════════════════════════════
   dashboard.js — mounts the Svelte DashboardView component
   into the Dashboard tab.
═══════════════════════════════════════════════════════════ */

import { mount } from 'svelte';
import DashboardView from '../svelte/DashboardView.svelte';
import { setRenderer } from './utils.js';

let instance = null;

export function renderDashboard() {
  const target = document.getElementById('dashboard-mount');
  if (!target || instance) return;
  instance = mount(DashboardView, { target });
}

setRenderer('dashboard', renderDashboard);
