/* ═══════════════════════════════════════════════════════════
   verify-email.js — email-confirmation page. Two modes:
     • ?token=… → confirm the email, then route on into the app
     • no token → "pending" screen for a signed-in but unverified
       user: shows the address and a resend button
   Talks to POST /api/auth/verify-email, GET /api/auth/me,
   POST /api/auth/resend-verification, POST /api/auth/logout.
═══════════════════════════════════════════════════════════ */

import './theme.js';
import './navbar.js';

var API = '/api/auth';
var csrfToken = null;

function show(el, text, isError) {
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isError ? 'var(--red)' : 'var(--muted)';
}
function go(url) { window.location.replace(url); }

function errorMessage(code) {
  switch (code) {
    case 'invalid-token': return 'This confirmation link is invalid or has expired. Resend it below.';
    case 'rate-limited': return 'Too many emails sent. Please wait a few minutes and try again.';
    case 'mail-send-failed': return 'We couldn’t send the email just now. Try again in a moment.';
    case 'network': return 'Could not reach the server. Check your connection and retry.';
    default: return 'Something went wrong. Please try again.';
  }
}

function postJson(path, payload) {
  return fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload || {}),
  })
    .then(function (r) {
      return r.json().catch(function () { return {}; })
        .then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
    })
    .catch(function () { return { ok: false, status: 0, data: { error: 'network' } }; });
}

function getMe() {
  return fetch(API + '/me', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d && d.csrfToken) csrfToken = d.csrfToken; return (d && d.user) || null; })
    .catch(function () { return null; });
}

var heading = document.querySelector('[data-verify-heading]');
var status = document.querySelector('[data-verify-status]');
var pending = document.querySelector('[data-verify-pending]');
var loggedOut = document.querySelector('[data-verify-loggedout]');

/* Pending screen for a signed-in, unverified user. */
function showPending(user, note) {
  if (heading) heading.textContent = 'Confirm your email';
  show(status, 'One more step before your dashboard.', false);
  var emailEl = document.querySelector('[data-verify-email]');
  if (emailEl) emailEl.textContent = user.email;
  if (pending) pending.hidden = false;

  var resendStatus = document.querySelector('[data-resend-status]');
  if (note) show(resendStatus, note, true);

  var resendBtn = document.querySelector('[data-resend]');
  if (resendBtn) {
    resendBtn.onclick = function () {
      resendBtn.disabled = true;
      show(resendStatus, 'Sending…', false);
      postJson('/resend-verification').then(function (res) {
        resendBtn.disabled = false;
        if (res.ok) show(resendStatus, 'Sent — check your inbox (and spam).', false);
        else show(resendStatus, errorMessage(res.data && res.data.error), true);
      });
    };
  }

  var switchBtn = document.querySelector('[data-switch-account]');
  if (switchBtn) {
    switchBtn.onclick = function () {
      var headers = csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
      fetch(API + '/logout', { method: 'POST', credentials: 'same-origin', headers: headers })
        .catch(function () {})
        .then(function () { go('/login'); });
    };
  }
}

/* No session on this device (link opened elsewhere, or signed out). */
function showLoggedOut(note) {
  if (heading) heading.textContent = 'Confirm your email';
  show(status, note || 'You’re signed out on this device.', !!note);
  if (loggedOut) loggedOut.hidden = false;
}

/* Decide what to render for someone without a (valid) token. */
function routePending(note) {
  getMe().then(function (user) {
    if (user && user.emailVerified) { go('/dashboard'); return; }
    if (!user) { showLoggedOut(note); return; }
    showPending(user, note);
  });
}

/* ── boot ────────────────────────────────────────────────────── */
function init() {
  var token = new URLSearchParams(window.location.search).get('token') || '';
  if (!token) { routePending(); return; }

  show(status, 'Confirming your email…', false);
  postJson('/verify-email', { token: token }).then(function (res) {
    if (res.ok) {
      if (heading) heading.textContent = 'Email confirmed ✓';
      show(status, 'All set — taking you to FiHaven…', false);
      // Land in the app if signed in here; otherwise send to sign-in.
      getMe().then(function (user) {
        setTimeout(function () { go(user ? '/dashboard' : '/login'); }, 1200);
      });
      return;
    }
    // Bad/expired token → fall back to the pending/resend screen.
    routePending(errorMessage(res.data && res.data.error));
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
