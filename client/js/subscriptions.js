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
  instance = mount(SubscriptionsPanel, { target });
}

setRenderer('subscriptions', renderSubscriptions);
