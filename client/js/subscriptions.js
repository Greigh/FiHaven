/* ═══════════════════════════════════════════════════════════
   subscriptions.js — mounts the Svelte SubscriptionsPanel into
   the Subscriptions tab. The component reads the `bills` +
   `transactions` $state proxies directly, so it re-renders
   automatically.
═══════════════════════════════════════════════════════════ */

import { mount } from 'svelte';
import SubscriptionsPanel from '../svelte/SubscriptionsPanel.svelte';
import { setRenderer } from './utils.js';

let instance = null;

export function renderSubscriptions() {
  const target = document.getElementById('subscriptions-mount');
  if (!target || instance) return;
  // The Subscriptions tab already has a page title, so hide the panel's
  // redundant "Subscriptions" kicker here (the dashboard widget keeps it).
  instance = mount(SubscriptionsPanel, { target, props: { kicker: false } });
}

setRenderer('subscriptions', renderSubscriptions);
