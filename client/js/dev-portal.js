// JS for dev-portal.html
import './theme.js';
import './auth.js';

var statusEl = document.querySelector('[data-dev-status]');
var detailsRow = document.querySelector('[data-dev-details-row]');
var providerEl = document.querySelector('[data-dev-provider]');
var expiryLabel = document.querySelector('[data-dev-expiry-label]');
var expiryEl = document.querySelector('[data-dev-expiry]');
var msgEl = document.querySelector('[data-dev-msg]');
var cancelBtn = document.querySelector('[data-cancel-btn]');

function setMsg(text, isError) {
  msgEl.textContent = text || '';
  msgEl.style.color = isError ? 'var(--red)' : 'var(--green)';
}

function csrf() {
  return window.AppAuth ? window.AppAuth.getCsrfToken() : Promise.resolve('');
}

function post(path, body) {
  return csrf().then(token => {
    return fetch('/api/billing/' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token || ''
      },
      body: JSON.stringify(body)
    }).then(r => r.json().catch(() => ({})));
  });
}

var PLAN_LABELS = { trial: 'Trial', monthly: 'Monthly', three_month: '3 months', yearly: 'Yearly' };
var PROVIDER_LABELS = { stripe: 'Stripe', apple: 'App Store (iOS)', google: 'Play Store (Android)', promo: 'Promo Code' };

function refresh() {
  fetch('/api/billing/status')
    .then(r => r.json())
    .then(res => {
      var ent = res.entitlement;
      if (ent && ent.pro) {
        var planName = PLAN_LABELS[ent.plan] || ent.plan || 'Pro';
        statusEl.textContent = 'Pro (' + planName + ')';
        statusEl.style.color = 'var(--green)';
        detailsRow.hidden = false;
        providerEl.textContent = PROVIDER_LABELS[ent.source] || ent.source || 'Dev';
        if (ent.expiresAt) {
          var date = new Date(ent.expiresAt);
          expiryEl.textContent = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
          expiryLabel.textContent = ent.autoRenew ? 'Renews' : 'Expires';
        } else {
          expiryEl.textContent = 'Never';
          expiryLabel.textContent = 'Expires';
        }
        cancelBtn.disabled = false;
      } else {
        statusEl.textContent = 'Free';
        statusEl.style.color = 'var(--muted)';
        detailsRow.hidden = true;
        cancelBtn.disabled = true;
      }
    })
    .catch(err => {
      statusEl.textContent = 'Error loading status';
      statusEl.style.color = 'var(--red)';
    });
}

// Attach actions
document.querySelectorAll('[data-plan]').forEach(btn => {
  btn.addEventListener('click', () => {
    var plan = btn.getAttribute('data-plan');
    setMsg('Changing subscription plan...', false);
    post('stripe/portal/dev-change', { plan })
      .then(res => {
        if (res.entitlement) {
          setMsg('Subscription plan changed successfully!', false);
          refresh();
        } else {
          setMsg(res.error || 'Failed to change plan', true);
        }
      })
      .catch(err => {
        setMsg('Error communicating with server', true);
      });
  });
});

cancelBtn.addEventListener('click', () => {
  setMsg('Cancelling subscription...', false);
  post('stripe/portal/dev-cancel')
    .then(res => {
      if (res.entitlement) {
        setMsg('Subscription cancelled successfully!', false);
        refresh();
      } else {
        setMsg(res.error || 'Failed to cancel subscription', true);
      }
    })
    .catch(err => {
      setMsg('Error communicating with server', true);
    });
});

// Check auth, then init
if (window.AppAuth) {
  window.AppAuth.me().then(refresh).catch(() => {
    window.location.assign('/login');
  });
} else {
  refresh();
}
