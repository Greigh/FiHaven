/* ═══════════════════════════════════════════════════════════
   reset.js — password-reset page. Two modes on one page:
     • no ?token=  → request a reset link (email + Turnstile)
     • ?token=…    → set a new password
   Talks to POST /api/auth/forgot and POST /api/auth/reset. Both
   are unauthenticated (no CSRF); the link token is the secret.
═══════════════════════════════════════════════════════════ */

import './theme.js';
import './navbar.js';
import './passwordToggle.js';

var API = '/api/auth';

/* ── Turnstile (request form only) ───────────────────────────── */
var turnstileReady = false;
var widgetId = null;
var captchaToken = '';

function renderCaptcha() {
  if (widgetId !== null || !turnstileReady) return;
  var el = document.querySelector('[data-turnstile]');
  if (!el || !window.turnstile) return;
  var sitekey = el.getAttribute('data-sitekey');
  if (!sitekey) return;
  widgetId = window.turnstile.render(el, {
    sitekey: sitekey,
    callback: function (t) { captchaToken = t; },
    'error-callback': function () { captchaToken = ''; },
    'expired-callback': function () { captchaToken = ''; },
  });
}
function resetCaptcha() {
  captchaToken = '';
  if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
}
window.ctTurnstileOnload = function () { turnstileReady = true; renderCaptcha(); };

/* ── helpers ─────────────────────────────────────────────────── */
function show(el, text, isError) {
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isError ? 'var(--red)' : 'var(--muted)';
}

function errorMessage(code) {
  switch (code) {
    case 'invalid-email': return 'Enter a valid email address.';
    case 'weak-password': return 'Password must be 10+ characters with at least one letter and one number.';
    case 'invalid-token': return 'This reset link is invalid or has expired. Request a new one.';
    case 'captcha-failed': return 'Captcha check failed — please try again.';
    case 'missing-captcha': return 'Please complete the captcha.';
    case 'rate-limited': return 'Too many attempts. Please wait a few minutes and try again.';
    case 'spam':
    case 'too-fast': return 'Submission blocked. Please take a moment and try again.';
    case 'network': return 'Could not reach the server. Check your connection and retry.';
    default: return 'Something went wrong. Please try again.';
  }
}

function postJson(path, payload) {
  return fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  })
    .then(function (r) {
      return r.json().catch(function () { return {}; })
        .then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
    })
    .catch(function () { return { ok: false, status: 0, data: { error: 'network' } }; });
}

function tokenFromUrl() {
  return new URLSearchParams(window.location.search).get('token') || '';
}

/* ── request-a-link mode ─────────────────────────────────────── */
function initRequest() {
  var form = document.querySelector('[data-request-form]');
  if (!form) return;
  var message = document.querySelector('[data-request-message]');
  var startField = form.querySelector('[name="loginStartedAt"]');
  if (startField && !startField.value) startField.value = String(Date.now());
  var submitBtn = form.querySelector('[type="submit"]');

  renderCaptcha();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = form.querySelector('#reset-email').value.trim();
    var honeypot = form.querySelector('[data-honeypot]').value;
    if (email.length < 3) { show(message, 'Enter your email.', true); return; }
    if (!captchaToken) { show(message, errorMessage('missing-captcha'), true); return; }

    if (submitBtn) submitBtn.disabled = true;
    show(message, 'Sending…', false);

    postJson('/forgot', {
      email: email,
      captchaToken: captchaToken,
      website: honeypot,
      loginStartedAt: startField ? startField.value : '0',
    }).then(function (res) {
      if (submitBtn) submitBtn.disabled = false;
      resetCaptcha();
      if (res.ok) {
        // Replace the form with a neutral confirmation (no enumeration).
        form.innerHTML =
          '<p style="color:var(--text);font-size:15px;line-height:1.6;">' +
          'If an account exists for <strong>' + email.replace(/[<>&]/g, '') + '</strong>, ' +
          'a reset link is on its way. Check your inbox (and spam) — the link is valid for 30 minutes.' +
          '</p><div class="auth-actions" style="margin-top:14px;"><a class="btn btn-ghost" href="/login">Back to sign in</a></div>';
      } else {
        show(message, errorMessage(res.data && res.data.error), true);
      }
    });
  });
}

/* ── set-new-password mode ───────────────────────────────────── */
function initReset(token) {
  document.querySelector('[data-reset-request]').hidden = true;
  document.querySelector('[data-reset-form]').hidden = false;

  var form = document.querySelector('[data-new-password-form]');
  if (!form) return;
  var message = document.querySelector('[data-reset-message]');
  var submitBtn = form.querySelector('[type="submit"]');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = form.querySelector('#new-password').value;
    var confirm = form.querySelector('#confirm-password').value;
    if (pw.length < 10) { show(message, errorMessage('weak-password'), true); return; }
    if (pw !== confirm) { show(message, 'Passwords don’t match.', true); return; }

    if (submitBtn) submitBtn.disabled = true;
    show(message, 'Updating…', false);

    postJson('/reset', { token: token, password: pw }).then(function (res) {
      if (res.ok) {
        form.innerHTML =
          '<p style="color:var(--text);font-size:15px;line-height:1.6;">' +
          'Your password has been updated and every other device has been signed out. ' +
          'You can now sign in with your new password.</p>' +
          '<div class="auth-actions" style="margin-top:14px;"><a class="btn btn-primary" href="/login">Go to sign in</a></div>';
        return;
      }
      if (submitBtn) submitBtn.disabled = false;
      show(message, errorMessage(res.data && res.data.error), true);
    });
  });
}

/* ── boot ────────────────────────────────────────────────────── */
function init() {
  var token = tokenFromUrl();
  if (token) initReset(token);
  else initRequest();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
