/* ═══════════════════════════════════════════════════════════
   welcome.js — first-run onboarding. A 4-step intro shown once
   after a new account confirms its email: secure (2FA/settings),
   add bills & cards, then FiHaven Pro. Any exit (a deep-link or
   "Continue") marks onboarding complete via POST /api/account/
   onboarded so it never shows again.
═══════════════════════════════════════════════════════════ */

import './theme.js';
import './public-footer.js';

var API = '/api/auth';
var csrfToken = null;
var step = 1;
var TOTAL = 4;

function go(url) { window.location.replace(url); }

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
  markOnboarded().then(function () { go(url); });
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
  // Exits — each marks onboarding complete first.
  var skipAll = document.querySelector('[data-skip-all]');
  if (skipAll) skipAll.addEventListener('click', function () { finishTo('/dashboard'); });
  var settings = document.querySelector('[data-go-settings]');
  if (settings) settings.addEventListener('click', function () { finishTo('/settings#security'); });
  var dash = document.querySelector('[data-go-dashboard]');
  if (dash) dash.addEventListener('click', function () { finishTo('/dashboard'); });
  var pro = document.querySelector('[data-go-pro]');
  if (pro) pro.addEventListener('click', function () { finishTo('/dashboard?pro=open'); });
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
