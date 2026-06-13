/* ═══════════════════════════════════════════════════════════
   loans.js — mounts CardsList.svelte (kind="loan") into the
   Loans tab. Cards and loans share the same component + editor
   but live in separate tabs; the component filters the shared
   `cards` $state proxy down to loans.
═══════════════════════════════════════════════════════════ */

import { mount } from 'svelte';
import CardsList from '../svelte/CardsList.svelte';
import { setRenderer } from './utils.js';

let instance = null;

export function renderLoans() {
  const target = document.getElementById('loans-mount');
  if (!target || instance) return;
  instance = mount(CardsList, { target, props: { kind: 'loan' } });
}

setRenderer('loans', renderLoans);
