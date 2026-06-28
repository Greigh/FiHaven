/* ═══════════════════════════════════════════════════════════
   pro.js — FiHaven Pro overlay, opened from the appbar menu
   (and from the in-app Pro nudge). Holds the whole subscription
   flow: status, Stripe checkout, manage portal, and promo
   redemption. Entitlement is server-authoritative — this UI just
   reads /api/billing/status and kicks off checkout/portal.

   Moved here (out of the Settings page) so Pro lives in the menu
   on every authed page. Importing this module also wires the
   Stripe Checkout return handler, so landing back on any page
   with ?pro=success|cancel pops the dialog with the result.
═══════════════════════════════════════════════════════════ */

var overlay = null;

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

var PLAN_LABELS = { trial: 'Trial', monthly: 'Monthly', three_month: '3 months', yearly: 'Yearly' };

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
      '<p style="margin:8px 0 0;color:var(--muted);font-size:14px;">' +
        'Pro unlocks payoff planning, family sharing, calendar, history, rewards, subscriptions, category budgets, bank linking, and autopay mark — across web, iOS, and Android.' +
      '</p>' +
      '<ul class="pro-features" style="list-style:none;padding:0;margin:14px 0 0;display:grid;gap:8px;">' +
        proFeature('Debt payoff planner — snowball & avalanche projections') +
        proFeature('Family sharing — share bills, cards & goals with your household') +
        proFeature('Due-date calendar + iCal subscription') +
        proFeature('Full payment history & CSV exports') +
        proFeature('Rewards optimizer — best card for each purchase') +
        proFeature('Subscription finder — recurring charges & price hikes') +
        proFeature('Category budgets in Spending') +
        proFeature('Optional bank linking to auto-fetch balances') +
        proFeature('Autopay mark — auto-mark items paid on due date') +
      '</ul>' +
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
      '<div data-pro-upgrade hidden style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;"></div>' +
      '<div data-pro-manage-wrap hidden style="margin-top:14px;">' +
        '<button class="btn btn-secondary" type="button" data-pro-manage>Manage subscription</button>' +
      '</div>' +
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
function render(ent) {
  var statusCard = overlay.querySelector('[data-pro-status-card]');
  var detailsCard = overlay.querySelector('[data-pro-details-card]');
  var upgradeWrap = overlay.querySelector('[data-pro-upgrade]');
  var manageWrap = overlay.querySelector('[data-pro-manage-wrap]');

  var isPro = !!(ent && ent.pro);

  if (upgradeWrap) {
    upgradeWrap.style.display = isPro ? 'none' : 'flex';
  }
  if (manageWrap) {
    manageWrap.style.display = isPro ? 'block' : 'none';
  }

  if (isPro) {
    if (statusCard) statusCard.style.display = 'none';
    if (detailsCard) {
      detailsCard.style.display = 'flex';
      detailsCard.querySelector('[data-pro-detail-status]').textContent = statusLabel(ent);

      var providerEl = detailsCard.querySelector('[data-pro-provider]');
      var providerRow = detailsCard.querySelector('[data-pro-provider-row]');
      var providers = { stripe: 'Stripe', apple: 'App Store (iOS)', google: 'Play Store (Android)', promo: 'Promo Code' };
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
    if (res.ok && res.data) render(res.data.entitlement);
  }).catch(function () { /* leave default */ });
}

// After a successful checkout, Stripe redirects us back before its
// `checkout.session.completed` webhook has necessarily landed, so the first
// status read can still say Free. Poll a few times until Pro shows up (or we
// give up) so the UI reflects the new subscription without a manual reload.
function pollUntilPro(attempt) {
  attempt = attempt || 0;
  return billingFetch('status').then(function (res) {
    var ent = res.ok && res.data ? res.data.entitlement : null;
    if (ent) render(ent);
    if (ent && ent.pro) return true;
    if (attempt >= 5) return false;
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(pollUntilPro(attempt + 1)); }, 1500);
    });
  }).catch(function () { return false; });
}

function startCheckout(plan, btn) {
  btn.disabled = true;
  setMsg('Redirecting to checkout…', false);
  billingFetch('stripe/checkout', 'POST', { plan: plan }).then(function (res) {
    if (res.ok && res.data && res.data.url) {
      window.location.assign(res.data.url);
    } else {
      btn.disabled = false;
      setMsg('Could not start checkout. Please try again.', true);
    }
  }).catch(function () { btn.disabled = false; setMsg('Could not reach the server. Please try again.', true); });
}

function renderPlans(plans) {
  var upgradeWrap = overlay.querySelector('[data-pro-upgrade]');
  if (!upgradeWrap) return;
  upgradeWrap.style.flexDirection = 'column';
  upgradeWrap.innerHTML = '';
  var list = plans || [];
  if (!list.length) {
    upgradeWrap.innerHTML = '<span style="color:var(--muted);font-size:14px;">Plans aren’t available right now.</span>';
    return;
  }
  list.forEach(function (p) {
    var isTrial = p.plan === 'trial';
    var isBest = p.plan === 'yearly';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pro-plan' + (isBest ? ' pro-plan-best' : '');
    btn.setAttribute('data-pro-plan', p.plan);
    btn.innerHTML =
      '<span class="pro-plan-name">' + (isTrial ? 'Start free trial' : (p.label || p.plan)) + '</span>' +
      (isBest ? '<span class="pro-plan-badge">Best value</span>' : '') +
      '<span class="pro-plan-cta">' + (isTrial ? 'Try free' : 'Choose') + ' ›</span>';
    btn.addEventListener('click', function () { startCheckout(p.plan, btn); });
    upgradeWrap.appendChild(btn);
  });
}

function wire() {
  var manageBtn = overlay.querySelector('[data-pro-manage]');
  if (manageBtn) {
    manageBtn.addEventListener('click', function () {
      manageBtn.disabled = true;
      billingFetch('stripe/portal', 'POST').then(function (res) {
        if (res.ok && res.data && res.data.url) {
          window.location.assign(res.data.url);
        } else {
          manageBtn.disabled = false;
          setMsg('The manage portal isn’t available yet.', true);
        }
      }).catch(function () { manageBtn.disabled = false; setMsg('Could not reach the server. Please try again.', true); });
    });
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

  // Plans are static per server config — fetch once when the dialog is built.
  billingFetch('stripe/config').then(function (res) {
    renderPlans(res.ok && res.data ? res.data.plans : null);
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

/* ── Stripe Checkout return handler ───────────────────────── */
// Stripe sends the user back to /settings?pro=success|cancel. Since
// Pro now lives in the menu, catch that here (this module loads via
// navbar.js on every authed page) and surface the result.
(function handleCheckoutReturn() {
  var params = new URLSearchParams(window.location.search);
  var pro = params.get('pro');
  // success|cancel come back from Stripe Checkout; open is the onboarding
  // "Get Pro" hand-off, which just pops the dialog.
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
