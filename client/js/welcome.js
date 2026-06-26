/* ═══════════════════════════════════════════════════════════
   welcome.js — first-run onboarding. A 4-step intro shown once
   after a new account confirms its email: secure (2FA/settings),
   add bills & cards, then FiHaven Pro. Any exit (a deep-link or
   "Continue") marks onboarding complete via POST /api/account/
   onboarded so it never shows again.
═══════════════════════════════════════════════════════════ */

import './theme.js';

var API = '/api/auth';
var csrfToken = null;
var step = 1;
var TOTAL = 5;

function go(url) { window.location.replace(url); }

// ── Goals → tab bar ────────────────────────────────────────
// Each chosen goal surfaces its tabs in the bottom bar so people land on
// the features they came for. Mirrors the iOS/Android onboarding mapping.
var GOAL_TABS = {
  bills: ['bills', 'calendar'],
  debt: ['cards', 'payoff'],
  budget: ['budget', 'spending'],
  rewards: ['rewards'],
  subscriptions: ['subscriptions'],
};
var ALL_TABS = ['dashboard', 'bills', 'cards', 'loans', 'payoff', 'rewards',
                'budget', 'spending', 'subscriptions', 'calendar', 'history'];

// The ordered tab ids for the chosen goals (dashboard first, then chosen
// features, then the rest), or null when nothing was selected.
function selectedTabIds() {
  var chosen = Array.prototype.slice
    .call(document.querySelectorAll('[data-goal]:checked'))
    .map(function (c) { return c.value; });
  if (!chosen.length) return null;
  var ordered = ['dashboard'];
  // Fixed goal order so the bar is deterministic regardless of click order.
  ['bills', 'debt', 'budget', 'rewards', 'subscriptions'].forEach(function (g) {
    if (chosen.indexOf(g) === -1) return;
    GOAL_TABS[g].forEach(function (t) { if (ordered.indexOf(t) === -1) ordered.push(t); });
  });
  ALL_TABS.forEach(function (t) { if (ordered.indexOf(t) === -1) ordered.push(t); });
  return ordered;
}

function fetchData() {
  return fetch('/api/data', { credentials: 'same-origin' }).then(function (r) {
    if (!r.ok) throw new Error('load failed');
    return r.json();
  });
}

// Persist settings.tabs from the chosen goals. Best-effort: resolves even on
// failure so onboarding never gets stuck.
function selectedBudgetRule() {
  var wrap = document.querySelector('[data-budget-style-wrap]');
  if (!wrap || wrap.hidden) return null;
  var picked = document.querySelector('[data-budget-style]:checked');
  if (!picked) return null;
  return picked.value === '50-30-20' ? '50-30-20' : 'off';
}

function toggleBudgetStyle() {
  var wrap = document.querySelector('[data-budget-style-wrap]');
  if (!wrap) return;
  var budgetOn = Array.prototype.some.call(
    document.querySelectorAll('[data-goal]:checked'),
    function (c) { return c.value === 'budget'; }
  );
  wrap.hidden = !budgetOn;
}

function saveGoalTabs() {
  var ids = selectedTabIds();
  var rule = selectedBudgetRule();
  if (!ids && !rule) return Promise.resolve();
  return fetchData().then(function (server) {
    var nextSettings = Object.assign({}, server.settings || {});
    if (ids) nextSettings.tabs = ids;
    if (rule) nextSettings.budgetRule = rule;
    return fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken || '' },
      credentials: 'same-origin',
      body: JSON.stringify({
        bills: server.bills || [], cards: server.cards || [], payments: server.payments || [],
        settings: nextSettings,
      }),
    });
  }).catch(function () {});
}

function getMe() {
  return fetch(API + '/me', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d && d.csrfToken) csrfToken = d.csrfToken; return (d && d.user) || null; })
    .catch(function () { return null; });
}

// Mark onboarding done (idempotent). Resolves regardless so navigation
// never gets stuck on a transient failure.
function markOnboarded() {
  return fetch('/api/account/onboarded', {
    method: 'POST',
    credentials: 'same-origin',
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
  }).catch(function () {});
}

// Mark complete, then leave the flow for `url`.
function finishTo(url) {
  var msg = document.querySelector('[data-onboard-message]');
  if (msg) { msg.style.color = 'var(--muted)'; msg.textContent = 'One moment…'; }
  saveGoalTabs().then(markOnboarded).then(function () { go(url); });
}

// Finish onboarding, then kick off Stripe Checkout for `plan` (e.g. the free
// trial). Falls back to the in-app Pro dialog if checkout can't be started
// (e.g. the plan isn't configured), so the user is never stranded.
function startProCheckout(plan) {
  var msg = document.querySelector('[data-onboard-message]');
  if (msg) { msg.style.color = 'var(--muted)'; msg.textContent = 'One moment…'; }
  saveGoalTabs().then(markOnboarded).then(function () {
    return fetch('/api/billing/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken || '' },
      credentials: 'same-origin',
      body: JSON.stringify({ plan: plan }),
    }).then(function (r) { return r.ok ? r.json() : null; });
  }).then(function (d) {
    go(d && d.url ? d.url : '/dashboard?pro=open');
  }).catch(function () { go('/dashboard?pro=open'); });
}

function render() {
  for (var i = 1; i <= TOTAL; i++) {
    var panel = document.querySelector('[data-step="' + i + '"]');
    if (panel) panel.hidden = i !== step;
    var dot = document.querySelector('[data-dot="' + i + '"]');
    if (dot) dot.classList.toggle('active', i <= step);
  }
}

function next() {
  if (step < TOTAL) { step += 1; render(); }
  else finishTo('/dashboard');
}

function wire() {
  // "Next" / "Maybe later" / "I'll do it later" — advance without exiting.
  Array.prototype.forEach.call(document.querySelectorAll('[data-next]'), function (b) {
    b.addEventListener('click', next);
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-goal]'), function (c) {
    c.addEventListener('change', toggleBudgetStyle);
  });
  // Exits — each marks onboarding complete first.
  var skipAll = document.querySelector('[data-skip-all]');
  if (skipAll) skipAll.addEventListener('click', function () { finishTo('/dashboard'); });
  var settings = document.querySelector('[data-go-settings]');
  if (settings) settings.addEventListener('click', function () { finishTo('/settings#security'); });
  var dash = document.querySelector('[data-go-dashboard]');
  if (dash) dash.addEventListener('click', function () { finishTo('/dashboard'); });
  var trial = document.querySelector('[data-start-trial]');
  if (trial) trial.addEventListener('click', function () { startProCheckout('trial'); });
  var premium = document.querySelector('[data-get-premium]');
  if (premium) premium.addEventListener('click', function () { finishTo('/dashboard?pro=open'); });
  var finish = document.querySelector('[data-finish]');
  if (finish) finish.addEventListener('click', function () { finishTo('/dashboard'); });
}

function init() {
  getMe().then(function (user) {
    // Server already gates /welcome, but double-check client-side.
    if (!user) { go('/login'); return; }
    if (user.emailVerified === false) { go('/verify-email'); return; }
    if (user.onboarded === true) { go('/dashboard'); return; }

    var nameEl = document.querySelector('[data-welcome-name]');
    if (nameEl && user.name) nameEl.textContent = ', ' + String(user.name).split(' ')[0];

    document.querySelector('[data-onboard]').hidden = false;
    wire();
    render();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
