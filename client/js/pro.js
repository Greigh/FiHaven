/* ═══════════════════════════════════════════════════════════
   pro.js — FiHaven Pro overlay, opened from the appbar menu
   (and from the in-app Pro nudge). Holds the whole subscription
   flow: status, Paddle checkout, manage portal, and promo
   redemption. Entitlement is server-authoritative — this UI just
   reads /api/billing/status and kicks off checkout/portal.

   Paddle is the merchant of record and opens checkout as an OVERLAY
   rather than a redirect, so a successful purchase never leaves the
   page: the `checkout.completed` callback polls until the webhook has
   granted entitlement. The ?pro= return handler is kept for the portal
   round-trip and the onboarding hand-off.
═══════════════════════════════════════════════════════════ */

var overlay = null;
var lastBilling = { paddlePortal: false, plans: null };
var paddleReady = null;    // Promise, resolved once Paddle.js is initialized
var paddleConfig = null;   // { clientToken, environment, plans }

function billingNote(ent) {
  if (!ent || !ent.pro) return '';
  switch (ent.source) {
    case 'comp': return 'You have complimentary Pro access — no subscription to manage.';
    case 'promo': return 'Your Pro access is from a promo code — no subscription to manage.';
    case 'apple': return 'Manage this subscription in the App Store (Settings → Subscriptions).';
    case 'google': return 'Manage this subscription in Google Play (Subscriptions).';
    default: return '';
  }
}

function portalError(code, ent) {
  switch (code) {
    case 'not-paddle-subscriber': return billingNote(ent) || 'No web subscription is linked to this account.';
    case 'portal-customer-missing':
      return 'We couldn’t find your billing profile. Contact support if this persists.';
    case 'portal-failed':
      return 'The billing portal couldn’t be opened. Please try again.';
    default:
      return 'The billing portal isn’t available right now. Please try again later.';
  }
}

/* ── CSRF + fetch helpers ─────────────────────────────────── */
function csrf() {
  var auth = window.AppAuth;
  var t = auth && auth.getCsrfToken && auth.getCsrfToken();
  if (t) return Promise.resolve(t);
  return auth.me().then(function () { return auth.getCsrfToken(); });
}

function billingFetch(path, method, body) {
  if (!method || method === 'GET') {
    return fetch('/api/billing/' + path, { credentials: 'same-origin' }).then(toResult);
  }
  return csrf().then(function (token) {
    var opts = { method: method, headers: { 'X-CSRF-Token': token || '' }, credentials: 'same-origin' };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch('/api/billing/' + path, opts).then(toResult);
  });
}

function toResult(r) {
  return r.json().catch(function () { return {}; })
    .then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
}

// `family` matters here: billing.js issues plan:'family' for both the Paddle
// Family price and the app.fihaven.pro.family IAP, and without a label a Family
// subscriber falls through to a bare "Pro".
var PLAN_LABELS = {
  trial: 'Trial', monthly: 'Monthly', three_month: '3 months', yearly: 'Yearly', family: 'Family',
};

function statusLabel(ent) {
  if (!ent || !ent.pro) return 'Free';
  if (ent.source === 'promo') return 'Pro · Promo';
  if (ent.plan && PLAN_LABELS[ent.plan]) return 'Pro · ' + PLAN_LABELS[ent.plan];
  return 'Pro';
}

function promoError(code) {
  switch (code) {
    case 'already-redeemed': return 'You’ve already used that code.';
    case 'code-exhausted': return 'That code has reached its limit.';
    case 'code-expired': return 'That code has expired.';
    case 'invalid-code': return 'That code isn’t valid.';
    default: return 'Could not redeem that code.';
  }
}

function setMsg(text, isError) {
  var el = overlay && overlay.querySelector('[data-pro-msg]');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isError ? 'var(--red)' : 'var(--green)';
}

/* ── Overlay shell ────────────────────────────────────────── */
function build() {
  overlay = document.createElement('div');
  overlay.className = 'pro-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:1000;display:flex;align-items:flex-start;justify-content:center;' +
    'padding:40px 16px;overflow:auto;background:rgba(0,0,0,.45);';
  overlay.innerHTML =
    '<div class="pro-panel auth-card" role="dialog" aria-modal="true" aria-label="FiHaven Pro" style="' +
      'width:min(560px,100%);margin:0;box-shadow:0 24px 60px rgba(0,0,0,.35);">' +
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<span class="pro-crown" aria-hidden="true" style="display:inline-flex;color:var(--accent);">' +
          '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"><path d="M5 16l-1.2-8 4.7 3.4L12 6l3.5 5.4L20 8l-1.2 8H5z"/><path d="M5 19h14"/></svg>' +
        '</span>' +
        '<strong style="font-size:20px;letter-spacing:-.03em;flex:1;">FiHaven Pro</strong>' +
        '<button type="button" data-pro-close aria-label="Close" style="' +
          'background:none;border:none;color:var(--muted);font-size:22px;line-height:1;cursor:pointer;padding:4px 8px;">×</button>' +
      '</div>' +
      '<p style="margin:10px 0 0;font-size:20px;font-weight:700;letter-spacing:-.02em;">' +
        'Turn your bills into a payoff plan.' +
      '</p>' +
      '<p style="margin:6px 0 0;color:var(--muted);font-size:14px;">' +
        'Every planning tool FiHaven has, on web, iOS and Android.' +
      '</p>' +
      // Three bullets carry the pitch. Eight of them above the price meant a
      // wall to scroll past before learning what Pro costs, so the rest sit
      // behind "See everything in Pro".
      //
      // Family sharing is deliberately not a bullet in either list: creating a
      // household needs the separate Family subscription (billing.js:
      // HOUSEHOLD_MAX_PRO is 0), which appears as its own card below.
      '<ul class="pro-features" style="list-style:none;padding:0;margin:14px 0 0;display:grid;gap:8px;">' +
        proFeature('Debt payoff planner — snowball & avalanche projections') +
        proFeature('Rewards optimizer — best card for each purchase') +
        proFeature('Subscription finder — recurring charges & price hikes') +
      '</ul>' +
      '<ul class="pro-features" data-pro-more-features hidden style="list-style:none;padding:0;margin:8px 0 0;display:grid;gap:8px;">' +
        proFeature('Due-date calendar + iCal subscription') +
        proFeature('Full payment history & CSV exports') +
        proFeature('Category budgets in Spending') +
        proFeature('Optional bank linking to auto-fetch balances') +
        proFeature('Autopay mark — auto-mark items paid on due date') +
      '</ul>' +
      '<button type="button" class="pro-more-toggle" data-pro-more aria-expanded="false" style="margin-top:10px;">' +
        'See everything in Pro' +
      '</button>' +
      '<div data-pro-status-card class="card" style="padding:14px 16px;margin-top:16px;display:flex;align-items:center;gap:10px;">' +
        '<span class="section-title" style="font-size:12px;">Status</span>' +
        '<span data-pro-status style="font-weight:600;margin-left:auto;">…</span>' +
      '</div>' +
      '<div data-pro-details-card style="display:none;flex-direction:column;gap:8px;padding:14px 16px;margin-top:16px;" class="card">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<span class="section-title" style="font-size:12px;">Status</span>' +
          '<span data-pro-detail-status style="font-weight:600;margin-left:auto;color:var(--green);">…</span>' +
        '</div>' +
        '<div data-pro-provider-row style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted);">' +
          '<span>Provider</span>' +
          '<span data-pro-provider style="margin-left:auto;color:var(--text);">…</span>' +
        '</div>' +
        '<div data-pro-expiry-row style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--muted);">' +
          '<span data-pro-expiry-label>Renews</span>' +
          '<span data-pro-expiry style="margin-left:auto;color:var(--text);">…</span>' +
        '</div>' +
      '</div>' +
      '<div data-pro-upgrade hidden style="margin-top:14px;display:grid;gap:10px;"></div>' +
      '<div data-pro-manage-wrap hidden style="margin-top:14px;">' +
        '<button class="btn btn-secondary" type="button" data-pro-manage>Manage subscription</button>' +
      '</div>' +
      '<div data-pro-billing-note hidden style="margin-top:10px;font-size:13px;color:var(--muted);line-height:1.45;"></div>' +
      '<div data-pro-msg aria-live="polite" style="margin-top:10px;min-height:1em;font-size:14px;"></div>' +
      '<form data-pro-promo style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px;">' +
        '<label for="pro-promo-code" style="display:block;font-size:13px;color:var(--muted);margin-bottom:6px;">Have a promo code?</label>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<input type="text" id="pro-promo-code" autocomplete="off" autocapitalize="characters" placeholder="e.g. FREEPRO30" style="' +
            'flex:1;min-width:160px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2,var(--surface));color:var(--text);"/>' +
          '<button class="btn btn-secondary" type="submit">Redeem</button>' +
        '</div>' +
        '<div data-pro-promo-msg aria-live="polite" style="margin-top:8px;min-height:1em;font-size:13px;"></div>' +
      '</form>' +
    '</div>';

  overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) hide(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);

  overlay.querySelector('[data-pro-close]').addEventListener('click', hide);
  wire();
}

function proFeature(text) {
  return (
    '<li style="display:flex;gap:8px;align-items:flex-start;font-size:14px;color:var(--text);">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--green)" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" style="flex:none;margin-top:1px;"><path d="M20 6L9 17l-5-5"/></svg>' +
      '<span>' + text + '</span>' +
    '</li>'
  );
}

function onKey(e) {
  if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') hide();
}

function hide() { if (overlay) overlay.style.display = 'none'; }

/* ── Status + plans + actions ─────────────────────────────── */
function render(ent, billingMeta) {
  if (billingMeta) {
    lastBilling.paddlePortal = !!billingMeta.paddlePortal;
    if (billingMeta.paddleCustomerId) lastBilling.paddleCustomerId = billingMeta.paddleCustomerId;
    if (billingMeta.entitlement !== undefined) lastBilling.entitlement = billingMeta.entitlement;
  }
  if (ent) lastBilling.entitlement = ent;
  var statusCard = overlay.querySelector('[data-pro-status-card]');
  var detailsCard = overlay.querySelector('[data-pro-details-card]');
  var upgradeWrap = overlay.querySelector('[data-pro-upgrade]');
  var manageWrap = overlay.querySelector('[data-pro-manage-wrap]');
  var billingNoteEl = overlay.querySelector('[data-pro-billing-note]');

  var isPro = !!(ent && ent.pro);
  var canManageSub = !!(isPro && lastBilling.paddlePortal);

  // renderPlans decides visibility now: hidden only for Family subscribers,
  // who have nothing left to upgrade to. Solo Pro still gets the Family row.
  if (upgradeWrap) renderPlans();
  if (manageWrap) {
    manageWrap.style.display = canManageSub ? 'block' : 'none';
  }
  if (billingNoteEl) {
    var note = isPro && !canManageSub ? billingNote(ent) : '';
    billingNoteEl.textContent = note;
    billingNoteEl.hidden = !note;
  }

  if (isPro) {
    if (statusCard) statusCard.style.display = 'none';
    if (detailsCard) {
      detailsCard.style.display = 'flex';
      detailsCard.querySelector('[data-pro-detail-status]').textContent = statusLabel(ent);

      var providerEl = detailsCard.querySelector('[data-pro-provider]');
      var providerRow = detailsCard.querySelector('[data-pro-provider-row]');
      var providers = { paddle: 'Paddle', apple: 'App Store (iOS)', google: 'Play Store (Android)', promo: 'Promo Code', comp: 'Complimentary' };
      var providerName = providers[ent.source] || (ent.source ? ent.source.charAt(0).toUpperCase() + ent.source.slice(1) : '');
      if (providerName) {
        providerEl.textContent = providerName;
        providerRow.style.display = 'flex';
      } else {
        providerRow.style.display = 'none';
      }

      var expiryEl = detailsCard.querySelector('[data-pro-expiry]');
      var expiryLabel = detailsCard.querySelector('[data-pro-expiry-label]');
      var expiryRow = detailsCard.querySelector('[data-pro-expiry-row]');
      if (ent.expiresAt) {
        var date = new Date(ent.expiresAt);
        expiryEl.textContent = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        expiryLabel.textContent = ent.autoRenew ? 'Renews' : 'Expires';
        expiryRow.style.display = 'flex';
      } else {
        expiryRow.style.display = 'none';
      }
    }
  } else {
    if (statusCard) {
      statusCard.style.display = 'flex';
      var statusEl = statusCard.querySelector('[data-pro-status]');
      if (statusEl) {
        statusEl.textContent = 'Free';
        statusEl.style.color = 'var(--muted)';
      }
    }
    if (detailsCard) detailsCard.style.display = 'none';
  }
}

function refresh() {
  return billingFetch('status').then(function (res) {
    if (res.ok && res.data) {
      render(res.data.entitlement, {
        paddlePortal: !!res.data.paddlePortal,
        paddleCustomerId: res.data.paddleCustomerId,
      });
    }
  }).catch(function () { /* leave default */ });
}

// Paddle's overlay closes as soon as payment succeeds, which is usually
// BEFORE its `subscription.created` webhook reaches us — so the first status
// read can still say Free. Poll a few times until Pro shows up (or we give
// up) so the UI reflects the new subscription without a manual reload.
function pollUntilPro(attempt) {
  attempt = attempt || 0;
  return billingFetch('status').then(function (res) {
    var ent = res.ok && res.data ? res.data.entitlement : null;
    if (ent) render(ent, {
      paddlePortal: !!(res.data && res.data.paddlePortal),
      paddleCustomerId: res.data && res.data.paddleCustomerId,
    });
    if (ent && ent.pro) return true;
    if (attempt >= 5) return false;
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(pollUntilPro(attempt + 1)); }, 1500);
    });
  }).catch(function () { return false; });
}

/* ── Paddle.js ────────────────────────────────────────────── */

// Load Paddle.js on demand and initialize it once. The client-side token is
// public by design (it ships in the bundle); nothing secret passes through
// here. `pwCustomer` powers Paddle Retain and MUST be the Paddle customer id
// — an internal id or an email silently disables Retain's dunning flows.
function loadPaddle() {
  if (paddleReady) return paddleReady;
  paddleReady = new Promise(function (resolve, reject) {
    if (!paddleConfig || !paddleConfig.clientToken) { reject(new Error('not-configured')); return; }
    function init() {
      var opts = { token: paddleConfig.clientToken };
      // Live is Paddle.js's default; only sandbox needs saying out loud.
      if (paddleConfig.environment === 'sandbox') opts.environment = 'sandbox';
      if (lastBilling.paddleCustomerId) opts.pwCustomer = { id: lastBilling.paddleCustomerId };
      // The overlay closes on success without navigating anywhere, so this is
      // the only signal that a purchase happened. Entitlement still comes from
      // the webhook — we just poll until it lands rather than trusting the
      // client, which could otherwise be spoofed into showing Pro.
      opts.eventCallback = function (ev) {
        if (!ev || ev.name !== 'checkout.completed') return;
        setMsg('Thanks! Confirming your Pro subscription…', false);
        pollUntilPro().then(function (active) {
          setMsg(
            active
              ? 'Your Pro subscription is now active.'
              : 'Payment received — your Pro access will activate shortly. Refresh in a moment if it hasn’t.',
            !active
          );
        });
      };
      try { window.Paddle.Initialize(opts); resolve(window.Paddle); }
      catch (err) { reject(err); }
    }
    if (window.Paddle) { init(); return; }
    var el = document.createElement('script');
    el.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    el.async = true;
    el.onload = init;
    el.onerror = function () { reject(new Error('paddle-js-failed')); };
    document.head.appendChild(el);
  }).catch(function (err) {
    paddleReady = null;   // let a later attempt retry rather than stay broken
    throw err;
  });
  return paddleReady;
}

function startCheckout(plan, btn) {
  btn.disabled = true;
  setMsg('Opening checkout…', false);
  billingFetch('paddle/checkout', 'POST', { plan: plan }).then(function (res) {
    if (!res.ok || !res.data) {
      btn.disabled = false;
      setMsg(res.status === 409
        ? 'You already have a subscription — use Manage subscription to change plans.'
        : 'Could not start checkout. Please try again.', true);
      return;
    }
    // Local dev with no Paddle configured: the server granted Pro directly.
    if (res.data.devGranted) {
      btn.disabled = false;
      setMsg('Pro granted locally (no payment taken).', false);
      refresh();
      return;
    }
    var payload = res.data;
    loadPaddle().then(function (Paddle) {
      Paddle.Checkout.open({
        items: [{ priceId: payload.priceId, quantity: 1 }],
        // Prefilling skips Paddle's contact step for a signed-in user.
        customer: payload.email ? { email: payload.email } : undefined,
        // Echoed on every webhook for this subscription — this is how the
        // payment is attributed back to the account.
        customData: payload.customData,
        settings: { displayMode: 'overlay', theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' },
      });
      btn.disabled = false;
      setMsg('', false);
    }).catch(function () {
      btn.disabled = false;
      setMsg('Checkout couldn’t load. Check your connection and try again.', true);
    });
  }).catch(function () { btn.disabled = false; setMsg('Could not reach the server. Please try again.', true); });
}

// Changing an existing subscription's plan happens in the Paddle customer
// portal — opening checkout again would create a SECOND subscription.
function openPortal(btn) {
  btn.disabled = true;
  billingFetch('paddle/portal', 'POST').then(function (res) {
    if (res.ok && res.data && res.data.url) {
      window.location.assign(res.data.url);
    } else {
      btn.disabled = false;
      setMsg(portalError(res.data && res.data.error, lastBilling.entitlement), true);
    }
  }).catch(function () { btn.disabled = false; setMsg('Could not reach the server. Please try again.', true); });
}

/* ── Plan pricing ─────────────────────────────────────────── */

// Fallbacks for when Paddle hasn't priced the plans yet (or the call failed).
// The billing cycle Paddle reports is preferred everywhere below, so a new
// interval added to PADDLE_PLANS server-side needs no change here — which is
// the promise billing.js makes ("no other code changes").
var PLAN_MONTHS = { monthly: 1, three_month: 3, yearly: 12, family: 12 };
var INTERVAL_WORDS = { monthly: 'month', three_month: '3 months', yearly: 'year', family: 'year' };
// Longest interval first, so the best-value plan leads the list. `trial` is an
// entry offer rather than an interval, so it sorts last.
var PLAN_RANK = { yearly: 4, three_month: 3, monthly: 2, trial: 1 };

// How many months a plan's billing cycle covers — the basis for both the
// "Save N%" badge and the per-month restatement of a longer plan. 0 for a
// cycle no sensible monthly figure can be derived from (weekly, daily).
function monthsFor(plan) {
  var cycle = (priceFor(plan) || {}).cycle;
  if (cycle && cycle.interval) {
    var n = cycle.frequency || 1;
    if (cycle.interval === 'year') return n * 12;
    if (cycle.interval === 'month') return n;
    return 0;
  }
  return PLAN_MONTHS[plan.plan] || 0;
}

// "year", "3 months" — what the recurring price is charged per.
function intervalWords(plan) {
  var cycle = (priceFor(plan) || {}).cycle;
  if (cycle && cycle.interval) {
    var n = cycle.frequency || 1;
    return n === 1 ? cycle.interval : n + ' ' + cycle.interval + 's';
  }
  return INTERVAL_WORDS[plan.plan] || null;
}

// Minor units per major unit for a currency — 100 for USD, 1 for JPY. Paddle
// quotes amounts in minor units, so dividing by a hardcoded 100 would inflate
// a yen price a hundredfold.
function minorScale(currency) {
  try {
    var digits = new Intl.NumberFormat(undefined, { style: 'currency', currency: currency })
      .resolvedOptions().maximumFractionDigits;
    return Math.pow(10, digits);
  } catch (e) { return 100; }
}

function formatMoney(minor, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency })
      .format(minor / minorScale(currency));
  } catch (e) { return null; }
}

// The server only ever knows each plan's Paddle price ID, never its amount, so
// these rows used to carry no price at all. Paddle.js prices them in the
// visitor's own currency, and it's the same figure checkout will charge — which
// a hardcoded table here would drift from the first time a price moved in
// Paddle. Failure is survivable: rows fall back to name-only, as before.
function fetchPrices() {
  var list = (lastBilling.plans || []).filter(function (p) { return p.priceId; });
  if (!list.length) return Promise.resolve(null);
  return loadPaddle().then(function (Paddle) {
    return Paddle.PricePreview({
      items: list.map(function (p) { return { priceId: p.priceId, quantity: 1 }; }),
    });
  }).then(function (res) {
    var items = res && res.data && res.data.details && res.data.details.lineItems;
    if (!items || !items.length) return null;
    var byPriceId = {};
    items.forEach(function (item) {
      var price = item.price || {};
      var unit = price.unitPrice || {};
      if (!price.id) return;
      byPriceId[price.id] = {
        formatted: (item.formattedTotals && item.formattedTotals.subtotal) || null,
        amount: parseInt(unit.amount, 10),
        currency: unit.currencyCode || null,
        cycle: price.billingCycle || null,
        trial: price.trialPeriod || null,
      };
    });
    lastBilling.prices = byPriceId;
    return byPriceId;
  }).catch(function () { return null; });
}

function priceFor(plan) {
  return (lastBilling.prices || {})[plan.priceId] || null;
}

// "Save 37%" against the same span bought monthly. Only shown when both plans
// are priced, share a currency, and the saving is real and worth stating — the
// badge must always be derivable from the prices on screen.
function savingsFor(plan) {
  var months = monthsFor(plan);
  if (months < 2) return null;
  var price = priceFor(plan);
  // Whichever offered plan actually bills monthly, rather than whichever is
  // named "monthly".
  var monthlyPlan = (lastBilling.plans || []).filter(function (p) {
    return p.plan !== 'family' && monthsFor(p) === 1;
  })[0];
  var monthly = monthlyPlan && priceFor(monthlyPlan);
  if (!price || !monthly || !isFinite(price.amount) || !isFinite(monthly.amount)) return null;
  if (price.currency !== monthly.currency) return null;
  var full = monthly.amount * months;
  if (full <= 0 || price.amount >= full) return null;
  var pct = Math.round((full - price.amount) / full * 100);
  return pct >= 5 ? pct : null;
}

// A multi-month plan restated per month ("$1.25/mo billed annually").
function perMonthFor(plan) {
  var months = monthsFor(plan);
  var price = priceFor(plan);
  if (months < 2 || !price || !isFinite(price.amount) || !price.currency) return null;
  var money = formatMoney(price.amount / months, price.currency);
  if (!money) return null;
  return money + '/mo billed ' + (months === 12 ? 'annually' : 'every ' + months + ' months');
}

// "7 days" when the Paddle price carries a free trial.
function trialWords(plan) {
  var trial = (priceFor(plan) || {}).trial;
  if (!trial || !trial.frequency) return null;
  var count = trial.frequency;
  var unit = trial.interval;
  if (unit === 'week') { count *= 7; unit = 'day'; }
  return count + ' ' + unit + (count === 1 ? '' : 's');
}

// The full terms of the selected plan, restated under the button so the price
// being agreed to sits next to the click that agrees to it. The button itself
// never names a figure the checkout won't charge.
function termsFor(plan) {
  var price = priceFor(plan);
  var unit = intervalWords(plan);
  if (!price || !price.formatted) return '';
  // A plan whose cycle we can't name still states its price and that it
  // renews — silence would be the one unacceptable outcome here.
  var recurring = unit ? price.formatted + '/' + unit : price.formatted;
  var trial = trialWords(plan);
  return trial
    ? trial + ' free, then ' + recurring + '. Cancel before it renews.'
    : recurring + ', auto-renewing.';
}

/* ── Plan selector ────────────────────────────────────────── */

// `plans` is fetched once and cached; pass nothing to re-render against the
// current entitlement (or against prices that have just landed). An existing
// solo-Pro subscriber sees only the Family card — their upgrade path; a Family
// subscriber sees none.
function renderPlans(plans) {
  var upgradeWrap = overlay.querySelector('[data-pro-upgrade]');
  if (!upgradeWrap) return;
  if (plans !== undefined) lastBilling.plans = plans;
  upgradeWrap.innerHTML = '';

  var ent = lastBilling.entitlement;
  var isPro = !!(ent && ent.pro);
  var all = lastBilling.plans || [];
  // Only web (Paddle) subscribers can switch plans from here — an
  // Apple/Google/promo Pro has to change it where they bought it.
  var canSwitch = isPro && ent.plan !== 'family' && !!lastBilling.paddlePortal;
  var proPlans = isPro ? [] : all.filter(function (p) { return p.plan !== 'family'; });
  var family = (!isPro || canSwitch)
    ? all.filter(function (p) { return p.plan === 'family'; })[0]
    : null;

  if (!proPlans.length && !family) {
    // Nothing to offer: for a subscriber that's expected (hide the block); for
    // a free user it means the server has no prices configured.
    if (isPro) {
      upgradeWrap.style.display = 'none';
    } else {
      upgradeWrap.textContent = 'Plans aren’t available right now.';
      upgradeWrap.style.cssText = 'margin-top:14px;color:var(--muted);font-size:14px;display:block;';
    }
    return;
  }
  upgradeWrap.style.cssText = 'margin-top:14px;display:grid;gap:10px;';

  if (proPlans.length) {
    proPlans.sort(function (a, b) { return (PLAN_RANK[b.plan] || 0) - (PLAN_RANK[a.plan] || 0); });
    // Yearly is preselected — it's the plan most people want and the one the
    // savings badge is about. The choice survives re-renders (prices arrive
    // asynchronously) but is re-seeded whenever it's no longer on offer.
    var stillOffered = proPlans.filter(function (p) { return p.plan === lastBilling.selectedPlan; }).length;
    if (!stillOffered) {
      var preferred = proPlans.filter(function (p) { return p.plan === 'yearly'; })[0] || proPlans[0];
      lastBilling.selectedPlan = preferred.plan;
    }
    var group = document.createElement('div');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Choose a plan');
    group.style.cssText = 'display:grid;gap:10px;';
    proPlans.forEach(function (p) { group.appendChild(planRow(p)); });
    upgradeWrap.appendChild(group);
    upgradeWrap.appendChild(buyBlock(proPlans));
  }
  if (family) upgradeWrap.appendChild(familyCard(family, isPro));
}

// A row SELECTS a plan. It used to open Paddle checkout on click, which made a
// mis-click a purchase attempt and left no way to compare the plans first.
function planRow(plan) {
  var selected = plan.plan === lastBilling.selectedPlan;
  var price = priceFor(plan);
  var savings = savingsFor(plan);

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pro-plan';
  btn.setAttribute('role', 'radio');
  btn.setAttribute('aria-checked', selected ? 'true' : 'false');
  btn.setAttribute('data-pro-plan', plan.plan);

  var dot = document.createElement('span');
  dot.className = 'pro-plan-radio';
  dot.setAttribute('aria-hidden', 'true');
  btn.appendChild(dot);

  var main = document.createElement('span');
  main.className = 'pro-plan-main';
  var name = document.createElement('span');
  name.className = 'pro-plan-name';
  name.appendChild(document.createTextNode(plan.label || plan.plan));
  if (savings) {
    var save = document.createElement('span');
    save.className = 'pro-plan-save';
    save.textContent = 'Save ' + savings + '%';
    name.appendChild(save);
  }
  main.appendChild(name);
  // Price, per-month equivalent and any trial stay visible on every row, not
  // just the selected one.
  var trial = trialWords(plan);
  [perMonthFor(plan), trial ? 'Includes ' + trial + ' free' : null].forEach(function (text) {
    if (!text) return;
    var sub = document.createElement('span');
    sub.className = 'pro-plan-sub';
    sub.textContent = text;
    main.appendChild(sub);
  });
  btn.appendChild(main);

  if (price && price.formatted) {
    var amount = document.createElement('span');
    amount.className = 'pro-plan-price';
    amount.textContent = price.formatted;
    btn.appendChild(amount);
  }
  btn.addEventListener('click', function () {
    lastBilling.selectedPlan = plan.plan;
    renderPlans();
  });
  return btn;
}

// The one primary button, plus the exact terms of whatever is selected and the
// trust line, so both sit with the click rather than in the fine print.
function buyBlock(proPlans) {
  var plan = proPlans.filter(function (p) { return p.plan === lastBilling.selectedPlan; })[0] || proPlans[0];
  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:grid;gap:8px;margin-top:4px;';

  var trial = trialWords(plan);
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary';
  btn.setAttribute('data-pro-buy', '');
  btn.textContent = trial ? 'Start ' + trial + ' free' : 'Subscribe';
  btn.addEventListener('click', function () { startCheckout(plan.plan, btn); });
  wrap.appendChild(btn);

  var terms = termsFor(plan);
  if (terms) {
    var termsEl = document.createElement('div');
    termsEl.className = 'pro-terms';
    termsEl.textContent = terms;
    wrap.appendChild(termsEl);
  }
  var trust = document.createElement('div');
  trust.className = 'pro-trust';
  trust.textContent = 'Cancel anytime · Your data is never sold';
  wrap.appendChild(trust);
  return wrap;
}

// Family is a separate subscription, not a Pro interval — it's the only plan
// that unlocks a shared household, so it gets its own card rather than a row in
// the selector, where it would look like a third billing period.
function familyCard(plan, isPro) {
  var price = priceFor(plan);
  var card = document.createElement('div');
  card.className = 'card';
  card.style.cssText = 'display:grid;gap:8px;padding:14px 16px;margin-top:4px;';

  var head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:8px;';
  var label = plan.label || 'Family';
  var name = document.createElement('strong');
  name.textContent = label;
  head.appendChild(name);
  // The tier pill only earns its place when the plan's own label doesn't
  // already say "Family" — otherwise the header reads "Family FAMILY".
  if (!/family/i.test(label)) {
    var badge = document.createElement('span');
    badge.className = 'pro-plan-badge';
    badge.textContent = 'Family';
    head.appendChild(badge);
  }
  if (price && price.formatted) {
    var amount = document.createElement('span');
    amount.className = 'pro-plan-price';
    amount.style.marginLeft = 'auto';
    var unit = intervalWords(plan);
    amount.textContent = unit ? price.formatted + '/' + unit : price.formatted;
    head.appendChild(amount);
  }
  card.appendChild(head);

  var blurb = document.createElement('div');
  blurb.className = 'pro-plan-sub';
  blurb.textContent = 'Everything in Pro, plus a shared household — share bills, cards & goals '
    + 'with up to 3 people. Joining a household is always free.';
  card.appendChild(blurb);

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-secondary';
  btn.textContent = isPro ? 'Upgrade to Family' : 'Get the Family plan';
  // An existing subscriber changes plan in the Billing Portal; checkout would
  // open a second subscription (the server now rejects that with 409 too).
  btn.addEventListener('click', function () {
    if (isPro) openPortal(btn); else startCheckout(plan.plan, btn);
  });
  card.appendChild(btn);
  return card;
}

function wire() {
  var manageBtn = overlay.querySelector('[data-pro-manage]');
  if (manageBtn) {
    manageBtn.addEventListener('click', function () { openPortal(manageBtn); });
  }

  var promoForm = overlay.querySelector('[data-pro-promo]');
  if (promoForm) {
    promoForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var input = overlay.querySelector('#pro-promo-code');
      var msg = overlay.querySelector('[data-pro-promo-msg]');
      var code = (input.value || '').trim();
      if (!code) return;
      function promoMsg(text, isError) { msg.textContent = text; msg.style.color = isError ? 'var(--red)' : 'var(--green)'; }
      promoMsg('Redeeming…', false);
      billingFetch('promo/redeem', 'POST', { code: code }).then(function (res) {
        if (res.ok) {
          if (res.data && res.data.kind === 'store_offer') {
            promoMsg('That code applies in the app stores — redeem it on iOS or Android.', false);
          } else {
            promoMsg('Code applied — you’re now on FiHaven Pro!', false);
          }
          refresh();
        } else {
          promoMsg(promoError(res.data && res.data.error), true);
        }
      }).catch(function () { promoMsg('Could not reach the server. Please try again.', true); });
    });
  }

  var moreBtn = overlay.querySelector('[data-pro-more]');
  if (moreBtn) {
    moreBtn.addEventListener('click', function () {
      var list = overlay.querySelector('[data-pro-more-features]');
      if (!list) return;
      var opening = list.hidden;
      list.hidden = !opening;
      moreBtn.setAttribute('aria-expanded', opening ? 'true' : 'false');
      moreBtn.textContent = opening ? 'Show less' : 'See everything in Pro';
    });
  }

  // Plans are static per server config — fetch once when the dialog is built.
  billingFetch('paddle/config').then(function (res) {
    if (res.ok && res.data) paddleConfig = res.data;
    renderPlans(res.ok && res.data ? res.data.plans : null);
    // Amounts come from Paddle rather than our server, so paint the rows now
    // and fill the prices in when they land.
    fetchPrices().then(function (prices) { if (prices) renderPlans(); });
  }).catch(function () { renderPlans(null); });
}

/* ── Public entry (wired from the appbar menu / Pro nudge) ─── */
export function openProDialog() {
  if (!overlay) build();
  overlay.style.display = 'flex';
  setMsg('', false);
  refresh();
}

// Expose for non-module callers (e.g. inline onclick from a nudge).
window.openProDialog = openProDialog;

/* ── In-app Pro nudge ─────────────────────────────────────── */
// A first-party, dismissible upgrade card on the dashboard, shown only
// to Free users. It's plain product UI (no ad network, neutral class
// names) so ad blockers leave it alone, and it stays out of the way:
// one line, a single CTA, and a dismiss that hides it for a week.
var NUDGE_KEY = 'fh_pro_nudge_until';
var NUDGE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function snoozedUntil() {
  try { return parseInt(localStorage.getItem(NUDGE_KEY) || '0', 10) || 0; } catch (e) { return 0; }
}

function renderNudge(slot) {
  var card = document.createElement('div');
  card.className = 'pro-nudge';
  card.setAttribute('role', 'note');
  card.innerHTML =
    '<span class="pro-nudge-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"><path d="M5 16l-1.2-8 4.7 3.4L12 6l3.5 5.4L20 8l-1.2 8H5z"/><path d="M5 19h14"/></svg>' +
    '</span>' +
    '<div class="pro-nudge-copy">' +
      '<strong>Go further with FiHaven Pro</strong>' +
      '<span>Unlock payoff planning, rewards, subscriptions, and more with FiHaven Pro.</span>' +
    '</div>' +
    '<button type="button" class="btn btn-primary pro-nudge-cta">Upgrade</button>' +
    '<button type="button" class="pro-nudge-dismiss" aria-label="Dismiss">×</button>';

  card.querySelector('.pro-nudge-cta').addEventListener('click', openProDialog);
  card.querySelector('.pro-nudge-dismiss').addEventListener('click', function () {
    try { localStorage.setItem(NUDGE_KEY, String(Date.now() + NUDGE_SNOOZE_MS)); } catch (e) { /* ignore */ }
    card.remove();
  });
  slot.appendChild(card);
}

(function initProNudge() {
  var slot = document.querySelector('[data-pro-nudge-slot]');
  if (!slot) return;                       // dashboard-only
  if (Date.now() < snoozedUntil()) return; // recently dismissed
  billingFetch('status').then(function (res) {
    var ent = res.ok && res.data ? res.data.entitlement : null;
    if (ent && ent.pro) return;            // never shown to Pro users
    renderNudge(slot);
  }).catch(function () { /* stay silent on failure */ });
})();

/* ── Checkout / portal return handler ─────────────────────── */
// Paddle checkout is an overlay and resolves in-page, so this mainly
// catches the customer-portal round-trip and the onboarding "Get Pro"
// hand-off. ?pro=success is still honored for any redirect-style return.
(function handleCheckoutReturn() {
  var params = new URLSearchParams(window.location.search);
  var pro = params.get('pro');
  // success|cancel may come back from a redirect-style return; open is the
  // onboarding "Get Pro" hand-off, which just pops the dialog.
  if (pro !== 'success' && pro !== 'cancel' && pro !== 'open') return;
  // Strip the param so a reload doesn't re-trigger.
  try {
    params.delete('pro');
    params.delete('session_id');
    var qs = params.toString();
    history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
  } catch (e) { /* ignore */ }
  openProDialog();
  if (pro === 'success') {
    setMsg('Thanks! Confirming your Pro subscription…', false);
    pollUntilPro().then(function (active) {
      setMsg(
        active
          ? 'Your Pro subscription is now active.'
          : 'Payment received — your Pro access will activate shortly. Refresh in a moment if it hasn’t.',
        !active
      );
    });
  } else if (pro === 'cancel') setMsg('Checkout cancelled — no charge was made.', true);
})();
