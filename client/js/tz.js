/* ═══════════════════════════════════════════════════════════
   tz.js — "what calendar day is it" in the user's preferred
   time zone. Used everywhere the app needs to compare a
   dueDay (day-of-month) against today, so "Due tomorrow" never
   flips based on time-of-day.

   The settings.timezone field is an IANA name (e.g.
   "America/New_York") or empty/"auto" to follow the browser's
   detected zone.
═══════════════════════════════════════════════════════════ */

import { settings } from './storage.svelte.js';

export const BROWSER_TZ =
  (typeof Intl !== 'undefined' &&
    Intl.DateTimeFormat &&
    Intl.DateTimeFormat().resolvedOptions().timeZone) ||
  'UTC';

// The user-configured timezone, falling back to the browser's.
// Reads `settings` directly so Svelte's reactivity picks up
// changes the moment the user saves a different zone.
export function currentTz() {
  var t = settings && settings.timezone;
  if (!t || t === 'auto') return BROWSER_TZ;
  return t;
}

// "Today" as a Date pinned to midnight in the browser's local
// time, on the calendar day that `now` falls on in the chosen
// TZ. The browser-local construction is intentional: arithmetic
// against other midnight-local Dates (this/next month's dueDay)
// then produces a whole number of days with no time-of-day skew.
export function today() {
  var tz = currentTz();
  try {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    var y = parseInt(parts.find(function (p) { return p.type === 'year'; }).value, 10);
    var m = parseInt(parts.find(function (p) { return p.type === 'month'; }).value, 10);
    var d = parseInt(parts.find(function (p) { return p.type === 'day'; }).value, 10);
    return new Date(y, m - 1, d);
  } catch (e) {
    // Invalid TZ string → fall back to the browser's local day.
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}

// "Today" as a YYYY-MM-DD string in the user's chosen time zone. This is the
// correct default for a payment date — `new Date().toISOString()` uses UTC and
// rolls to tomorrow for users behind UTC in the evening (the "dates are off"
// bug), so payments recorded at night landed on the wrong day.
export function todayISO() {
  var d = today();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// Convenience: a list of common IANA zones grouped for a Settings
// dropdown. The full Intl.supportedValuesOf('timeZone') list is
// long; this is a curated subset. The selector lets users type to
// find others, and storage accepts any valid IANA string.
export const COMMON_TIMEZONES = [
  { group: 'United States', zones: [
    'America/New_York',
    'America/Detroit',
    'America/Indiana/Indianapolis',
    'America/Chicago',
    'America/Denver',
    'America/Phoenix',
    'America/Los_Angeles',
    'America/Anchorage',
    'Pacific/Honolulu',
  ]},
  { group: 'Americas', zones: [
    'America/Toronto',
    'America/Vancouver',
    'America/Mexico_City',
    'America/Sao_Paulo',
    'America/Buenos_Aires',
  ]},
  { group: 'Europe', zones: [
    'Europe/London',
    'Europe/Dublin',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Madrid',
    'Europe/Rome',
    'Europe/Amsterdam',
    'Europe/Stockholm',
    'Europe/Athens',
    'Europe/Istanbul',
    'Europe/Moscow',
  ]},
  { group: 'Asia', zones: [
    'Asia/Dubai',
    'Asia/Karachi',
    'Asia/Kolkata',
    'Asia/Bangkok',
    'Asia/Singapore',
    'Asia/Hong_Kong',
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Asia/Seoul',
  ]},
  { group: 'Pacific', zones: [
    'Australia/Perth',
    'Australia/Adelaide',
    'Australia/Sydney',
    'Pacific/Auckland',
  ]},
  { group: 'Africa', zones: [
    'Africa/Cairo',
    'Africa/Johannesburg',
    'Africa/Lagos',
  ]},
  { group: 'Other', zones: ['UTC'] },
];
