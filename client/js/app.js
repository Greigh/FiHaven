/* ═══════════════════════════════════════════════════════════
   app.js — dashboard entry point.
   Loaded as a type="module" script: pulls in every dashboard
   module (each one self-registers its renderer via utils.js's
   setRenderer), then bootstraps the user's data and renders.
═══════════════════════════════════════════════════════════ */

import {
  bills, cards, settings, entitlement,
  setBills, setCards,
  save, bootstrapData,
} from './storage.svelte.js';
import {
  monthKey, monthKeyLabel, buildUpcomingItems, isPaid, refreshAll, renderTab,
  setMoneyFormat,
} from './utils.js';
import { runAutopayMark } from './autopay.js';
import { openRolloverReview, saveRolloverReview, closeRolloverReview } from './rollover.js';

// Side-effect imports — each renderer self-registers via setRenderer,
// modals.js wires backdrop handlers + exposes window.* for inline
// onclick, export.js exposes window.exportAll / exportCSV.
import './modals.js';
import './dashboard.js';
import './bills.js';
import './cards.js';
import './loans.js';
import './budget.js';
import './spending.js';
import './subscriptions.js';
import './history.js';
import './payoff.js';
import './rewards.js';
import './calendar.js';
import './networth.js';
import './export.js';
// Theme + auth + navbar are pulled in here so the dashboard page
// only needs a single module entry.
import './theme.js';
import './auth.js';
import './navbar.js';

// Order must match the navbar's tab order so showTab can use the
// shared index to flip the active class on the right button.
const TABS = ['dashboard', 'bills', 'cards', 'loans', 'budget', 'spending', 'subscriptions', 'calendar', 'history', 'payoff', 'rewards', 'networth'];

// Pro-only tabs (parity with the native apps). Free users see an
// upgrade prompt instead; entitlement is server-authoritative.
const PRO_TABS = {
  payoff:        'the payoff planner',
  calendar:      'the due-date calendar',
  history:       'your payment history',
  rewards:       'the rewards optimizer',
  subscriptions: 'the subscription finder',
};

// Tabs tucked under the navbar "More" menu (must stay in sync with navbar.js).
const MORE_TABS = ['subscriptions', 'calendar', 'history', 'payoff', 'rewards', 'networth'];

/* ── Tab switching ────────────────────────────────────────── */
function showTab(name) {
  TABS.forEach(function (t) {
    var pane = document.getElementById('tab-' + t);
    if (pane) pane.style.display = (t === name) ? '' : 'none';
  });
  document.querySelectorAll('.tab-btn[data-tab]').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });
  var more = document.querySelector('[data-more-menu]');
  if (more) {
    more.classList.toggle('is-active', MORE_TABS.indexOf(name) >= 0);
  }
  window.dispatchEvent(new CustomEvent('fihaven:tab-changed', { detail: { tab: name } }));
  var gated = PRO_TABS[name] && !entitlement.pro;
  applyProGate(name, gated);
  if (!gated) renderTab(name);
}

// Overlay a Pro upgrade prompt without destroying the renderer's mount
// node: hide the pane's real children and show a gate element instead.
function applyProGate(name, gated) {
  var pane = document.getElementById('tab-' + name);
  if (!pane) return;
  Array.prototype.forEach.call(pane.children, function (child) {
    if (child.hasAttribute && child.hasAttribute('data-pro-gate')) return;
    child.style.display = gated ? 'none' : '';
  });
  var gate = pane.querySelector('[data-pro-gate]');
  if (gated) {
    if (!gate) {
      gate = document.createElement('div');
      gate.setAttribute('data-pro-gate', '');
      gate.innerHTML =
        '<div class="card" style="text-align:center;max-width:460px;margin:48px auto;padding:32px;">' +
          '<span class="hero-badge" style="display:inline-block;">PRO</span>' +
          '<h2 style="margin-top:14px;letter-spacing:-.03em;">Unlock ' + PRO_TABS[name] + '</h2>' +
          '<p style="margin-top:8px;color:var(--muted);">FiHaven Pro adds payoff planning, calendar, history, rewards, subscriptions, category budgets, bank linking, and autopay mark — across web, iOS, and Android.</p>' +
          '<a class="btn btn-primary" href="/settings" style="margin-top:18px;display:inline-block;">Go Pro</a>' +
        '</div>';
      pane.appendChild(gate);
    }
    gate.style.display = '';
  } else if (gate) {
    gate.style.display = 'none';
  }
}

/* ── Seed demo data ───────────────────────────────────────── */
// Runs after bootstrap, only when the account has no data yet.
function seedIfEmpty() {
  if (bills.length || cards.length) return;

  setBills([
    { id: 1, name: 'Rent',              category: 'Housing',       amount: 1450,  dueDay: 1,  frequency: 'Monthly', autopay: true,  notes: 'Oakwood Apts' },
    { id: 2, name: 'Electric',          category: 'Utilities',     amount: 85,    dueDay: 15, frequency: 'Monthly', autopay: false, notes: 'AEP account' },
    { id: 3, name: 'Internet',          category: 'Utilities',     amount: 65,    dueDay: 22, frequency: 'Monthly', autopay: true,  notes: 'Xfinity' },
    { id: 4, name: 'Netflix',           category: 'Subscriptions', amount: 15.49, dueDay: 8,  frequency: 'Monthly', autopay: true,  notes: '' },
    { id: 5, name: 'Renters Insurance', category: 'Insurance',     amount: 18,    dueDay: 5,  frequency: 'Monthly', autopay: true,  notes: '' },
  ]);

  var promoEnd1 = new Date(); promoEnd1.setMonth(promoEnd1.getMonth() + 4);
  var promoEnd2 = new Date(); promoEnd2.setMonth(promoEnd2.getMonth() + 8);

  setCards([
    {
      id: 10, name: 'Chase Freedom Flex',
      balance: 2340, limit: 8000, minPayment: 35, regularAPR: 24.99,
      hasPromo: true, promoAPR: 0, promoEndDate: promoEnd1.toISOString().split('T')[0],
      promoBalance: 2340, dueDay: 18, autopay: false, notes: '1.5% cashback',
    },
    {
      id: 11, name: 'Citi Double Cash',
      balance: 890, limit: 5000, minPayment: 25, regularAPR: 22.49,
      hasPromo: true, promoAPR: 0, promoEndDate: promoEnd2.toISOString().split('T')[0],
      promoBalance: 890, dueDay: 7, autopay: true, notes: '2% on everything',
    },
    {
      id: 12, name: 'Discover It',
      balance: 450, limit: 3500, minPayment: 15, regularAPR: 26.99,
      hasPromo: false, promoAPR: null, promoEndDate: null, promoBalance: null,
      dueDay: 25, autopay: false, notes: '5% rotating categories',
    },
  ]);

  settings.incomes = [
    { id: 'src-seed-1', label: 'Primary paycheck', amount: 2080, frequency: 'biweekly' },
  ];
  settings.income = 4506.67;  // synced monthly equivalent

  save('fh_bills',    bills);
  save('fh_cards',    cards);
  save('fh_settings', settings);
}

/* ── Auto-reset: new month detection ─────────────────────── */
function checkNewMonth() {
  var currentMk = monthKey();
  var lastMk    = settings.lastVisitKey || '';

  if (lastMk && lastMk !== currentMk) {
    var allItems  = buildUpcomingItems();
    var missed    = allItems.filter(function (u) { return !isPaid(u.type, u.refId, lastMk); });

    var prevLabel = monthKeyLabel(lastMk);
    var currLabel = monthKeyLabel(currentMk);

    // Names come from user data, so escape before injecting into innerHTML.
    var esc = function (s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; };

    var missedHtml;
    if (missed.length) {
      var names = missed.map(function (u) { return u.name; }).filter(Boolean);
      var shown = names.slice(0, 8).map(esc).join(', ');
      var more  = names.length > 8 ? ' and ' + (names.length - 8) + ' more' : '';
      missedHtml = ' <strong>' + missed.length + ' item' + (missed.length !== 1 ? 's' : '') + '</strong> from ' +
        prevLabel + ' ' + (missed.length !== 1 ? 'were' : 'was') + ' never marked paid: ' + shown + more + '.';
    } else {
      missedHtml = ' Everything from ' + prevLabel + ' was marked paid. Great work!';
    }

    var monthName = currLabel.split(' ')[0];

    var banner = document.getElementById('new-month-banner');
    banner.className = 'new-month-banner';
    banner.style.display = '';
    banner.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;">' +
        '<span style="font-size:20px;">🗓</span>' +
        '<div>' +
          '<strong>Welcome to ' + esc(currLabel) + '!</strong> ' +
          'All bills have automatically reset to unpaid.' + missedHtml +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-shrink:0;">' +
        '<button class="btn btn-primary btn-sm" onclick="openRolloverReview()">Set ' + esc(monthName) + ' amounts</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="dismissBanner()">Dismiss</button>' +
      '</div>';
  }

  settings.lastVisitKey = currentMk;
  save('fh_settings', settings);
}

function dismissBanner() {
  var el = document.getElementById('new-month-banner');
  if (el) el.style.display = 'none';
}

/* ── Init ────────────────────────────────────────────────── */
function startApp() {
  seedIfEmpty();
  checkNewMonth();
  // Auto-mark any autopay items whose due date has passed this period
  // (opt-in; mirrors the server scheduler so it works either way).
  runAutopayMark();
  // Apply display preferences from synced settings.
  setMoneyFormat(settings.currency);
  var landing = TABS.indexOf(settings.landingView) >= 0 ? settings.landingView : 'dashboard';
  showTab(landing);
}

Object.assign(window, {
  showTab, dismissBanner, refreshAll,
  openRolloverReview, saveRolloverReview, closeRolloverReview,
});

bootstrapData().then(() => {
  startApp();
  // Prefer the admin-editable server catalog over the bundled defaults.
  import('./cardPresets.js')
    .then((m) => m.loadCardPresetsFromServer && m.loadCardPresetsFromServer())
    .catch(() => {});
  // Pull anything new from a linked bank now that the app is up. Server-side
  // throttled, so this is a no-op if we already synced within the hour. Runs
  // after startApp so a slow bank never delays first paint; refreshAll() picks
  // up whatever landed.
  import('./bankSync.js')
    .then((m) => m.syncBanks())
    .then((pulled) => { if (pulled) refreshAll(); })
    .catch(() => {});
}).catch((err) => {
  // Suspended accounts already got the lock overlay; don't boot the app.
  if (err === 'suspended' || err === 'unauth') return;
});
