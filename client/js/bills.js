/* ═══════════════════════════════════════════════════════════
   bills.js — mounts the Svelte BillsList component into the
   Bills tab. The component reads the `bills` $state proxy from
   storage.svelte.js directly, so any mutation anywhere in the
   app re-renders the list automatically.
═══════════════════════════════════════════════════════════ */

import { mount } from 'svelte';
import BillsList from '../svelte/BillsList.svelte';
import { setRenderer } from './utils.js';

let instance = null;

export function renderBills() {
  const target = document.getElementById('bills-mount');
  if (!target || instance) return;
  instance = mount(BillsList, { target });
}

setRenderer('bills', renderBills);
