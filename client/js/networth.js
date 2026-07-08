/* ═══════════════════════════════════════════════════════════
   networth.js — mounts the Svelte NetWorthPanel into the Net
   Worth tab. The component reads the `accounts` + `cards`
   $state proxies directly, so it re-renders automatically.
═══════════════════════════════════════════════════════════ */

import { mount } from 'svelte';
import NetWorthPanel from '../svelte/NetWorthPanel.svelte';
import { setRenderer } from './utils.js';

let instance = null;

export function renderNetworth() {
  const target = document.getElementById('networth-mount');
  if (!target || instance) return;
  instance = mount(NetWorthPanel, { target });
}

setRenderer('networth', renderNetworth);
