/* ═══════════════════════════════════════════════════════════
   pay.js — the Paddle "default payment link" target (/pay).

   Paddle appends `?_ptxn=txn_…` to this URL whenever it hands a
   customer a payment link: paying an invoice, retrying a failed
   charge, or — most often — updating an expired card. Once Paddle.js
   is initialized on the page it opens that transaction's checkout by
   itself; there is no transaction id for us to read or pass along.

   Two things make this its own page rather than a flag on an existing
   one:

     1. It must load Paddle.js ON PAGE LOAD. Everywhere else Paddle.js
        is lazy, loaded only when a signed-in user picks a plan.
     2. It must work SIGNED OUT. "Your card expired, here's a link" is
        the main way people arrive here, and requiring a login first
        would strand exactly the customer we're trying to keep.
═════════════════════════════════════════════════════════════════ */

var statusEl = document.querySelector('[data-pay-status]');
var fallbackEl = document.querySelector('[data-pay-fallback]');

function say(msg) { if (statusEl) statusEl.textContent = msg; }

function showFallback() {
  if (statusEl) statusEl.hidden = true;
  if (fallbackEl) fallbackEl.hidden = false;
}

// Landing here without a transaction is a dead end — someone bookmarked the
// page or the link lost its query string. Point them somewhere useful rather
// than spinning forever.
var hasTransaction = new URLSearchParams(window.location.search).has('_ptxn');
if (!hasTransaction) {
  showFallback();
} else {
  say('Opening secure checkout…');

  fetch('/api/billing/paddle/config', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) {
      if (!cfg || !cfg.clientToken) throw new Error('not-configured');
      return new Promise(function (resolve, reject) {
        var el = document.createElement('script');
        el.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
        el.async = true;
        el.onload = function () {
          var opts = { token: cfg.clientToken };
          if (cfg.environment === 'sandbox') opts.environment = 'sandbox';
          try {
            // Paddle.js reads `_ptxn` off the URL and opens the checkout
            // itself the moment this returns — nothing else to call.
            window.Paddle.Initialize(opts);
            resolve();
          } catch (err) { reject(err); }
        };
        el.onerror = function () { reject(new Error('paddle-js-failed')); };
        document.head.appendChild(el);
      });
    })
    .then(function () {
      // The overlay covers the page; this only shows if it's slow to paint.
      say('Secure checkout is open. If nothing appears, refresh this page.');
    })
    .catch(function () {
      say('');
      showFallback();
    });
}
