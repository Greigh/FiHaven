/* ═══════════════════════════════════════════════════════════
   cards.js — mounts the Svelte CardsList component into the
   Credit Cards tab. The component reads the `cards` $state
   proxy directly, so mutations re-render automatically.
═══════════════════════════════════════════════════════════ */

import { mount } from 'svelte';
import CardsList from '../svelte/CardsList.svelte';
import { setRenderer } from './utils.js';

let instance = null;

export function renderCards() {
  const target = document.getElementById('cards-mount');
  if (!target || instance) return;
  instance = mount(CardsList, { target });
}

setRenderer('cards', renderCards);
