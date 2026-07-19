/* ═══════════════════════════════════════════════════════════
   social-login.js — "Continue with Google / Apple" on the login
   page. Asks the server which providers are configured (GET
   /api/auth/oauth/config), lazy-loads the matching provider SDK,
   and posts the returned OIDC ID token to
   POST /api/auth/oauth/:provider. On success it reuses AppAuth's
   post-auth routing. The whole block stays hidden unless at least
   one provider is configured server-side.
═══════════════════════════════════════════════════════════ */

(function () {
  var GOOGLE_SDK = 'https://accounts.google.com/gsi/client';
  var APPLE_SDK = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('sdk-load-failed')); };
      document.head.appendChild(s);
    });
  }

  function showError(msg) {
    var el = document.querySelector('[data-oauth-message]');
    if (el) el.textContent = msg || '';
  }

  // Hand the provider's ID token to the server, then route like any login.
  function submitToken(provider, idToken, name) {
    showError('');
    return fetch('/api/auth/oauth/' + provider, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ idToken: idToken, name: name || undefined }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) {
          showError(messageFor(res.data && res.data.error));
          return;
        }
        // App-level MFA may still be required after a federated first factor.
        if (res.data && res.data.mfaRequired) {
          if (window.AppAuth && window.AppAuth.beginMfa) {
            window.AppAuth.beginMfa(res.data);
          } else {
            showError('This account requires a second factor. Sign in with email to finish.');
          }
          return;
        }
        if (window.AppAuth && window.AppAuth.routeAfterAuth) window.AppAuth.routeAfterAuth(res.data);
        else window.location.replace('/dashboard');
      })
      .catch(function () { showError('Could not reach the server. Please try again.'); });
  }

  function messageFor(code) {
    switch (code) {
      case 'oauth-email-unverified':
        return 'Your provider account has no verified email, so we can’t sign you in this way.';
      case 'oauth-verify-failed':
        return 'That sign-in could not be verified. Please try again.';
      case 'provider-not-configured':
        return 'That sign-in method isn’t available right now.';
      default:
        return 'Sign-in failed. Please try again.';
    }
  }

  function initGoogle(clientId) {
    return loadScript(GOOGLE_SDK).then(function () {
      if (!window.google || !google.accounts || !google.accounts.id) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: function (resp) { submitToken('google', resp.credential); },
      });
      var host = document.querySelector('[data-oauth-google]');
      if (host) {
        google.accounts.id.renderButton(host, {
          theme: 'outline', size: 'large', width: 300, shape: 'rectangular',
          text: 'continue_with', logo_alignment: 'left',
        });
      }
    });
  }

  function initApple(clientId) {
    var host = document.querySelector('[data-oauth-apple]');
    if (!host) return Promise.resolve();
    return loadScript(APPLE_SDK).then(function () {
      if (!window.AppleID) return;
      AppleID.auth.init({
        clientId: clientId,
        scope: 'name email',
        redirectURI: window.location.origin + '/login',
        usePopup: true,
      });
      var btn = document.createElement('button');
      btn.type = 'button';
      // Apple logo + label, sized to match the Google button (300×44).
      btn.innerHTML =
        '<svg width="16" height="19" viewBox="0 0 14 17" fill="#fff" aria-hidden="true" focusable="false">' +
        '<path d="M11.6 9c0-1.6 1.3-2.4 1.4-2.5-.8-1.1-2-1.3-2.4-1.3-1-.1-2 .6-2.5.6s-1.3-.6-2.2-.6c-1.1 0-2.2.7-2.7 1.7C1 8.9 1.9 12 3 13.7c.5.8 1.2 1.7 2 1.7.8 0 1.1-.5 2.1-.5s1.3.5 2.1.5 1.4-.8 1.9-1.6c.6-.9.9-1.8.9-1.8s-1.6-.6-1.6-2.4M9.9 3.6c.4-.5.7-1.3.6-2-.6 0-1.4.4-1.8.9-.4.4-.8 1.2-.7 1.9.7.1 1.4-.3 1.9-.8"/>' +
        '</svg>' +
        '<span>Continue with Apple</span>';
      btn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;gap:8px;' +
        'width:100%;height:44px;border-radius:8px;border:1px solid #000;background:#000;' +
        'color:#fff;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;' +
        '-webkit-font-smoothing:antialiased;';
      btn.addEventListener('click', function () {
        AppleID.auth.signIn().then(function (resp) {
          var idToken = resp && resp.authorization && resp.authorization.id_token;
          // Apple only returns the name on the very first authorization.
          var name = resp && resp.user && resp.user.name
            ? [resp.user.name.firstName, resp.user.name.lastName].filter(Boolean).join(' ')
            : undefined;
          if (idToken) submitToken('apple', idToken, name);
        }).catch(function () { /* user cancelled */ });
      });
      host.appendChild(btn);
    });
  }

  function init() {
    var container = document.querySelector('[data-oauth-block]');
    if (!container) return;
    fetch('/api/auth/oauth/config', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        var any = (cfg.google && cfg.google.enabled) || (cfg.apple && cfg.apple.enabled);
        if (!any) return; // leave the block hidden
        container.hidden = false;
        if (cfg.google && cfg.google.enabled) initGoogle(cfg.google.clientId).catch(function () {});
        if (cfg.apple && cfg.apple.enabled) initApple(cfg.apple.clientId).catch(function () {});
      })
      .catch(function () { /* config unavailable → no buttons */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
