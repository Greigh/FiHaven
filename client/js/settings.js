/* ═══════════════════════════════════════════════════════════
   account.js — drives account.html: change email, change
   password, and delete account. Talks to /api/account/*.
   Also serves as the account page's module entry — pulls in
   theme, auth, and the app-bar renderer.
═══════════════════════════════════════════════════════════ */

import './theme.js';
import './auth.js';
import './navbar.js';
import './passwordToggle.js';
import { BROWSER_TZ, COMMON_TIMEZONES } from './tz.js';
import { mount } from 'svelte';
import MfaSection from '../svelte/MfaSection.svelte';
import { getDevEntitlement, setDevEntitlement } from './storage.svelte.js';
import { DASHBOARD_WIDGETS, dashboardLayout, enabledWidgets } from './dashboardWidgets.js';
import { initHousehold } from './household.js';
import {
  BILL_CATEGORIES, SPENDING_CATEGORIES, BUDGET_BUCKETS,
} from './budgetRules.js';

    function showMessage(form, text, isError) {
    var el = document.querySelector('[data-message="' + form + '"]');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? 'var(--red)' : 'var(--green)';
  }

  function errorText(code) {
    switch (code) {
      case 'wrong-password':
        return 'That password is incorrect.';
      case 'weak-password':
        return 'Password must be at least 10 characters with one letter and one number.';
      case 'password-unchanged':
        return 'That is already your current password.';
      case 'invalid-email':
        return 'Enter a valid email address.';
      case 'email-unchanged':
        return 'That is already your email address.';
      case 'email-taken':
        return 'That email is already in use by another account.';
      case 'email-unverified':
        return 'Verify your current email before changing it.';
      case 'mail-send-failed':
        return 'Email updated but we couldn\'t send a verification link. Try resending from the verify page.';
      case 'invalid-name':
        return 'Names cannot contain line breaks or control characters.';
      case 'invalid-totp-code':
        return 'That authenticator code is incorrect or expired.';
      case 'no-groups':
        return 'Choose at least one type of data to clear.';
      case 'bad-csrf-token':
        return 'Your session expired. Please reload the page and try again.';
      case 'network':
        return 'Could not reach the server. Please try again.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }

  // Resolve the CSRF token, fetching a session via me() if needed.
  function csrfToken() {
    var auth = window.AppAuth;
    var token = auth && auth.getCsrfToken && auth.getCsrfToken();
    if (token) return Promise.resolve(token);
    return auth.me().then(function () {
      return auth.getCsrfToken();
    });
  }

  function postJson(path, body) {
    return accountFetch(path, 'POST', body);
  }

  function accountFetch(path, method, body) {
    return csrfToken().then(function (token) {
      var opts = {
        method: method,
        headers: { 'X-CSRF-Token': token || '' },
        credentials: 'same-origin',
      };
      if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
      return fetch('/api/account/' + path, opts).then(function (r) {
        return r
          .json()
          .catch(function () { return {}; })
          .then(function (data) {
            return { ok: r.ok, status: r.status, data: data };
          });
      });
    });
  }

  function setBusy(form, busy) {
    var btn = form.querySelector('[type="submit"]');
    if (btn) btn.disabled = busy;
  }

  // Returns true (and redirects) when the session is no longer valid.
  function handledSessionLoss(res) {
    if (res.status === 401 && res.data && res.data.error === 'unauthenticated') {
      window.location.replace('/login');
      return true;
    }
    return false;
  }

  function clearLocalData() {
    ['fh_bills', 'fh_cards', 'fh_payments', 'fh_settings', 'fh_data_owner'].forEach(
      function (key) {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          /* ignore */
        }
      }
    );
  }

  function init() {
    var auth = window.AppAuth;
    if (!auth) return;

    // Render the "Signed in as" panel — show the display name (if
    // set) above the email, or the email alone otherwise. Also seed
    // the name input so the user can edit their existing value.
    function renderIdentity(user) {
      var el = document.querySelector('[data-current-identity]');
      if (!el) return;
      var name = user && user.name ? String(user.name) : '';
      var email = user && user.email ? String(user.email) : '';
      el.innerHTML = '';
      if (name) {
        var nameDiv = document.createElement('div');
        nameDiv.textContent = name;
        el.appendChild(nameDiv);
        var emailDiv = document.createElement('div');
        emailDiv.style.cssText = 'font-size:13px;font-weight:500;color:var(--muted);';
        emailDiv.textContent = email;
        el.appendChild(emailDiv);
      } else {
        el.textContent = email;
      }
    }

    // "3 years", "5 months", "12 days" — the longest non-zero unit since `ms`.
    function humanDuration(ms) {
      var days = Math.floor((Date.now() - ms) / 86400000);
      if (days < 1) return 'today';
      var years = Math.floor(days / 365);
      if (years >= 1) return years + (years === 1 ? ' year' : ' years');
      var months = Math.floor(days / 30);
      if (months >= 1) return months + (months === 1 ? ' month' : ' months');
      return days + (days === 1 ? ' day' : ' days');
    }
    function monthYear(ms) {
      return new Date(ms).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    // "Member since June 2026 · Pro for 3 months" — a small coolness factor.
    function renderMembership(user, entitlement) {
      var el = document.querySelector('[data-membership]');
      if (!el) return;
      var parts = [];
      if (user && user.createdAt) parts.push('Member since ' + monthYear(user.createdAt));
      if (entitlement && entitlement.pro) {
        parts.push(entitlement.proSince
          ? 'Pro for ' + humanDuration(entitlement.proSince)
          : 'FiHaven Pro');
      }
      el.textContent = parts.join(' · ');
    }

    auth.me().then(function (user) {
      if (!user) return; // auth.js already redirects unauthenticated users
      renderIdentity(user);
      // Family / household panel.
      initHousehold(user);
      var nameInput = document.getElementById('display-name');
      if (nameInput) nameInput.value = user.name || '';
      var emailSection = document.querySelector('[data-change-email-section]');
      if (emailSection) {
        if (user.emailVerified === false) {
          emailSection.hidden = true;
        } else {
          emailSection.hidden = false;
        }
      }
      // Membership line needs the Pro entitlement (from /api/data).
      fetchData()
        .then(function (server) { renderMembership(user, server && server.entitlement); })
        .catch(function () { renderMembership(user, null); });
      // Developer tools (subscription override) — admins or a local fh_dev flag.
      var isDev = (user.role === 'admin');
      try { isDev = isDev || localStorage.getItem('fh_dev') === '1'; } catch (e) { /* ignore */ }
      if (isDev) initDeveloperSection();
    });

    /* ── Display name ──────────────────────────────────────── */
    var nameForm = document.querySelector('[data-form="name"]');
    if (nameForm) {
      nameForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var name = document.getElementById('display-name').value.trim();
        setBusy(nameForm, true);
        showMessage('name', 'Saving…', false);
        postJson('change-name', { name: name })
          .then(function (res) {
            setBusy(nameForm, false);
            if (handledSessionLoss(res)) return;
            if (res.ok) {
              showMessage('name', name ? 'Name updated.' : 'Name cleared.', false);
              // Refresh the "Signed in as" panel and the navbar.
              auth.me().then(function (u) {
                if (u) {
                  renderIdentity(u);
                  window.dispatchEvent(new CustomEvent('fihaven:user-changed'));
                }
              });
            } else {
              showMessage('name', errorText(res.data && res.data.error), true);
            }
          })
          .catch(function () {
            setBusy(nameForm, false);
            showMessage('name', errorText('network'), true);
          });
      });
    }

    /* ── Change email ──────────────────────────────────────── */
    var emailForm = document.querySelector('[data-form="email"]');
    if (emailForm) {
      emailForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var newEmail = document.getElementById('new-email').value.trim();
        var password = document.getElementById('email-password').value;
        if (!newEmail || !password) {
          showMessage('email', 'Fill in both fields.', true);
          return;
        }
        setBusy(emailForm, true);
        showMessage('email', 'Working…', false);
        postJson('change-email', { newEmail: newEmail, password: password })
          .then(function (res) {
            setBusy(emailForm, false);
            if (handledSessionLoss(res)) return;
            if (res.ok) {
              if (res.data && res.data.verificationRequired) {
                window.location.href = '/verify-email';
                return;
              }
              showMessage('email', 'Email updated.', false);
              auth.me().then(function (u) {
                if (u) {
                  renderIdentity(u);
                  window.dispatchEvent(new CustomEvent('fihaven:user-changed'));
                }
              });
              emailForm.reset();
            } else {
              showMessage('email', errorText(res.data && res.data.error), true);
            }
          })
          .catch(function () {
            setBusy(emailForm, false);
            showMessage('email', errorText('network'), true);
          });
      });
    }

    /* ── Change password ───────────────────────────────────── */
    var pwForm = document.querySelector('[data-form="password"]');
    if (pwForm) {
      pwForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var current = document.getElementById('current-password').value;
        var next = document.getElementById('new-password').value;
        var confirm = document.getElementById('confirm-password').value;
        if (!current || !next) {
          showMessage('password', 'Fill in all fields.', true);
          return;
        }
        if (next !== confirm) {
          showMessage('password', 'New passwords do not match.', true);
          return;
        }
        setBusy(pwForm, true);
        showMessage('password', 'Working…', false);
        postJson('change-password', { currentPassword: current, newPassword: next })
          .then(function (res) {
            setBusy(pwForm, false);
            if (handledSessionLoss(res)) return;
            if (res.ok) {
              showMessage(
                'password',
                'Password updated. Other devices have been signed out.',
                false
              );
              pwForm.reset();
            } else {
              showMessage('password', errorText(res.data && res.data.error), true);
            }
          })
          .catch(function () {
            setBusy(pwForm, false);
            showMessage('password', errorText('network'), true);
          });
      });
    }

    /* ── Clear selected data (keeps the account) ───────────── */
    var clearForm = document.querySelector('[data-form="clear"]');
    if (clearForm) {
      clearForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var password = document.getElementById('clear-password').value;
        var code = document.getElementById('clear-code').value.trim();
        var groups = Array.prototype.slice
          .call(clearForm.querySelectorAll('[data-clear-group]:checked'))
          .map(function (c) { return c.value; });
        if (!groups.length) {
          showMessage('clear', 'Choose at least one type of data to clear.', true);
          return;
        }
        if (!password) {
          showMessage('clear', 'Enter your password to confirm.', true);
          return;
        }
        if (!window.confirm('Permanently erase the selected data? This cannot be undone.')) return;

        setBusy(clearForm, true);
        showMessage('clear', 'Clearing…', false);
        postJson('clear-data', { password: password, code: code, groups: groups })
          .then(function (res) {
            setBusy(clearForm, false);
            if (res.ok) {
              clearLocalData();
              showMessage('clear', 'Selected data cleared. Reloading…', false);
              setTimeout(function () { window.location.replace('/dashboard'); }, 800);
              return;
            }
            if (handledSessionLoss(res)) return;
            showMessage('clear', errorText(res.data && res.data.error), true);
          })
          .catch(function () {
            setBusy(clearForm, false);
            showMessage('clear', errorText('network'), true);
          });
      });
    }

    /* ── Delete account ────────────────────────────────────── */
    var DELETE_PHRASE = 'DELETE ACCOUNT DATA';
    var deleteForm = document.querySelector('[data-form="delete"]');
    if (deleteForm) {
      var deleteText = document.getElementById('delete-confirm-text');
      var deleteBtn = deleteForm.querySelector('[data-delete-submit]');
      // GitHub-style: the button only unlocks once the exact phrase is typed.
      function syncDeleteBtn() {
        if (deleteBtn) deleteBtn.disabled = (deleteText.value.trim() !== DELETE_PHRASE);
      }
      if (deleteText) deleteText.addEventListener('input', syncDeleteBtn);
      syncDeleteBtn();

      deleteForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var password = document.getElementById('delete-password').value;
        var code = document.getElementById('delete-code').value.trim();
        if (deleteText.value.trim() !== DELETE_PHRASE) {
          showMessage('delete', 'Type ' + DELETE_PHRASE + ' exactly to confirm.', true);
          return;
        }
        if (!password) {
          showMessage('delete', 'Enter your password to confirm.', true);
          return;
        }
        if (
          !window.confirm(
            'Permanently delete your FiHaven account and all of your data? This cannot be undone.'
          )
        ) {
          return;
        }
        setBusy(deleteForm, true);
        showMessage('delete', 'Deleting…', false);
        postJson('delete', { password: password, code: code })
          .then(function (res) {
            if (res.ok) {
              clearLocalData();
              window.location.replace('/');
              return;
            }
            setBusy(deleteForm, false);
            if (handledSessionLoss(res)) return;
            showMessage('delete', errorText(res.data && res.data.error), true);
          })
          .catch(function () {
            setBusy(deleteForm, false);
            showMessage('delete', errorText('network'), true);
          });
      });
    }

    /* ── Download: "Everything (CSV ×3)" ─────────────────── */
    var everyBtn = document.querySelector('[data-export-all]');
    if (everyBtn) {
      everyBtn.addEventListener('click', function () {
        // Spawn three sequential downloads. The browser handles
        // them via Content-Disposition: attachment on each route.
        downloadUrl('/api/account/export/bills.csv');
        setTimeout(function () { downloadUrl('/api/account/export/cards.csv'); }, 350);
        setTimeout(function () { downloadUrl('/api/account/export/history.csv'); }, 700);
      });
    }

    /* ── Two-factor authentication (Svelte component) ──────── */
    var mfaTarget = document.getElementById('mfa-section-mount');
    if (mfaTarget) mount(MfaSection, { target: mfaTarget });

    /* ── Time zone selector ────────────────────────────────── */
    initTimezoneSection();

    /* ── Payment goal policy ───────────────────────────────── */
    initPaymentGoalSection();

    /* ── Dashboard display ─────────────────────────────────── */
    initDashboardSection();

    /* ── Budget period ─────────────────────────────────────── */
    initPeriodSection();

    /* ── Budget rule lens ──────────────────────────────────── */
    initBudgetRuleSection();
    initBucketOverridesSection();

    /* ── Autopay auto-mark ─────────────────────────────────── */
    initAutopaySection();

    /* ── Calendar subscription (iCal) ──────────────────────── */
    initIcalSection();

    /* ── Import a file (JSON backup or single-type CSV) ──── */
    initImportForm();

    /* ── Bank connections (Plaid, Pro-gated) ─────────────── */
    initPlaidSection();

    /* ── Display preferences (currency, default view) ────── */
    initCurrencySection();
    initLandingSection();

    /* ── Email notifications (reminders, monthly summary) ── */
    initNotificationsSection();

    /* ── Section tabs ────────────────────────────────────── */
    initTabs();
  }

  /* ── Section tabs ──────────────────────────────────────── */
  function initTabs() {
    var tablist = document.querySelector('[data-settings-tabs]');
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-settings-tabs] .tab-btn'));
    var panels = Array.prototype.slice.call(document.querySelectorAll('[data-tab-panel]'));
    var wrap = document.querySelector('[data-settings-tabs-wrap]');
    if (!tabs.length) return;

    function updateScrollHints() {
      if (!wrap || !tablist) return;
      var max = tablist.scrollWidth - tablist.clientWidth;
      wrap.classList.toggle('can-scroll-left', tablist.scrollLeft > 4);
      wrap.classList.toggle('can-scroll-right', max - tablist.scrollLeft > 4);
    }

    function activate(name) {
      tabs.forEach(function (t) {
        var on = t.dataset.tab === name;
        t.classList.toggle('active', on);
        if (on && tablist) {
          try {
            t.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
          } catch (e) {
            t.scrollIntoView();
          }
        }
      });
      panels.forEach(function (p) { p.hidden = p.getAttribute('data-tab-panel') !== name; });
      try { history.replaceState(null, '', '#' + name); } catch (e) {}
      requestAnimationFrame(updateScrollHints);
    }

    tabs.forEach(function (t) {
      t.addEventListener('click', function () { activate(t.dataset.tab); });
    });

    if (tablist) {
      tablist.addEventListener('scroll', updateScrollHints, { passive: true });
      window.addEventListener('resize', updateScrollHints);
      updateScrollHints();
    }

    // Honor a #hash deep-link (e.g. /settings#security from onboarding).
    var hash = (window.location.hash || '').replace('#', '');
    if (hash && panels.some(function (p) { return p.getAttribute('data-tab-panel') === hash; })) {
      activate(hash);
    }
  }

  /* ── Currency ──────────────────────────────────────────── */
  function initCurrencySection() {
    var form = document.querySelector('[data-form="currency"]');
    var select = document.querySelector('[data-currency-select]');
    var sample = document.querySelector('[data-currency-sample]');
    if (!form || !select) return;

    function describe() {
      try {
        sample.textContent = 'Example: ' + new Intl.NumberFormat(undefined, {
          style: 'currency', currency: select.value,
        }).format(1234.5);
      } catch (e) { sample.textContent = ''; }
    }

    fetchData().then(function (server) {
      var s = (server && server.settings) || {};
      if (s.currency) select.value = s.currency;
      describe();
    }).catch(describe);

    select.addEventListener('change', describe);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var chosen = select.value;
      setBusy(form, true);
      showMessage('currency', 'Saving…', false);
      fetchData().then(function (server) {
        return pushData({
          bills: server.bills || [], cards: server.cards || [], payments: server.payments || [],
          settings: Object.assign({}, server.settings || {}, { currency: chosen }),
        });
      }).then(function () {
        setBusy(form, false);
        showMessage('currency', 'Currency saved — amounts update next time your dashboard loads.', false);
      }).catch(function (err) {
        setBusy(form, false);
        showMessage('currency', (err && err.message) || errorText('network'), true);
      });
    });
  }

  /* ── Default view ──────────────────────────────────────── */
  function initLandingSection() {
    var form = document.querySelector('[data-form="landing"]');
    var select = document.querySelector('[data-landing-select]');
    if (!form || !select) return;

    fetchData().then(function (server) {
      var s = (server && server.settings) || {};
      if (s.landingView) select.value = s.landingView;
    }).catch(function () {});

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var chosen = select.value;
      setBusy(form, true);
      showMessage('landing', 'Saving…', false);
      fetchData().then(function (server) {
        return pushData({
          bills: server.bills || [], cards: server.cards || [], payments: server.payments || [],
          settings: Object.assign({}, server.settings || {}, { landingView: chosen }),
        });
      }).then(function () {
        setBusy(form, false);
        showMessage('landing', 'Default view saved.', false);
      }).catch(function (err) {
        setBusy(form, false);
        showMessage('landing', (err && err.message) || errorText('network'), true);
      });
    });
  }

  /* ── Email notifications (save on change) ──────────────── */
  function initNotificationsSection() {
    var reminders = document.querySelector('[data-reminders-toggle]');
    var summary   = document.querySelector('[data-summary-toggle]');
    var digest    = document.querySelector('[data-digest-toggle]');
    var offers    = document.querySelector('[data-offer-reminders-toggle]');
    var dueDay    = document.querySelector('[data-dueday-toggle]');
    var leadSel   = document.querySelector('[data-reminder-lead]');
    var hourSel   = document.querySelector('[data-notify-hour]');
    var optsBox   = document.querySelector('[data-reminder-options]');
    var desc      = document.querySelector('[data-reminders-desc]');
    if (!reminders && !summary) return;

    // Lead-day choices.
    if (leadSel && !leadSel.options.length) {
      [0, 1, 2, 3, 5, 7, 10, 14].forEach(function (d) {
        var opt = document.createElement('option');
        opt.value = String(d);
        opt.textContent = d === 0 ? 'on the due day' : (d === 1 ? '1 day' : d + ' days');
        leadSel.appendChild(opt);
      });
    }
    // Hour-of-day choices (12-hour labels).
    if (hourSel && !hourSel.options.length) {
      for (var h = 0; h < 24; h++) {
        var ampm = h < 12 ? 'AM' : 'PM';
        var h12 = h % 12 === 0 ? 12 : h % 12;
        var o = document.createElement('option');
        o.value = String(h);
        o.textContent = h12 + ':00 ' + ampm;
        hourSel.appendChild(o);
      }
    }
    function clampHour(v) { v = parseInt(v, 10); return (v >= 0 && v <= 23) ? v : 8; }
    function clampLead(v) { v = parseInt(v, 10); return (v >= 0 && v <= 14) ? v : 3; }

    function syncDesc() {
      if (!desc) return;
      var lead = leadSel ? clampLead(leadSel.value) : 3;
      desc.textContent = lead === 0
        ? 'Email me on the day a bill is due.'
        : 'Email me ' + (lead === 1 ? '1 day' : lead + ' days') + ' before a bill is due.';
    }
    function syncOptions() {
      if (optsBox) optsBox.style.display = (reminders && reminders.checked) ? '' : 'none';
    }

    fetchData().then(function (server) {
      var s = (server && server.settings) || {};
      if (reminders) reminders.checked = !!s.billReminders;
      if (summary)   summary.checked   = !!s.monthlySummary;
      if (digest)    digest.checked    = !!s.weeklyDigest;
      if (offers)    offers.checked    = !!s.offerReminders;
      if (dueDay)    dueDay.checked     = !!s.remindOnDueDay;
      if (leadSel)   leadSel.value      = String(s.reminderLeadDays != null ? clampLead(s.reminderLeadDays) : 3);
      if (hourSel)   hourSel.value      = String(s.notifyHour != null ? clampHour(s.notifyHour) : 8);
      syncDesc();
      syncOptions();
    }).catch(function () { syncDesc(); syncOptions(); });

    // Save the given settings patch; reverts the control on failure.
    function save(patch, onFail) {
      showMessage('notifications', 'Saving…', false);
      fetchData().then(function (server) {
        return pushData({
          bills: server.bills || [], cards: server.cards || [], payments: server.payments || [],
          settings: Object.assign({}, server.settings || {}, patch),
        });
      }).then(function () {
        showMessage('notifications', 'Saved.', false);
      }).catch(function (err) {
        if (onFail) onFail();
        showMessage('notifications', (err && err.message) || errorText('network'), true);
      });
    }

    if (reminders) reminders.addEventListener('change', function () {
      syncOptions();
      save({ billReminders: reminders.checked }, function () { reminders.checked = !reminders.checked; syncOptions(); });
    });
    if (summary) summary.addEventListener('change', function () {
      save({ monthlySummary: summary.checked }, function () { summary.checked = !summary.checked; });
    });
    if (digest) digest.addEventListener('change', function () {
      save({ weeklyDigest: digest.checked }, function () { digest.checked = !digest.checked; });
    });
    if (offers) offers.addEventListener('change', function () {
      save({ offerReminders: offers.checked }, function () { offers.checked = !offers.checked; });
    });
    if (dueDay) dueDay.addEventListener('change', function () {
      save({ remindOnDueDay: dueDay.checked }, function () { dueDay.checked = !dueDay.checked; });
    });
    if (leadSel) leadSel.addEventListener('change', function () {
      syncDesc();
      save({ reminderLeadDays: clampLead(leadSel.value) });
    });
    if (hourSel) hourSel.addEventListener('change', function () {
      save({ notifyHour: clampHour(hourSel.value) });
    });
  }

  /* ── Developer: subscription override (admin/dev only) ──── */
  function initDeveloperSection() {
    var tab = document.querySelector('[data-dev-tab]');
    if (tab) tab.hidden = false;
    var sel = document.querySelector('[data-dev-entitlement]');
    if (!sel) return;
    sel.value = getDevEntitlement();
    sel.addEventListener('change', function () {
      setDevEntitlement(sel.value);
      showMessage('developer', sel.value === 'off'
        ? 'Using your real subscription.'
        : 'Simulating "' + sel.options[sel.selectedIndex].text + '". Reload the dashboard to see it.', false);
    });
  }

  /* ── Time zone ──────────────────────────────────────────── */
  function initTimezoneSection() {
    var form     = document.querySelector('[data-form="timezone"]');
    var select   = document.querySelector('[data-tz-select]');
    var effectEl = document.querySelector('[data-tz-effective]');
    if (!form || !select) return;

    // Build the dropdown: auto + curated groups. Sets of zones are
    // grouped via <optgroup> so the user can scan by region.
    select.innerHTML = '';
    var autoOpt = document.createElement('option');
    autoOpt.value = '';
    autoOpt.textContent = 'Auto-detect (' + BROWSER_TZ + ')';
    select.appendChild(autoOpt);
    COMMON_TIMEZONES.forEach(function (g) {
      var og = document.createElement('optgroup');
      og.label = g.group;
      g.zones.forEach(function (z) {
        var opt = document.createElement('option');
        opt.value = z;
        opt.textContent = z.replace(/_/g, ' ');
        og.appendChild(opt);
      });
      select.appendChild(og);
    });

    function describeEffective(saved) {
      var effective = saved || BROWSER_TZ;
      var sample;
      try {
        sample = new Intl.DateTimeFormat('en-US', {
          timeZone: effective,
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit',
        }).format(new Date());
      } catch (e) {
        sample = '(invalid time zone)';
      }
      effectEl.textContent = 'In ' + effective + ' it is currently ' + sample + '.';
    }

    // Load current snapshot to populate the selector.
    fetchData()
      .then(function (server) {
        var s = (server && server.settings) || {};
        select.value = s.timezone || '';
        // If a stored zone isn't in our common list, append it so the
        // current value is selectable.
        if (s.timezone && select.value !== s.timezone) {
          var custom = document.createElement('option');
          custom.value = s.timezone;
          custom.textContent = s.timezone.replace(/_/g, ' ') + ' (custom)';
          select.appendChild(custom);
          select.value = s.timezone;
        }
        describeEffective(s.timezone);
      })
      .catch(function () {
        describeEffective('');
      });

    select.addEventListener('change', function () {
      describeEffective(select.value);
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var chosen = select.value || '';
      setBusy(form, true);
      showMessage('timezone', 'Saving…', false);

      fetchData()
        .then(function (server) {
          var snapshot = {
            bills: server.bills || [],
            cards: server.cards || [],
            payments: server.payments || [],
            settings: Object.assign({}, server.settings || {}, { timezone: chosen }),
          };
          return pushData(snapshot);
        })
        .then(function () {
          setBusy(form, false);
          showMessage('timezone', chosen
            ? 'Time zone saved as ' + chosen + '.'
            : 'Now using your browser’s detected time zone.', false);
          describeEffective(chosen);
        })
        .catch(function (err) {
          setBusy(form, false);
          showMessage('timezone', (err && err.message) || errorText('network'), true);
        });
    });
  }

  /* ── Payment goal policy ────────────────────────────────── */
  function initPaymentGoalSection() {
    var form   = document.querySelector('[data-form="paidgoal"]');
    var select = document.querySelector('[data-paidgoal-select]');
    var noteEl = document.querySelector('[data-paidgoal-effective]');
    if (!form || !select) return;

    var DESCRIPTIONS = {
      minimum:     'Paying at least the minimum marks a card fully paid. Bills still need their full amount.',
      recommended: 'Cards must reach the recommended amount (enough to clear a 0% promo before it ends). Bills need their full amount.',
      full:        'Cards must be paid down to a zero balance to count as fully paid. Bills need their full amount.',
    };
    function normalize(v) {
      return (v === 'minimum' || v === 'full') ? v : 'recommended';
    }
    function describe(v) {
      if (noteEl) noteEl.textContent = DESCRIPTIONS[normalize(v)];
    }

    fetchData()
      .then(function (server) {
        var s = (server && server.settings) || {};
        select.value = normalize(s.paidGoal);
        describe(select.value);
      })
      .catch(function () { describe(select.value); });

    select.addEventListener('change', function () { describe(select.value); });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var chosen = normalize(select.value);
      setBusy(form, true);
      showMessage('paidgoal', 'Saving…', false);

      fetchData()
        .then(function (server) {
          var snapshot = {
            bills: server.bills || [],
            cards: server.cards || [],
            payments: server.payments || [],
            settings: Object.assign({}, server.settings || {}, { paidGoal: chosen }),
          };
          return pushData(snapshot);
        })
        .then(function () {
          setBusy(form, false);
          showMessage('paidgoal', 'Payment goal saved.', false);
          describe(chosen);
        })
        .catch(function (err) {
          setBusy(form, false);
          showMessage('paidgoal', (err && err.message) || errorText('network'), true);
        });
    });
  }

  function initDashboardSection() {
    var form = document.querySelector('[data-form="dashboard"]');
    if (!form) return;
    var checkbox   = form.querySelector('[data-hide-paid-dashboard]');
    var layoutSel  = form.querySelector('[data-dash-layout]');
    var widgetsWrap = form.querySelector('[data-dash-widgets-wrap]');
    var widgetsList = form.querySelector('[data-dash-widgets]');

    // Working order: enabled widgets (saved order) first, then the rest,
    // with an `on` flag. Saved as the enabled ids in this order.
    var order = [];   // [{ id, on }]

    function seedOrder(s) {
      var enabled = enabledWidgets(s);
      var enabledSet = {};
      order = enabled.map(function (id) { enabledSet[id] = true; return { id: id, on: true }; });
      DASHBOARD_WIDGETS.forEach(function (w) {
        if (!enabledSet[w.id]) order.push({ id: w.id, on: false });
      });
    }

    function labelFor(id) {
      var w = DASHBOARD_WIDGETS.find(function (x) { return x.id === id; });
      return w ? w.label : id;
    }

    function renderWidgets() {
      if (!widgetsWrap || !widgetsList) return;
      var isWidgets = layoutSel && layoutSel.value === 'widgets';
      widgetsWrap.hidden = !isWidgets;
      if (!isWidgets) return;
      widgetsList.innerHTML = '';
      order.forEach(function (entry, i) {
        var li = document.createElement('li');
        li.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;';
        var cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = entry.on;
        cb.addEventListener('change', function () { entry.on = cb.checked; });
        var name = document.createElement('span');
        name.textContent = labelFor(entry.id);
        name.style.cssText = 'flex:1;font-size:14px;';
        var up = document.createElement('button');
        up.type = 'button'; up.textContent = '↑'; up.className = 'btn btn-ghost btn-xs';
        up.disabled = i === 0;
        up.addEventListener('click', function () { swap(i, i - 1); });
        var down = document.createElement('button');
        down.type = 'button'; down.textContent = '↓'; down.className = 'btn btn-ghost btn-xs';
        down.disabled = i === order.length - 1;
        down.addEventListener('click', function () { swap(i, i + 1); });
        li.appendChild(cb); li.appendChild(name); li.appendChild(up); li.appendChild(down);
        widgetsList.appendChild(li);
      });
    }

    function swap(a, b) {
      if (b < 0 || b >= order.length) return;
      var tmp = order[a]; order[a] = order[b]; order[b] = tmp;
      renderWidgets();
    }

    fetchData()
      .then(function (server) {
        var s = (server && server.settings) || {};
        if (checkbox) checkbox.checked = s.hidePaidOnDashboard !== false;
        if (layoutSel) layoutSel.value = dashboardLayout(s);
        seedOrder(s);
        renderWidgets();
      })
      .catch(function () { seedOrder({}); renderWidgets(); });

    if (layoutSel) layoutSel.addEventListener('change', renderWidgets);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var hidePaid = !!(checkbox && checkbox.checked);
      var layout = layoutSel ? layoutSel.value : 'classic';
      var dashboardWidgets = order.filter(function (e) { return e.on; }).map(function (e) { return e.id; });
      setBusy(form, true);
      showMessage('dashboard', 'Saving…', false);

      fetchData()
        .then(function (server) {
          var snapshot = {
            bills: server.bills || [],
            cards: server.cards || [],
            payments: server.payments || [],
            settings: Object.assign({}, server.settings || {}, {
              hidePaidOnDashboard: hidePaid,
              dashboardLayout: layout,
              dashboardWidgets: dashboardWidgets,
            }),
          };
          return pushData(snapshot);
        })
        .then(function () {
          setBusy(form, false);
          showMessage('dashboard', 'Dashboard settings saved.', false);
        })
        .catch(function (err) {
          setBusy(form, false);
          showMessage('dashboard', (err && err.message) || errorText('network'), true);
        });
    });
  }

  /* ── Budget period ──────────────────────────────────────── */
  function initPeriodSection() {
    var form      = document.querySelector('[data-form="period"]');
    var modeSel   = document.querySelector('[data-period-mode]');
    var dayField  = document.querySelector('[data-period-startday-field]');
    var dayInput  = document.querySelector('[data-period-startday]');
    var lenField  = document.querySelector('[data-period-length-field]');
    var lenInput  = document.querySelector('[data-period-length]');
    var anchorField = document.querySelector('[data-period-anchor-field]');
    var anchorInput = document.querySelector('[data-period-anchor]');
    var noteEl    = document.querySelector('[data-period-effective]');
    if (!form || !modeSel) return;

    function normMode(v) {
      return (v === 'startDay' || v === 'rolling') ? v : 'calendar';
    }
    function clampDay(v) { v = parseInt(v, 10); return (v >= 1 && v <= 28) ? v : 1; }
    function clampLen(v) { v = parseInt(v, 10); return (v >= 7 && v <= 90) ? v : 35; }
    function normAnchor(v) { return (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : ''; }

    function syncVisibility() {
      var mode = normMode(modeSel.value);
      if (dayField) dayField.hidden = mode !== 'startDay';
      if (lenField) lenField.hidden = mode !== 'rolling';
      if (anchorField) anchorField.hidden = mode !== 'rolling';
    }
    function describe() {
      if (!noteEl) return;
      var mode = normMode(modeSel.value);
      if (mode === 'startDay') {
        noteEl.textContent = 'Each period runs from day ' + clampDay(dayInput && dayInput.value) +
          ' to the day before it next month. A payment counts toward the period its date falls in.';
      } else if (mode === 'rolling') {
        var anchor = normAnchor(anchorInput && anchorInput.value);
        noteEl.textContent = 'Periods are fixed ' + clampLen(lenInput && lenInput.value) +
          '-day windows' + (anchor ? ' starting ' + anchor : '') +
          '. A payment counts toward whichever window its date falls in.';
      } else {
        noteEl.textContent = 'Periods follow the calendar month (the default).';
      }
    }

    fetchData()
      .then(function (server) {
        var s = (server && server.settings) || {};
        modeSel.value = normMode(s.periodMode);
        if (dayInput) dayInput.value = clampDay(s.periodStartDay);
        if (lenInput) lenInput.value = clampLen(s.periodLength);
        if (anchorInput) anchorInput.value = normAnchor(s.periodAnchor);
        syncVisibility();
        describe();
      })
      .catch(function () { syncVisibility(); describe(); });

    modeSel.addEventListener('change', function () { syncVisibility(); describe(); });
    if (dayInput) dayInput.addEventListener('input', describe);
    if (lenInput) lenInput.addEventListener('input', describe);
    if (anchorInput) anchorInput.addEventListener('input', describe);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var mode = normMode(modeSel.value);
      var day  = clampDay(dayInput && dayInput.value);
      var len  = clampLen(lenInput && lenInput.value);
      var anchor = normAnchor(anchorInput && anchorInput.value);
      setBusy(form, true);
      showMessage('period', 'Saving…', false);

      fetchData()
        .then(function (server) {
          var snapshot = {
            bills: server.bills || [],
            cards: server.cards || [],
            payments: server.payments || [],
            settings: Object.assign({}, server.settings || {}, {
              periodMode: mode, periodStartDay: day, periodLength: len,
              periodAnchor: anchor,
            }),
          };
          return pushData(snapshot);
        })
        .then(function () {
          setBusy(form, false);
          showMessage('period', 'Budget period saved. Reload to apply everywhere.', false);
          describe();
        })
        .catch(function (err) {
          setBusy(form, false);
          showMessage('period', (err && err.message) || errorText('network'), true);
        });
    });
  }

  /* ── Budget rule lens ───────────────────────────────────── */
  function initBudgetRuleSection() {
    var form = document.querySelector('[data-form="budgetrule"]');
    var modeSel = document.querySelector('[data-budget-rule-mode]');
    var splitsField = document.querySelector('[data-budget-rule-splits]');
    var debtField = document.querySelector('[data-debt-focus-extra-field]');
    var rolloverField = document.querySelector('[data-envelope-rollover-field]');
    var rolloverChk = document.querySelector('[data-envelope-rollover]');
    var debtIn = document.querySelector('[data-debt-focus-extra]');
    var needsIn = document.querySelector('[data-budget-rule-needs]');
    var wantsIn = document.querySelector('[data-budget-rule-wants]');
    var saveIn = document.querySelector('[data-budget-rule-save]');
    if (!form || !modeSel) return;

    var presetModes = { '50-30-20': 1, '80-20': 1, '60-20-20': 1, '70-20-10': 1 };
    function normMode(v) {
      if (v === '50-30-20' || v === '503020') return '50-30-20';
      if (presetModes[v]) return v;
      if (v === 'custom') return 'custom';
      if (v === 'obligations-first' || v === 'obligations') return 'obligations-first';
      if (v === 'debt-focus' || v === 'debt') return 'debt-focus';
      if (v === 'envelope') return 'envelope';
      return 'off';
    }
    function clampPct(v) { v = parseInt(v, 10); return (v >= 0 && v <= 100) ? v : 0; }
    function clampMoney(v) { v = parseFloat(v); return (v >= 0 && isFinite(v)) ? v : 0; }
    function syncVisibility() {
      var mode = normMode(modeSel.value);
      if (splitsField) splitsField.hidden = mode !== 'custom';
      if (debtField) debtField.hidden = mode !== 'debt-focus';
      if (rolloverField) rolloverField.hidden = mode !== 'envelope';
    }

    fetchData()
      .then(function (server) {
        var s = (server && server.settings) || {};
        modeSel.value = normMode(s.budgetRule);
        var splits = s.budgetRuleSplits || { needs: 50, wants: 30, save: 20 };
        if (needsIn) needsIn.value = clampPct(splits.needs != null ? splits.needs : 50);
        if (wantsIn) wantsIn.value = clampPct(splits.wants != null ? splits.wants : 30);
        if (saveIn) saveIn.value = clampPct(splits.save != null ? splits.save : 20);
        if (debtIn) debtIn.value = clampMoney(s.debtFocusExtra != null ? s.debtFocusExtra : 0);
        if (rolloverChk) rolloverChk.checked = !!s.envelopeRollover;
        syncVisibility();
      })
      .catch(function () { syncVisibility(); });

    modeSel.addEventListener('change', syncVisibility);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var mode = normMode(modeSel.value);
      var splits = {
        needs: clampPct(needsIn && needsIn.value),
        wants: clampPct(wantsIn && wantsIn.value),
        save: clampPct(saveIn && saveIn.value),
      };
      setBusy(form, true);
      showMessage('budgetrule', 'Saving…', false);
      fetchData()
        .then(function (server) {
          var patch = { budgetRule: mode };
          if (mode === 'custom') patch.budgetRuleSplits = splits;
          if (mode === 'debt-focus') patch.debtFocusExtra = clampMoney(debtIn && debtIn.value);
          if (mode === 'envelope' && rolloverChk) patch.envelopeRollover = !!rolloverChk.checked;
          var snapshot = {
            bills: server.bills || [],
            cards: server.cards || [],
            payments: server.payments || [],
            settings: Object.assign({}, server.settings || {}, patch),
          };
          return pushData(snapshot);
        })
        .then(function () {
          setBusy(form, false);
          showMessage('budgetrule', 'Budget lens saved.', false);
        })
        .catch(function (err) {
          setBusy(form, false);
          showMessage('budgetrule', (err && err.message) || errorText('network'), true);
        });
    });
  }

  /* ── Category bucket overrides ──────────────────────────── */
  function initBucketOverridesSection() {
    var form = document.querySelector('[data-form="bucketoverrides"]');
    var root = document.querySelector('[data-bucket-overrides-root]');
    if (!form || !root) return;

    function bucketSelect(kind, cat, value) {
      var opts = ['default'].concat(BUDGET_BUCKETS).map(function (b) {
        var lbl = b === 'default' ? 'Default' : (b.charAt(0).toUpperCase() + b.slice(1));
        var sel = ((b === 'default' && !value) || b === value) ? ' selected' : '';
        return '<option value="' + b + '"' + sel + '>' + lbl + '</option>';
      }).join('');
      return '<div class="auth-field" style="display:grid;grid-template-columns:1fr 140px;gap:8px;align-items:center;margin-bottom:6px;">' +
        '<label style="margin:0;font-size:14px;">' + cat + '</label>' +
        '<select data-bucket-kind="' + kind + '" data-bucket-cat="' + cat + '">' + opts + '</select></div>';
    }

    function renderFields(overrides) {
      var bills = (overrides && overrides.bills) || {};
      var spending = (overrides && overrides.spending) || {};
      var html = '<h3 style="font-size:15px;margin:0 0 8px;">Bills</h3>';
      BILL_CATEGORIES.forEach(function (cat) { html += bucketSelect('bill', cat, bills[cat]); });
      html += '<h3 style="font-size:15px;margin:16px 0 8px;">Spending</h3>';
      SPENDING_CATEGORIES.forEach(function (cat) { html += bucketSelect('spending', cat, spending[cat]); });
      root.innerHTML = html;
    }

    fetchData()
      .then(function (server) {
        var o = (server && server.settings && server.settings.budgetBucketOverrides) || {};
        renderFields(o);
      })
      .catch(function () { renderFields({}); });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var bills = {};
      var spending = {};
      root.querySelectorAll('select[data-bucket-kind]').forEach(function (sel) {
        var v = sel.value;
        if (v === 'default') return;
        var cat = sel.getAttribute('data-bucket-cat');
        if (sel.getAttribute('data-bucket-kind') === 'bill') bills[cat] = v;
        else spending[cat] = v;
      });
      setBusy(form, true);
      showMessage('bucketoverrides', 'Saving…', false);
      fetchData()
        .then(function (server) {
          var snapshot = {
            bills: server.bills || [],
            cards: server.cards || [],
            payments: server.payments || [],
            settings: Object.assign({}, server.settings || {}, {
              budgetBucketOverrides: { bills: bills, spending: spending },
            }),
          };
          return pushData(snapshot);
        })
        .then(function () {
          setBusy(form, false);
          showMessage('bucketoverrides', 'Category buckets saved.', false);
        })
        .catch(function (err) {
          setBusy(form, false);
          showMessage('bucketoverrides', (err && err.message) || errorText('network'), true);
        });
    });
  }

  /* ── Autopay auto-mark ──────────────────────────────────── */
  function initAutopaySection() {
    var form    = document.querySelector('[data-form="autopay"]');
    var toggle  = document.querySelector('[data-autopay-toggle]');
    var hourSel = document.querySelector('[data-autopay-hour]');
    var timeFld = document.querySelector('[data-autopay-time-field]');
    var noteEl  = document.querySelector('[data-autopay-effective]');
    if (!form || !toggle || !hourSel) return;

    // Populate 0–23 as friendly clock times.
    for (var h = 0; h < 24; h++) {
      var ampm = h < 12 ? 'AM' : 'PM';
      var h12 = h % 12 === 0 ? 12 : h % 12;
      var opt = document.createElement('option');
      opt.value = String(h);
      opt.textContent = h12 + ':00 ' + ampm;
      hourSel.appendChild(opt);
    }
    function clampHour(v) { v = parseInt(v, 10); return (v >= 0 && v <= 23) ? v : 9; }
    function sync() {
      if (timeFld) timeFld.style.display = toggle.checked ? '' : 'none';
      if (noteEl) {
        noteEl.textContent = toggle.checked
          ? 'Autopay items are recorded paid on their due date.'
          : 'You confirm each payment yourself.';
      }
    }

    fetchData()
      .then(function (server) {
        var s = (server && server.settings) || {};
        toggle.checked = !!s.autopayMark;
        hourSel.value = String(clampHour(s.autopayMarkHour != null ? s.autopayMarkHour : 9));
        sync();
      })
      .catch(function () { sync(); });

    toggle.addEventListener('change', sync);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var on = !!toggle.checked;
      var hour = clampHour(hourSel.value);
      setBusy(form, true);
      showMessage('autopay', 'Saving…', false);
      fetchData()
        .then(function (server) {
          var snapshot = {
            bills: server.bills || [],
            cards: server.cards || [],
            payments: server.payments || [],
            settings: Object.assign({}, server.settings || {}, {
              autopayMark: on, autopayMarkHour: hour,
            }),
          };
          return pushData(snapshot);
        })
        .then(function () {
          setBusy(form, false);
          showMessage('autopay', 'Autopay setting saved.', false);
        })
        .catch(function (err) {
          setBusy(form, false);
          showMessage('autopay', (err && err.message) || errorText('network'), true);
        });
    });
  }

  /* ── iCal subscription ──────────────────────────────────── */
  function initIcalSection() {
    var emptyEl    = document.querySelector('[data-ical-empty]');
    var activeEl   = document.querySelector('[data-ical-active]');
    var urlInput   = document.querySelector('[data-ical-url]');
    var genBtn     = document.querySelector('[data-ical-generate]');
    var rotateBtn  = document.querySelector('[data-ical-rotate]');
    var disableBtn = document.querySelector('[data-ical-disable]');
    var copyBtn    = document.querySelector('[data-ical-copy]');
    if (!emptyEl || !activeEl) return;

    function urlFor(token) {
      return window.location.origin + '/api/calendar/' + token + '.ics';
    }
    function render(token) {
      if (token) {
        emptyEl.hidden = true;
        activeEl.hidden = false;
        urlInput.value = urlFor(token);
      } else {
        emptyEl.hidden = false;
        activeEl.hidden = true;
        urlInput.value = '';
      }
    }

    // Initial state.
    accountFetch('ical-token', 'GET').then(function (res) {
      if (res.ok) render(res.data.token || null);
    });

    function setTokenViaApi(method, label) {
      showMessage('ical', label + '…', false);
      accountFetch('ical-token', method).then(function (res) {
        if (handledSessionLoss(res)) return;
        if (res.ok) {
          render(res.data.token || null);
          showMessage('ical', method === 'DELETE' ? 'Subscription disabled.' : 'Subscription URL updated.', false);
        } else {
          showMessage('ical', errorText(res.data && res.data.error), true);
        }
      }).catch(function () {
        showMessage('ical', errorText('network'), true);
      });
    }

    if (genBtn)    genBtn.addEventListener('click', function () { setTokenViaApi('POST', 'Generating'); });
    if (rotateBtn) rotateBtn.addEventListener('click', function () { setTokenViaApi('POST', 'Rotating'); });
    if (disableBtn) disableBtn.addEventListener('click', function () {
      if (!confirm('Disable the subscription? Existing calendar apps will stop receiving updates.')) return;
      setTokenViaApi('DELETE', 'Disabling');
    });
    if (copyBtn) copyBtn.addEventListener('click', function () {
      if (!urlInput.value) return;
      navigator.clipboard.writeText(urlInput.value).then(
        function () { showMessage('ical', 'URL copied to clipboard.', false); },
        function () {
          urlInput.select();
          showMessage('ical', 'Press ⌘C / Ctrl+C to copy.', false);
        }
      );
    });
  }

  function downloadUrl(url) {
    var a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /* ════════════════════════════════════════════════════════════
     IMPORT — JSON full restore + per-type CSV append
  ════════════════════════════════════════════════════════════ */

  function initImportForm() {
    var form     = document.querySelector('[data-form="import"]');
    if (!form) return;
    var fileEl   = document.getElementById('import-file');
    var submit   = form.querySelector('[data-import-submit]');
    var resetBtn = form.querySelector('[data-import-reset]');
    var modeEl   = form.querySelector('[data-import-mode]');

    var pending = null; // { kind: 'json'|'csv', mode: 'replace'|'append', payload, summary }

    fileEl.addEventListener('change', function () {
      pending = null;
      submit.disabled = true;
      showMessage('import', '', false);
      modeEl.hidden = true;
      var file = fileEl.files && fileEl.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024) {
        showMessage('import', 'File is over 1 MB — that\'s much bigger than a normal export.', true);
        return;
      }
      file.text().then(function (text) {
        parseFile(file.name, text);
      }).catch(function () {
        showMessage('import', 'Could not read the file.', true);
      });
    });

    resetBtn.addEventListener('click', function () {
      fileEl.value = '';
      pending = null;
      submit.disabled = true;
      modeEl.hidden = true;
      showMessage('import', '', false);
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!pending) return;
      submit.disabled = true;
      showMessage('import', 'Importing…', false);

      if (pending.mode === 'replace') {
        if (!window.confirm('Replace ALL your current bills, cards, payments, and settings with this file? This cannot be undone.')) {
          submit.disabled = false;
          showMessage('import', 'Cancelled.', false);
          return;
        }
        pushData(pending.payload).then(onImportDone).catch(onImportError);
      } else {
        // Append: GET current, merge, PUT.
        fetchData()
          .then(function (current) {
            var merged = mergeIntoCurrent(current, pending);
            return pushData(merged);
          })
          .then(onImportDone)
          .catch(onImportError);
      }
    });

    function onImportDone() {
      showMessage('import', pending.summary + ' Reload the dashboard to see the changes.', false);
      pending = null;
      fileEl.value = '';
      modeEl.hidden = true;
      submit.disabled = true;
    }
    function onImportError(err) {
      var msg = (err && err.message) || 'Import failed.';
      showMessage('import', msg, true);
      submit.disabled = false;
    }

    function parseFile(name, text) {
      var lower = name.toLowerCase();
      try {
        if (lower.endsWith('.json')) {
          pending = parseJsonImport(text);
        } else if (lower.endsWith('.csv')) {
          pending = parseCsvImport(text);
        } else {
          // Best-effort guess by content.
          if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
            pending = parseJsonImport(text);
          } else {
            pending = parseCsvImport(text);
          }
        }
      } catch (e) {
        showMessage('import', e.message || 'Could not parse the file.', true);
        return;
      }
      modeEl.textContent =
        pending.mode === 'replace'
          ? 'JSON backup — will REPLACE all your current data. ' + pending.summary
          : 'CSV file — will ADD records to your account. ' + pending.summary;
      modeEl.hidden = false;
      submit.disabled = false;
    }
  }

  /* ── JSON ─────────────────────────────────────────────────── */
  function parseJsonImport(text) {
    var data;
    try { data = JSON.parse(text); }
    catch { throw new Error('Not a valid JSON file.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('JSON file is not an object.');
    }
    var bills = Array.isArray(data.bills) ? data.bills : [];
    var cards = Array.isArray(data.cards) ? data.cards : [];
    var payments = Array.isArray(data.payments) ? data.payments : [];
    var settings = data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
      ? data.settings : {};
    if (!bills.length && !cards.length && !payments.length && !Object.keys(settings).length) {
      throw new Error('JSON does not look like a FiHaven backup.');
    }
    return {
      kind: 'json',
      mode: 'replace',
      payload: { bills: bills, cards: cards, payments: payments, settings: settings },
      summary: bills.length + ' bills · ' + cards.length + ' cards · ' + payments.length + ' payments.',
    };
  }

  /* ── CSV ──────────────────────────────────────────────────── */
  // Minimal RFC-4180-ish parser: supports "quoted, ""escaped"" fields".
  function parseCsv(text) {
    var rows = [];
    var cur = [], field = '', inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else field += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { cur.push(field); field = ''; }
        else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
        else if (ch === '\r') { /* skip */ }
        else field += ch;
      }
    }
    if (field.length || cur.length) { cur.push(field); rows.push(cur); }
    return rows.filter(function (r) { return r.length > 1 || (r.length === 1 && r[0].length); });
  }

  function parseCsvImport(text) {
    var rows = parseCsv(text);
    if (rows.length < 2) throw new Error('CSV file looks empty.');
    var header = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var body = rows.slice(1);

    var has = function (k) { return header.indexOf(k) !== -1; };

    if (has('credit limit') || (has('balance') && has('regular apr'))) {
      var cards = body.map(function (row) {
        var get = function (k) { return row[header.indexOf(k)] || ''; };
        return {
          id: Date.now() + Math.floor(Math.random() * 1e6),
          name: get('name'),
          balance: numOrZero(get('balance')),
          limit: numOrZero(get('credit limit')),
          minPayment: numOrZero(get('min payment')),
          regularAPR: numOrZero(get('regular apr')),
          hasPromo: yesLike(get('has promo')),
          promoAPR: get('promo apr') ? numOrZero(get('promo apr')) : null,
          promoEndDate: get('promo end date') || null,
          promoBalance: get('promo balance') ? numOrZero(get('promo balance')) : null,
          dueDay: get('due day') ? parseInt(get('due day'), 10) : null,
          autopay: yesLike(get('autopay')),
          notes: get('notes'),
        };
      }).filter(function (c) { return c.name; });
      return {
        kind: 'csv', mode: 'append',
        payload: { type: 'cards', items: cards },
        summary: cards.length + ' card' + (cards.length !== 1 ? 's' : '') + ' detected.',
      };
    }

    if (has('category') && has('due day') && has('frequency')) {
      var bills = body.map(function (row) {
        var get = function (k) { return row[header.indexOf(k)] || ''; };
        return {
          id: Date.now() + Math.floor(Math.random() * 1e6),
          name: get('name'),
          category: get('category') || 'Other',
          amount: numOrZero(get('amount')),
          dueDay: get('due day') ? parseInt(get('due day'), 10) : null,
          frequency: get('frequency') || 'Monthly',
          autopay: yesLike(get('autopay')),
          notes: get('notes'),
        };
      }).filter(function (b) { return b.name; });
      return {
        kind: 'csv', mode: 'append',
        payload: { type: 'bills', items: bills },
        summary: bills.length + ' bill' + (bills.length !== 1 ? 's' : '') + ' detected.',
      };
    }

    if (has('date') && has('amount') && (has('type') || has('name'))) {
      var payments = body.map(function (row) {
        var get = function (k) { return row[header.indexOf(k)] || ''; };
        var date = get('date');
        var mk = get('month') || (date ? date.slice(0, 7) : '');
        return {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2),
          type: (get('type') || 'bill').toLowerCase(),
          refId: '',           // filled in below by matching name
          name: get('name'),
          amount: numOrZero(get('amount')),
          date: date,
          monthKey: mk,
          note: get('note'),
        };
      }).filter(function (p) { return p.name && p.date; });
      return {
        kind: 'csv', mode: 'append',
        payload: { type: 'history', items: payments },
        summary: payments.length + ' payment' + (payments.length !== 1 ? 's' : '') + ' detected. Names are matched back to your existing bills/cards.',
      };
    }

    throw new Error('Could not recognise the CSV. Headers: ' + header.join(', '));
  }

  function numOrZero(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }
  function yesLike(v) { return /^(yes|true|1)$/i.test(String(v || '').trim()); }

  /* ── Merge a CSV-derived list into the current account ──── */
  function mergeIntoCurrent(current, pending) {
    var bills    = Array.isArray(current.bills)    ? current.bills.slice()    : [];
    var cards    = Array.isArray(current.cards)    ? current.cards.slice()    : [];
    var payments = Array.isArray(current.payments) ? current.payments.slice() : [];
    var settings = current.settings && typeof current.settings === 'object' && !Array.isArray(current.settings)
      ? current.settings : {};

    var t = pending.payload.type;
    if (t === 'bills') {
      bills = bills.concat(pending.payload.items);
    } else if (t === 'cards') {
      cards = cards.concat(pending.payload.items);
    } else if (t === 'history') {
      // Best-effort name match → refId on existing bills/cards.
      pending.payload.items.forEach(function (p) {
        var byName;
        if (p.type === 'card') {
          byName = cards.find(function (c) { return c.name && c.name.toLowerCase() === p.name.toLowerCase(); });
        } else {
          byName = bills.find(function (b) { return b.name && b.name.toLowerCase() === p.name.toLowerCase(); });
        }
        if (byName) p.refId = String(byName.id);
      });
      payments = payments.concat(pending.payload.items);
    }

    return { bills: bills, cards: cards, payments: payments, settings: settings };
  }

  /* ── Auth-aware fetch helpers ─────────────────────────────── */
  function fetchData() {
    return fetch('/api/data', { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('Could not load your current data.');
      return r.json();
    });
  }

  function pushData(snapshot) {
    return csrfToken().then(function (token) {
      return fetch('/api/data', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token || '' },
        credentials: 'same-origin',
        body: JSON.stringify(snapshot),
      }).then(function (r) {
        if (!r.ok) {
          if (r.status === 401) {
            window.location.replace('/login');
            throw new Error('Session expired.');
          }
          if (r.status === 413) throw new Error('That file is too large for the server.');
          throw new Error('Server rejected the upload (' + r.status + ').');
        }
      });
    });
  }

  /* ── Bank connections (Plaid) ──────────────────────────────
     Pro-gated, optional bank linking. The section starts hidden and
     settings.js asks /api/plaid/status which of three states to show:
     unavailable (no server creds), upsell (Free user), or connected
     (Pro). Manual entry is always the default, so this never blocks
     the rest of the page. */
  function plaidFetch(path, method, body) {
    return csrfToken().then(function (token) {
      var opts = {
        method: method,
        headers: { 'X-CSRF-Token': token || '' },
        credentials: 'same-origin',
      };
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

  // Lazy-load Plaid Link's script only when a Pro user actually links.
  var plaidScriptPromise = null;
  function loadPlaidLink() {
    if (window.Plaid) return Promise.resolve(window.Plaid);
    if (plaidScriptPromise) return plaidScriptPromise;
    plaidScriptPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
      s.async = true;
      s.onload = function () { resolve(window.Plaid); };
      s.onerror = function () { reject(new Error('plaid-script')); };
      document.head.appendChild(s);
    });
    return plaidScriptPromise;
  }

  function plaidMoney(n, cur) {
    if (n == null) return '—';
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD' }).format(n);
    } catch (_) {
      return '$' + Number(n).toFixed(2);
    }
  }

  function initPlaidSection() {
    var card = document.querySelector('[data-plaid-card]');
    if (!card) return;

    var unavailEl  = card.querySelector('[data-plaid-unavailable]');
    var upsellEl   = card.querySelector('[data-plaid-upsell]');
    var connEl     = card.querySelector('[data-plaid-connected]');
    var listEl     = card.querySelector('[data-plaid-list]');
    var connectBtn = card.querySelector('[data-plaid-connect]');
    var refreshBtn = card.querySelector('[data-plaid-refresh]');
    var balancesToggle = card.querySelector('[data-plaid-balances-toggle]');

    function show(el, on) { if (el) el.hidden = !on; }

    // Opt-in: let synced bank balances update matching cards. Off by default;
    // FiHaven never overrides a typed balance unless this is on.
    if (balancesToggle) {
      fetchData().then(function (server) {
        balancesToggle.checked = !!((server && server.settings) || {}).plaidUpdateBalances;
      }).catch(function () { /* leave unchecked */ });
      balancesToggle.addEventListener('change', function () {
        showMessage('plaid', 'Saving…', false);
        fetchData().then(function (server) {
          return pushData({
            bills: server.bills || [], cards: server.cards || [], payments: server.payments || [],
            settings: Object.assign({}, server.settings || {}, { plaidUpdateBalances: balancesToggle.checked }),
          });
        }).then(function () {
          showMessage('plaid', 'Saved.', false);
        }).catch(function (err) {
          balancesToggle.checked = !balancesToggle.checked;
          showMessage('plaid', (err && err.message) || errorText('network'), true);
        });
      });
    }

    // Opt-in: import bank outflows into Spending. Off by default; FiHaven is
    // manual-entry-first, so nothing is imported unless this is on.
    var purchasesToggle = card.querySelector('[data-plaid-purchases-toggle]');
    if (purchasesToggle) {
      fetchData().then(function (server) {
        purchasesToggle.checked = !!((server && server.settings) || {}).plaidUpdatePurchases;
      }).catch(function () { /* leave unchecked */ });
      purchasesToggle.addEventListener('change', function () {
        showMessage('plaid', 'Saving…', false);
        fetchData().then(function (server) {
          return pushData({
            bills: server.bills || [], cards: server.cards || [], payments: server.payments || [],
            settings: Object.assign({}, server.settings || {}, { plaidUpdatePurchases: purchasesToggle.checked }),
          });
        }).then(function () {
          showMessage('plaid', 'Saved.', false);
        }).catch(function (err) {
          purchasesToggle.checked = !purchasesToggle.checked;
          showMessage('plaid', (err && err.message) || errorText('network'), true);
        });
      });
    }

    // Persist the link token across the OAuth full-page redirect so
    // /plaid-oauth can resume the flow. Shared key with plaid-oauth.js.
    function stashOauth(o) { try { localStorage.setItem('fh_plaid_oauth', JSON.stringify(o)); } catch (_) { /* ignore */ } }
    function clearOauth() { try { localStorage.removeItem('fh_plaid_oauth'); } catch (_) { /* ignore */ } }

    function render(status) {
      var configured = !!(status && status.configured);
      var pro = !!(status && status.pro);
      show(unavailEl, !configured);
      show(upsellEl, configured && !pro);
      show(connEl, configured && pro);
      if (!(configured && pro)) return;

      var items = (status && status.items) || [];
      listEl.innerHTML = '';
      if (!items.length) {
        var empty = document.createElement('div');
        empty.className = 'card';
        empty.style.cssText = 'padding:14px 16px;color:var(--muted);font-size:14px;';
        empty.textContent = 'No banks linked yet. Connect one to auto-fetch balances.';
        listEl.appendChild(empty);
      } else {
        items.forEach(function (it) { listEl.appendChild(renderItem(it)); });
      }
      show(refreshBtn, items.length > 0);
    }

    function renderItem(it) {
      var box = document.createElement('div');
      box.className = 'card';
      box.style.cssText = 'padding:14px 16px;';

      var head = document.createElement('div');
      head.style.cssText = 'display:flex;align-items:center;gap:10px;';
      var name = document.createElement('strong');
      name.textContent = it.institutionName || 'Bank';
      head.appendChild(name);
      if (it.status === 'new_accounts') {
        // The Item still works; just invite the user to add the new accounts.
        var naBadge = document.createElement('span');
        naBadge.className = 'badge badge-gray';
        naBadge.textContent = 'New accounts available';
        head.appendChild(naBadge);
        var addBtn = document.createElement('button');
        addBtn.className = 'btn btn-primary btn-sm';
        addBtn.textContent = 'Add accounts';
        addBtn.addEventListener('click', function () { reconnect(it.id, addBtn, true); });
        head.appendChild(addBtn);
      } else if (it.status && it.status !== 'active') {
        var badge = document.createElement('span');
        badge.className = 'badge badge-orange';
        badge.textContent = it.status === 'login_required' ? 'Reconnect needed' : it.status;
        head.appendChild(badge);
        var fix = document.createElement('button');
        fix.className = 'btn btn-primary btn-sm';
        fix.textContent = 'Reconnect';
        fix.addEventListener('click', function () { reconnect(it.id, fix); });
        head.appendChild(fix);
      }
      var del = document.createElement('button');
      del.className = 'btn btn-danger btn-sm';
      del.style.marginLeft = 'auto';
      del.textContent = 'Disconnect';
      del.addEventListener('click', function () { disconnect(it.id, del); });
      head.appendChild(del);
      box.appendChild(head);

      (it.accounts || []).forEach(function (a) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;gap:10px;font-size:13px;color:var(--muted);margin-top:8px;';
        var left = document.createElement('span');
        left.textContent = (a.name || a.subtype || 'Account') + (a.mask ? ' ••' + a.mask : '');
        var right = document.createElement('span');
        right.style.cssText = 'color:var(--text);font-weight:600;';
        right.textContent = plaidMoney(a.currentBalance, a.isoCurrency);
        row.appendChild(left);
        row.appendChild(right);
        box.appendChild(row);
      });
      return box;
    }

    function refreshStatus() {
      return plaidFetch('status', 'GET').then(function (res) {
        if (res.ok) render(res.data);
      }).catch(function () { /* leave section hidden on error */ });
    }

    function connect() {
      showMessage('plaid', 'Opening your bank…', false);
      connectBtn.disabled = true;
      Promise.all([loadPlaidLink(), plaidFetch('link/token', 'POST')]).then(function (out) {
        var Plaid = out[0];
        var res = out[1];
        connectBtn.disabled = false;
        if (!res.ok || !res.data.linkToken) {
          showMessage('plaid', res.status === 402
            ? 'Bank linking is a Pro feature.'
            : 'Could not start linking. Please try again.', true);
          return;
        }
        // Persist the token so /plaid-oauth can resume Link if the bank
        // sends the browser through a full-page OAuth redirect.
        stashOauth({ token: res.data.linkToken, mode: 'connect' });
        var handler = Plaid.create({
          token: res.data.linkToken,
          onSuccess: function (publicToken, metadata) {
            clearOauth();
            showMessage('plaid', 'Linking…', false);
            plaidFetch('link/exchange', 'POST', {
              public_token: publicToken,
              institution: metadata && metadata.institution,
            }).then(function (ex) {
              if (ex.ok) { showMessage('plaid', 'Bank linked.', false); refreshStatus(); }
              else if (ex.status === 409) { showMessage('plaid', 'That bank is already linked.', false); refreshStatus(); }
              else showMessage('plaid', 'Could not finish linking. Please try again.', true);
            }).catch(function () { showMessage('plaid', errorText('network'), true); });
          },
          onExit: function (err) {
            clearOauth();
            if (err) showMessage('plaid', 'Linking was cancelled.', false);
          },
        });
        handler.open();
      }).catch(function () {
        connectBtn.disabled = false;
        showMessage('plaid', 'Could not load Plaid. Check your connection.', true);
      });
    }

    // Update mode: re-auth an item flagged login_required, or (when
    // `accountSelection` is true) add newly-available accounts after a
    // NEW_ACCOUNTS_AVAILABLE webhook. Opens Plaid Link with an update-mode token
    // (no public-token exchange); on success we tell the server to mark the item
    // repaired and re-pull its data (which now includes any new accounts).
    function reconnect(id, btn, accountSelection) {
      btn.disabled = true;
      var adding = !!accountSelection;
      showMessage('plaid', adding ? 'Opening your bank…' : 'Reopening your bank…', false);
      Promise.all([loadPlaidLink(), plaidFetch('link/token', 'POST', { itemId: id, accountSelection: adding })]).then(function (out) {
        var Plaid = out[0];
        var res = out[1];
        btn.disabled = false;
        if (!res.ok || !res.data.linkToken) {
          showMessage('plaid', 'Could not start reconnect. Please try again.', true);
          return;
        }
        stashOauth({ token: res.data.linkToken, mode: 'update', itemId: id });
        var handler = Plaid.create({
          token: res.data.linkToken,
          onSuccess: function () {
            clearOauth();
            showMessage('plaid', adding ? 'Updating accounts…' : 'Reconnecting…', false);
            plaidFetch('item/' + id + '/repaired', 'POST').then(function (r) {
              if (r.ok) { showMessage('plaid', adding ? 'Accounts updated.' : 'Bank reconnected.', false); refreshStatus(); }
              else showMessage('plaid', adding ? 'Could not finish updating accounts.' : 'Could not finish reconnecting.', true);
            }).catch(function () { showMessage('plaid', errorText('network'), true); });
          },
          onExit: function (err) { clearOauth(); if (err) showMessage('plaid', 'Reconnect was cancelled.', false); },
        });
        handler.open();
      }).catch(function () {
        btn.disabled = false;
        showMessage('plaid', 'Could not load Plaid. Check your connection.', true);
      });
    }

    function disconnect(id, btn) {
      if (!window.confirm('Disconnect this bank? Your manually entered data is unaffected.')) return;
      btn.disabled = true;
      plaidFetch('item/' + id + '/remove', 'POST').then(function (res) {
        if (res.ok) { showMessage('plaid', 'Disconnected.', false); refreshStatus(); }
        else { btn.disabled = false; showMessage('plaid', 'Could not disconnect. Please try again.', true); }
      }).catch(function () { btn.disabled = false; showMessage('plaid', errorText('network'), true); });
    }

    function refreshBalances() {
      refreshBtn.disabled = true;
      showMessage('plaid', 'Refreshing balances…', false);
      plaidFetch('refresh', 'POST').then(function (res) {
        refreshBtn.disabled = false;
        if (res.ok) {
          showMessage('plaid', 'Balances updated.', false);
          render({ configured: true, pro: true, items: res.data.items });
        } else {
          showMessage('plaid', 'Could not refresh. Please try again.', true);
        }
      }).catch(function () { refreshBtn.disabled = false; showMessage('plaid', errorText('network'), true); });
    }

    if (connectBtn) connectBtn.addEventListener('click', connect);
    if (refreshBtn) refreshBtn.addEventListener('click', refreshBalances);

    var upsellLink = card.querySelector('[data-plaid-upsell-link]');
    if (upsellLink) upsellLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (window.openProDialog) window.openProDialog();
    });

    refreshStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
