/* ═══════════════════════════════════════════════════════════
   welcome.js — first-run onboarding after email confirm.
   Goals → plan review → security → Pro. Back revises earlier
   steps; Continue with Free only after Premium / “Not now”.
═══════════════════════════════════════════════════════════ */

import './theme.js';

var API = '/api/auth';
var csrfToken = null;
var step = 1;
var TOTAL = 4;
var freeUnlocked = false;

var GOAL_META = {
  bills: { title: 'Stay on top of bills', blurb: 'Bills + calendar up front' },
  debt: { title: 'Pay off credit cards & debt', blurb: 'Cards + payoff planner' },
  budget: { title: 'Budget each month', blurb: 'Budget + spending' },
  rewards: { title: 'Maximize card rewards', blurb: 'Rewards picker' },
  subscriptions: { title: 'Track subscriptions', blurb: 'Subscription finder' },
};

var GOAL_TABS = {
  bills: ['bills', 'calendar'],
  debt: ['cards', 'payoff'],
  budget: ['budget', 'spending'],
  rewards: ['rewards'],
  subscriptions: ['subscriptions'],
};

function go(url) { window.location.replace(url); }

function chosenGoals() {
  return Array.prototype.slice
    .call(document.querySelectorAll('[data-goal]:checked'))
    .map(function (c) { return c.value; });
}

function selectedTabIds() {
  var chosen = chosenGoals();
  if (!chosen.length) return null;
  var ordered = ['dashboard'];
  ['bills', 'debt', 'budget', 'rewards', 'subscriptions'].forEach(function (g) {
    if (chosen.indexOf(g) === -1) return;
    GOAL_TABS[g].forEach(function (t) { if (ordered.indexOf(t) === -1) ordered.push(t); });
  });
  // Prefer bottom slots only — remaining tabs stay under More.
  return ordered.slice(0, 4);
}

function fetchData() {
  return fetch('/api/data', { credentials: 'same-origin' }).then(function (r) {
    if (!r.ok) throw new Error('load failed');
    return r.json();
  });
}

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
  var budgetOn = chosenGoals().indexOf('budget') !== -1;
  wrap.hidden = !budgetOn;
  updateGoalsContinue();
}

function updateGoalsContinue() {
  var btn = document.querySelector('[data-goals-continue]');
  if (!btn) return;
  btn.textContent = chosenGoals().length ? 'Continue' : 'Skip for now';
}

function refreshPlan() {
  var list = document.querySelector('[data-plan-list]');
  var tips = document.querySelector('[data-plan-tips]');
  var copy = document.querySelector('[data-plan-copy]');
  if (!list || !tips) return;
  var chosen = chosenGoals();
  var html = '<div style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:8px;">Home</div>' +
    '<div style="font-weight:500;margin-bottom:10px;">Dashboard</div>';
  if (!chosen.length) {
    html += '<div style="color:var(--muted);font-size:13px;">Default tabs — Bills, Cards, Spending, More</div>';
    if (copy) copy.textContent = 'We’ll start you on the dashboard. You can pin features later in Settings.';
  } else {
    chosen.forEach(function (g) {
      var m = GOAL_META[g] || { title: g, blurb: '' };
      html += '<div style="margin:8px 0;"><div style="font-weight:500;">' + m.title + '</div>' +
        '<div style="color:var(--muted);font-size:12px;">' + m.blurb + '</div></div>';
    });
    var rule = selectedBudgetRule();
    if (chosen.indexOf('budget') !== -1 && rule) {
      html += '<div style="color:var(--muted);font-size:13px;margin-top:8px;">Budget style: ' +
        (rule === '50-30-20' ? '50/30/20' : 'detailed categories') + '</div>';
    }
    if (copy) copy.textContent = 'Based on what you picked, these features sit in your bottom bar. Change anytime in Settings.';
  }
  list.innerHTML = html;

  var tipItems = [
    'Add a few bills or cards from those tabs',
    'Mark what’s paid this month from the dashboard',
  ];
  if (chosen.indexOf('debt') !== -1) tipItems.push('Open Payoff to see a debt-free date');
  if (chosen.indexOf('rewards') !== -1) tipItems.push('Ask Rewards which card to use');
  tips.innerHTML = tipItems.map(function (t) { return '<li>' + t + '</li>'; }).join('');
}

function saveGoalTabs() {
  var ids = selectedTabIds();
  var rule = selectedBudgetRule();
  var archiveCb = document.querySelector('[data-archive-instead]');
  var archiveOn = archiveCb ? !!archiveCb.checked : true;
  return fetchData().then(function (server) {
    var nextSettings = Object.assign({}, server.settings || {});
    if (ids) nextSettings.tabs = ids;
    if (rule) nextSettings.budgetRule = rule;
    nextSettings.archiveInsteadOfDelete = archiveOn;
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

function markOnboarded() {
  return fetch('/api/account/onboarded', {
    method: 'POST',
    credentials: 'same-origin',
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
  }).catch(function () {});
}

function finishTo(url) {
  var msg = document.querySelector('[data-onboard-message]');
  if (msg) { msg.style.color = 'var(--muted)'; msg.textContent = 'One moment…'; }
  saveGoalTabs().then(markOnboarded).then(function () { go(url); });
}

function startProCheckout(plan) {
  var msg = document.querySelector('[data-onboard-message]');
  if (msg) { msg.style.color = 'var(--muted)'; msg.textContent = 'One moment…'; }
  freeUnlocked = true;
  updateFreeCta();
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

function updateFreeCta() {
  var notNow = document.querySelector('[data-not-now]');
  var finish = document.querySelector('[data-finish]');
  if (!finish) return;
  if (freeUnlocked) {
    finish.hidden = false;
    if (notNow) notNow.hidden = true;
  } else {
    finish.hidden = true;
    if (notNow) notNow.hidden = false;
  }
}

function render() {
  for (var i = 1; i <= TOTAL; i++) {
    var panel = document.querySelector('[data-step="' + i + '"]');
    if (panel) panel.hidden = i !== step;
    var dot = document.querySelector('[data-dot="' + i + '"]');
    if (dot) {
      dot.classList.toggle('active', i === step);
      dot.classList.toggle('clickable', i < step);
    }
  }
  var back = document.querySelector('[data-back]');
  if (back) back.hidden = step <= 1;
  if (step === 2) refreshPlan();
  if (step === 4) updateFreeCta();
  updateGoalsContinue();
}

function next() {
  if (step < TOTAL) { step += 1; render(); }
}

function back() {
  if (step > 1) { step -= 1; render(); }
}

function wire() {
  Array.prototype.forEach.call(document.querySelectorAll('[data-next]'), function (b) {
    b.addEventListener('click', next);
  });
  var backBtn = document.querySelector('[data-back]');
  if (backBtn) backBtn.addEventListener('click', back);
  Array.prototype.forEach.call(document.querySelectorAll('[data-goal]'), function (c) {
    c.addEventListener('change', toggleBudgetStyle);
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-dot]'), function (dot) {
    dot.addEventListener('click', function () {
      var n = parseInt(dot.getAttribute('data-dot'), 10);
      if (n && n < step) { step = n; render(); }
    });
  });
  var editGoals = document.querySelector('[data-edit-goals]');
  if (editGoals) editGoals.addEventListener('click', function () { step = 1; render(); });

  // Security deep-link completes onboarding (same as before) so Settings works.
  var settings = document.querySelector('[data-go-settings]');
  if (settings) settings.addEventListener('click', function () { finishTo('/settings#security'); });

  var trial = document.querySelector('[data-start-trial]');
  if (trial) trial.addEventListener('click', function () { startProCheckout('trial'); });
  var premium = document.querySelector('[data-get-premium]');
  if (premium) premium.addEventListener('click', function () {
    freeUnlocked = true;
    updateFreeCta();
    finishTo('/dashboard?pro=open');
  });
  var notNow = document.querySelector('[data-not-now]');
  if (notNow) notNow.addEventListener('click', function () {
    freeUnlocked = true;
    updateFreeCta();
  });
  var finish = document.querySelector('[data-finish]');
  if (finish) finish.addEventListener('click', function () { finishTo('/dashboard'); });
}

function init() {
  getMe().then(function (user) {
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
