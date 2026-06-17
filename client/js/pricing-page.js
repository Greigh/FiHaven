/* ═══════════════════════════════════════════════════════════
   pricing-page.js — show which Stripe billing intervals are live.
═══════════════════════════════════════════════════════════ */

function initPricingPlans() {
  var el = document.querySelector('[data-stripe-plans]');
  if (!el) return;

  fetch('/api/billing/stripe/config', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.configured || !data.plans || !data.plans.length) {
        el.textContent = 'Sign in to see current Pro pricing at checkout.';
        return;
      }
      var labels = data.plans.map(function (p) { return p.label; });
      el.textContent = 'Web checkout currently offers: ' + labels.join(', ') + '. Exact prices are shown before you pay.';
    })
    .catch(function () {
      el.textContent = 'Sign in to see current Pro pricing at checkout.';
    });
}

initPricingPlans();
