/* ═══════════════════════════════════════════════════════════
   calendar.js — mounts the Svelte CalendarView component into
   the Calendar tab. Reads the same $state proxies as the rest
   of the app, so chips update live as bills/cards/payments
   change.
═══════════════════════════════════════════════════════════ */

import { mount } from 'svelte';
import CalendarView from '../svelte/CalendarView.svelte';
import { setRenderer } from './utils.js';

let instance = null;

export function renderCalendar() {
  const target = document.getElementById('calendar-mount');
  if (!target || instance) return;
  instance = mount(CalendarView, { target });
}

setRenderer('calendar', renderCalendar);
