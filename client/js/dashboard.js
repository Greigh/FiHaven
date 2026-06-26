/* ═══════════════════════════════════════════════════════════
   dashboard.js — mounts the Svelte DashboardView component
   into the Dashboard tab.
═══════════════════════════════════════════════════════════ */

import { mount } from 'svelte';
import DashboardView from '../svelte/DashboardView.svelte';
import { setRenderer } from './utils.js';
import { initHouseholdShared } from './householdShared.js';

let instance = null;

export function renderDashboard() {
  const target = document.getElementById('dashboard-mount');
  if (!target || instance) return;
  instance = mount(DashboardView, { target });
  // Live "Shared with your household" card (no-op when not in a household).
  initHouseholdShared();
}

setRenderer('dashboard', renderDashboard);
