/* ═══════════════════════════════════════════════════════════
   plaid-oauth.js — OAuth redirect handler for Plaid Link.

   OAuth banks redirect the whole browser away to authenticate, then
   back to PLAID_REDIRECT_URI (this page, /plaid-oauth). To resume the
   flow we re-create the Link handler with the SAME link token (stashed
   in localStorage before Link opened) plus `receivedRedirectUri`, then
   finish exactly as the in-page flow would: exchange the public token
   for a new link, or mark the item repaired for an update-mode re-auth.
═══════════════════════════════════════════════════════════ */

import './theme.js';
import './auth.js';

// Shared with settings.js connect()/reconnect(): { token, mode, itemId }.
var STASH = 'fh_plaid_oauth';

function go(to) { window.location.replace(to); }

function setStatus(text) {
  var el = document.querySelector('[data-oauth-status]');
  if (el) el.textContent = text;
}

// The session CSRF token (auth.js bootstraps it via me()).
function csrfToken() {
  var auth = window.AppAuth;
  var t = auth && auth.getCsrfToken && auth.getCsrfToken();
  if (t) return Promise.resolve(t);
  return auth.me().then(function () { return auth.getCsrfToken(); });
}

function plaidFetch(path, method, body) {
  return csrfToken().then(function (token) {
    var opts = { method: method, headers: { 'X-CSRF-Token': token || '' }, credentials: 'same-origin' };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch('/api/plaid/' + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        return { ok: r.ok, status: r.status, data: data };
      });
    });
  });
}

function loadPlaidLink() {
  if (window.Plaid) return Promise.resolve(window.Plaid);
  return new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    s.async = true;
    s.onload = function () { resolve(window.Plaid); };
    s.onerror = function () { reject(new Error('plaid-script')); };
    document.head.appendChild(s);
  });
}

(function run() {
  var stash = null;
  try { stash = JSON.parse(localStorage.getItem(STASH) || 'null'); } catch (_) { stash = null; }
  var params = new URLSearchParams(window.location.search);

  // Only a genuine Plaid OAuth return carries oauth_state_id and a stashed
  // token; anything else (a stray visit) just goes back to Settings.
  if (!stash || !stash.token || !params.get('oauth_state_id')) {
    return go('/settings');
  }

  var done = function (to) { localStorage.removeItem(STASH); go(to || '/settings'); };

  // Ensure the session/CSRF are bootstrapped, then resume Link.
  var ready = (window.AppAuth && window.AppAuth.me) ? window.AppAuth.me() : Promise.resolve();
  ready.then(loadPlaidLink).then(function (Plaid) {
    var handler = Plaid.create({
      token: stash.token,
      receivedRedirectUri: window.location.href,
      onSuccess: function (publicToken, metadata) {
        setStatus('Linking your accounts…');
        if (stash.mode === 'update' && stash.itemId != null) {
          plaidFetch('item/' + stash.itemId + '/repaired', 'POST').then(function () {
            done('/settings?bank=reconnected');
          }).catch(function () { done('/settings'); });
        } else {
          plaidFetch('link/exchange', 'POST', {
            public_token: publicToken,
            institution: metadata && metadata.institution,
          }).then(function () { done('/settings?bank=linked'); })
            .catch(function () { done('/settings'); });
        }
      },
      onExit: function () { done('/settings'); },
    });
    handler.open();
  }).catch(function () { done('/settings'); });
})();
