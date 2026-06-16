/* ═══════════════════════════════════════════════════════════
   recover.js — 2FA account recovery (the destructive path). Two
   modes on one page:
     • no ?token=  → request a recovery link (email + Turnstile)
     • ?token=…    → confirm: disable 2FA + erase bills/cards/payments
                     (settings kept), then sign in fresh
   Talks to POST /api/auth/recover-2fa/request and …/confirm. Both
   are unauthenticated; the emailed token is the proof.
═══════════════════════════════════════════════════════════ */

import './theme.js';
import './navbar.js';
import './public-footer.js';

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
    case 'invalid-token': return 'This recovery link is invalid or has expired. Request a new one.';
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
    body: JSON.stringify(payload || {}),
  })
    .then(function (r) {
      return r.json().catch(function () { return {}; })
        .then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
    })
    .catch(function () { return { ok: false, status: 0, data: { error: 'network' } }; });
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
    var email = form.querySelector('#recover-email').value.trim();
    var honeypot = form.querySelector('[data-honeypot]').value;
    if (email.length < 3) { show(message, 'Enter your email.', true); return; }
    if (!captchaToken) { show(message, errorMessage('missing-captcha'), true); return; }

    if (submitBtn) submitBtn.disabled = true;
    show(message, 'Sending…', false);

    postJson('/recover-2fa/request', {
      email: email,
      captchaToken: captchaToken,
      website: honeypot,
      loginStartedAt: startField ? startField.value : '0',
    }).then(function (res) {
      if (submitBtn) submitBtn.disabled = false;
      resetCaptcha();
      if (res.ok) {
        form.innerHTML =
          '<p style="color:var(--text);font-size:15px;line-height:1.6;">' +
          'If an account with two-factor authentication exists for <strong>' + email.replace(/[<>&]/g, '') + '</strong>, ' +
          'a recovery link is on its way. Check your inbox (and spam) — the link is valid for 30 minutes.' +
          '</p><div class="auth-actions" style="margin-top:14px;"><a class="btn btn-ghost" href="/login">Back to sign in</a></div>';
      } else {
        show(message, errorMessage(res.data && res.data.error), true);
      }
    });
  });
}

/* ── confirm (destructive) mode ──────────────────────────────── */
function initConfirm(token) {
  document.querySelector('[data-recover-request]').hidden = true;
  document.querySelector('[data-recover-confirm]').hidden = false;

  var btn = document.querySelector('[data-confirm-btn]');
  var message = document.querySelector('[data-confirm-message]');
  if (!btn) return;

  btn.addEventListener('click', function () {
    btn.disabled = true;
    show(message, 'Recovering…', false);
    postJson('/recover-2fa/confirm', { token: token }).then(function (res) {
      var card = document.querySelector('[data-recover-confirm]');
      if (res.ok) {
        card.innerHTML =
          '<div class="hero-badge">Account recovery</div>' +
          '<h1 style="margin-top:14px;">Recovery complete</h1>' +
          '<p style="margin-top:12px;color:var(--text);font-size:15px;line-height:1.6;">' +
          'Two-factor authentication is off and your bills, cards, and payment history were erased. ' +
          'Your settings were kept. Sign in with your email and password.</p>' +
          '<div class="auth-actions" style="margin-top:14px;"><a class="btn btn-primary" href="/login">Go to sign in</a></div>';
        return;
      }
      btn.disabled = false;
      show(message, errorMessage(res.data && res.data.error), true);
    });
  });
}

/* ── boot ────────────────────────────────────────────────────── */
function init() {
  var token = new URLSearchParams(window.location.search).get('token') || '';
  if (token) initConfirm(token);
  else initRequest();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
