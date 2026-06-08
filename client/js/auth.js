/* ═══════════════════════════════════════════════════════════
   auth.js — client side of the FiHaven auth flow.
   Talks to the Express backend: sessions live in an HttpOnly
   cookie (not readable from JS), so authentication state is
   checked via GET /api/auth/me. Handles the combined login/
   signup page, private-page gating, logout, and public CTAs.
═════════════════════════════════════════════════════════════════ */

  var API = '/api/auth';
  var csrfToken = null;

  // Turnstile coordination — the widget renders as soon as the API
  // script's onload callback fires. The sitekey is inlined into the
  // [data-turnstile] placeholder at build time (Vite substitutes
  // %VITE_TURNSTILE_SITEKEY%), so no extra round-trip is needed and
  // Turnstile's preloaded challenge bundle is consumed promptly.
  // The current token comes from Turnstile's callback (it doesn't
  // expose a getResponse the way hCaptcha did).
  var turnstileApiReady = false;
  var turnstileWidgetId = null;
  var turnstileToken    = '';

  /* ── backend calls ─────────────────────────────────────────── */

  function me() {
    return fetch(API + '/me', { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (data) {
        if (data && data.user) {
          csrfToken = data.csrfToken;
          return data.user;
        }
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  function submitAuth(mode, payload) {
    return fetch(API + '/' + mode, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            return { ok: r.ok, status: r.status, data: data };
          });
      })
      .catch(function () {
        return { ok: false, status: 0, data: { error: 'network' } };
      });
  }

  // Drop the cached account data so the next user on this browser
  // never inherits it. The server copy is unaffected.
  function clearLocalData() {
    ['fh_bills', 'fh_cards', 'fh_payments', 'fh_settings', 'fh_data_owner'].forEach(
      function (key) {
        localStorage.removeItem(key);
      }
    );
  }

  function logout() {
    var headers = csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
    fetch(API + '/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: headers,
    })
      .catch(function () {})
      .then(function () {
        clearLocalData();
        window.location.replace('/');
      });
  }

  /* ── helpers ───────────────────────────────────────────────── */

  function showMessage(target, text, isError) {
    if (!target) return;
    target.textContent = text;
    target.style.color = isError ? 'var(--red)' : 'var(--muted)';
  }

  function go(url) {
    window.location.replace(url);
  }

  // After a successful auth, unverified accounts go to the verify
  // screen; verified ones land in the app.
  function routeAfterAuth(data) {
    var u = data && data.user;
    if (u && u.emailVerified === false) { go('/verify-email'); return; }
    if (u && u.onboarded === false) { go('/welcome'); return; }
    go('/dashboard');
  }

  // Maps a backend error code to a friendly, user-facing message.
  function errorMessage(error) {
    switch (error) {
      case 'invalid-credentials':
        return 'Email or password is incorrect.';
      case 'email-taken':
        return 'An account with that email already exists.';
      case 'invalid-email':
        return 'Enter a valid email address.';
      case 'weak-password':
        return 'Password must be 10+ characters with at least one letter and one number.';
      case 'captcha-failed':
        return 'Captcha check failed — please try again.';
      case 'missing-captcha':
        return 'Please complete the captcha.';
      case 'rate-limited':
        return 'Too many attempts. Please wait a few minutes and try again.';
      case 'spam':
      case 'too-fast':
        return 'Submission blocked. Please take a moment and try again.';
      case 'network':
        return 'Could not reach the server. Check your connection and retry.';
      case 'mfa-token-invalid':
        return 'That sign-in attempt expired — start over.';
      case 'invalid-totp-code':
        return 'That code didn’t match. Try again.';
      case 'totp-not-enabled':
        return 'Authenticator codes aren’t set up on this account.';
      case 'email-mfa-not-enabled':
        return 'Email codes aren’t set up on this account.';
      case 'mail-send-failed':
        return 'We couldn’t send the email. Try again in a moment.';
      case 'passkey-verify-failed':
      case 'passkey-unknown':
        return 'Passkey didn’t verify. Try a different method.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }

  function updatePublicCtas(user) {
    Array.from(document.querySelectorAll('[data-login-cta]')).forEach(function (elt) {
      if (user) {
        elt.textContent = 'Open dashboard';
        if (elt.tagName === 'A') {
          elt.setAttribute('href', '/dashboard');
        } else {
          elt.setAttribute('onclick', "window.location.href='/dashboard'");
        }
      }
    });
  }

  /* ── Cloudflare Turnstile ──────────────────────────────────── */

  function tryRenderCaptcha() {
    if (turnstileWidgetId !== null) return;
    if (!turnstileApiReady) return;
    var container = document.querySelector('[data-turnstile]');
    if (!container || !window.turnstile) return;
    var sitekey = container.getAttribute('data-sitekey');
    if (!sitekey) return;
    turnstileWidgetId = window.turnstile.render(container, {
      sitekey: sitekey,
      callback: function (token) { turnstileToken = token; },
      'error-callback': function () { turnstileToken = ''; },
      'expired-callback': function () { turnstileToken = ''; },
    });
  }

  function resetCaptcha() {
    turnstileToken = '';
    if (turnstileWidgetId !== null && window.turnstile) {
      window.turnstile.reset(turnstileWidgetId);
    }
  }

  function getCaptchaToken() { return turnstileToken; }

  // Called by the Turnstile API script once it has finished loading.
  window.ctTurnstileOnload = function () {
    turnstileApiReady = true;
    tryRenderCaptcha();
  };

  /* ── login / signup page ───────────────────────────────────── */

  function initAuthPage() {
    var form = document.querySelector('[data-login-form]');
    if (!form) return;

    var message = document.querySelector('[data-login-message]');
    var startField = form.querySelector('[name="loginStartedAt"]');
    if (startField && !startField.value) {
      startField.value = String(Date.now());
    }

    // Mode toggle (login <-> signup).
    var mode = 'login';
    var modeButtons = Array.from(document.querySelectorAll('[data-auth-mode]'));
    var heading = document.querySelector('[data-auth-heading]');
    var submitBtn = form.querySelector('[type="submit"]');
    var passwordInput = form.querySelector('#login-password');
    var passwordHint = document.querySelector('[data-password-hint]');
    var termsNotice  = document.querySelector('[data-terms-notice]');
    var forgotLink   = document.querySelector('[data-forgot-link]');

    function applyMode(next) {
      mode = next;
      modeButtons.forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.authMode === mode);
      });
      var isSignup = mode === 'signup';
      if (heading) heading.textContent = isSignup
        ? 'Create your FiHaven account.'
        : 'Sign in to your FiHaven workspace.';
      if (submitBtn) submitBtn.textContent = isSignup ? 'Create account' : 'Continue';
      if (passwordInput) passwordInput.setAttribute('autocomplete', isSignup ? 'new-password' : 'current-password');
      if (passwordHint) passwordHint.hidden = !isSignup;
      if (termsNotice) termsNotice.hidden = !isSignup;
      if (forgotLink) forgotLink.hidden = isSignup;
      showMessage(message, '', false);
    }

    modeButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyMode(btn.dataset.authMode);
      });
    });
    applyMode('login');

    // Sitekey is already inlined on [data-turnstile] — render as
    // soon as the Turnstile script's onload callback fires (or now,
    // if it has already fired).
    tryRenderCaptcha();

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var email = form.querySelector('#login-email').value.trim();
      var password = form.querySelector('#login-password').value;
      var honeypot = form.querySelector('[data-honeypot]').value;
      var captchaToken = getCaptchaToken();

      // Light UX-only checks — the server is authoritative.
      if (email.length < 3 || password.length < 1) {
        showMessage(message, 'Enter your email and password.', true);
        return;
      }
      if (!captchaToken) {
        showMessage(message, errorMessage('missing-captcha'), true);
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      showMessage(message, 'Working…', false);

      submitAuth(mode, {
        email: email,
        password: password,
        captchaToken: captchaToken,
        website: honeypot,
        loginStartedAt: startField ? startField.value : '0',
      }).then(function (result) {
        if (submitBtn) submitBtn.disabled = false;
        if (result.ok) {
          if (result.data && result.data.mfaRequired) {
            beginMfaStep(form, result.data);
            return;
          }
          routeAfterAuth(result.data);
          return;
        }
        resetCaptcha();
        showMessage(message, errorMessage(result.data && result.data.error), true);
      });
    });
  }

  /* ── second-factor step ─────────────────────────────────────── */

  function beginMfaStep(loginForm, data) {
    var step       = document.querySelector('[data-mfa-step]');
    var codeForm   = document.querySelector('[data-mfa-code-form]');
    var codeInput  = document.getElementById('mfa-code');
    var codeLabel  = document.querySelector('[data-mfa-code-label]');
    var pkRow      = document.querySelector('[data-mfa-passkey-row]');
    var pkBtn      = document.querySelector('[data-mfa-use-passkey]');
    var msgEl      = document.querySelector('[data-mfa-message]');
    var backupBtn  = document.querySelector('[data-mfa-toggle-backup]');
    var cancelBtn  = document.querySelector('[data-mfa-cancel]');
    if (!step || !codeForm) return;

    var mfaToken = data.mfaToken;
    var methods  = data.methods || ['totp'];
    var hasTotp    = methods.indexOf('totp')    !== -1;
    var hasPasskey = methods.indexOf('passkey') !== -1;
    var hasEmail   = methods.indexOf('email')   !== -1;
    var emailRow      = document.querySelector('[data-mfa-email-row]');
    var emailBtn      = document.querySelector('[data-mfa-send-email]');
    var emailStatusEl = document.querySelector('[data-mfa-email-status]');

    // Hide the password form, show the MFA step.
    loginForm.hidden = true;
    var toggle = document.querySelector('.auth-mode-toggle');
    if (toggle) toggle.style.display = 'none';
    step.hidden = false;

    if (pkRow) pkRow.hidden = !hasPasskey;
    if (emailRow) emailRow.hidden = !hasEmail;
    // The TOTP code form doubles as the email-code input box. If
    // neither TOTP nor email is enabled (passkey-only), hide it.
    if (codeForm) codeForm.hidden = !(hasTotp || hasEmail);
    if (backupBtn) backupBtn.hidden = !hasTotp;
    if (emailStatusEl) emailStatusEl.textContent = '';
    if (codeInput) {
      codeInput.value = '';
      codeInput.placeholder = '000000';
      codeInput.maxLength = 14;
    }
    if (codeLabel) codeLabel.textContent = '6-digit code from your authenticator app';
    showMfaMsg('', false);

    // Reset state when the user clicks "Back to password".
    if (cancelBtn) {
      cancelBtn.onclick = function () {
        step.hidden = true;
        loginForm.hidden = false;
        if (toggle) toggle.style.display = '';
        showMessage(message, '', false);
      };
    }

    // Toggle code/backup label.
    if (backupBtn) {
      var usingBackup = false;
      backupBtn.onclick = function () {
        usingBackup = !usingBackup;
        if (codeInput) {
          codeInput.value = '';
          codeInput.placeholder = usingBackup ? 'ABCD-EF12' : '000000';
        }
        if (codeLabel) codeLabel.textContent = usingBackup
          ? 'Backup code (one of the 10 you saved at setup)'
          : '6-digit code from your authenticator app';
        backupBtn.textContent = usingBackup ? 'Use authenticator code' : 'Use a backup code';
      };
    }

    // TOTP / backup-code submit.
    codeForm.onsubmit = function (ev) {
      ev.preventDefault();
      var code = (codeInput && codeInput.value || '').trim();
      if (!code) return;
      showMfaMsg('Verifying…', false);
      fetch(API + '/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ mfaToken: mfaToken, code: code }),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          if (res.ok) { routeAfterAuth(res.data); return; }
          showMfaMsg(errorMessage(res.data && res.data.error), true);
        })
        .catch(function () { showMfaMsg(errorMessage('network'), true); });
    };

    // "Email me a code" button — server emails a 6-digit code,
    // the user types it into the existing code input.
    if (emailBtn) {
      emailBtn.onclick = function () {
        emailBtn.disabled = true;
        showEmailStatus('Sending…');
        fetch(API + '/mfa/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ mfaToken: mfaToken }),
        })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
          .then(function (res) {
            emailBtn.disabled = false;
            if (res.ok) {
              showEmailStatus('Code sent — check your inbox.');
              if (codeLabel) codeLabel.textContent = 'Code from your email';
              if (codeInput) {
                codeInput.placeholder = '000000';
                codeInput.focus();
              }
            } else {
              showEmailStatus(errorMessage(res.data && res.data.error));
            }
          })
          .catch(function () {
            emailBtn.disabled = false;
            showEmailStatus(errorMessage('network'));
          });
      };
    }

    function showEmailStatus(text) {
      if (emailStatusEl) emailStatusEl.textContent = text || '';
    }

    // Passkey button.
    if (pkBtn) {
      pkBtn.onclick = function () {
        showMfaMsg('Waiting for passkey…', false);
        fetch(API + '/mfa/passkey/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ mfaToken: mfaToken }),
        })
          .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
          .then(function (res) {
            if (!res.ok) { showMfaMsg(errorMessage(res.data && res.data.error), true); return; }
            // Dynamically import so the WebAuthn library isn't pulled
            // into the public bundle on every page load.
            return import('@simplewebauthn/browser').then(function (mod) {
              return mod.startAuthentication({ optionsJSON: res.data.options });
            }).then(function (asseResp) {
              return fetch(API + '/mfa/passkey/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ mfaToken: mfaToken, response: asseResp }),
              });
            }).then(function (r) {
              return r.json().then(function (d) { return { ok: r.ok, data: d }; });
            }).then(function (res2) {
              if (res2.ok) { routeAfterAuth(res2.data); return; }
              showMfaMsg(errorMessage(res2.data && res2.data.error), true);
            });
          })
          .catch(function (err) {
            showMfaMsg((err && err.message) || errorMessage('network'), true);
          });
      };
    }

    function showMfaMsg(text, isError) {
      if (!msgEl) return;
      msgEl.textContent = text || '';
      msgEl.style.color = isError ? 'var(--red)' : 'var(--muted)';
    }
  }

  /* ── page gating ───────────────────────────────────────────── */

  function initPrivatePage() {
    me().then(function (user) {
      // Anonymous visitors land on the marketing home (matches the
      // server-side gate). Session expiries mid-use are handled by
      // storage.js / account.js routing straight to /login. Unverified
      // accounts are sent to confirm their email before the dashboard.
      if (!user) { go('/'); return; }
      if (!user.emailVerified) go('/verify-email');
    });
  }

  function initLoginGate() {
    me().then(function (user) {
      if (user) {
        if (!user.emailVerified) go('/verify-email');
        else if (!user.onboarded) go('/welcome');
        else go('/dashboard');
      } else {
        initAuthPage();
      }
    });
  }

  function initPublicPage() {
    me().then(function (user) {
      updatePublicCtas(user);
    });
  }

  /* ── boot ──────────────────────────────────────────────────── */

  function init() {
    var mode = document.body ? document.body.dataset.auth : '';

    window.logout = logout;
    window.AppAuth = {
      me: me,
      logout: logout,
      // The current session's CSRF token (null until me() resolves).
      getCsrfToken: function () {
        return csrfToken;
      },
      // Async: resolves to true when a valid session exists.
      isAuthenticated: function () {
        return me().then(function (user) {
          return !!user;
        });
      },
    };

    if (mode === 'required') {
      initPrivatePage();
    } else if (mode === 'login') {
      initLoginGate();
    } else {
      initPublicPage();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
