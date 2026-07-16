/* ═══════════════════════════════════════════════════════════
   admin.js — admin tools overlay, opened from the appbar menu.
   Admins-only (the menu item is hidden otherwise, and every
   /api/admin/* route enforces the role server-side).
═══════════════════════════════════════════════════════════ */

var overlay = null;
var openMenu = null;
var grantTarget = null;
var PLAN_LABELS = {
  trial: 'Trial',
  monthly: 'Monthly',
  three_month: '3 months',
  yearly: 'Yearly',
  family: 'Family',
  lifetime: 'Lifetime',
};
var PLAN_DEFAULT_DAYS = {
  trial: 14,
  monthly: 31,
  three_month: 92,
  yearly: 366,
  family: 366,
  lifetime: null,
};

/* ── CSRF + fetch helpers ─────────────────────────────────── */
function csrf() {
  var auth = window.AppAuth;
  var t = auth && auth.getCsrfToken && auth.getCsrfToken();
  if (t) return Promise.resolve(t);
  return auth.me().then(function () { return auth.getCsrfToken(); });
}

function adminFetch(path, method, body) {
  if (!method || method === 'GET') {
    return fetch('/api/admin/' + path, { credentials: 'same-origin' })
      .then(toResult);
  }
  return csrf().then(function (token) {
    var opts = { method: method, headers: { 'X-CSRF-Token': token || '' }, credentials: 'same-origin' };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch('/api/admin/' + path, opts).then(toResult);
  });
}

function toResult(r) {
  return r.json().catch(function () { return {}; })
    .then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
}

function esc(s) {
  var d = document.createElement('div');
  d.textContent = String(s == null ? '' : s);
  return d.innerHTML;
}

function errText(code) {
  if (code === 'cannot-demote-self') return "You can't remove your own admin access.";
  if (code === 'cannot-suspend-self') return "You can't suspend your own account.";
  if (code === 'cannot-delete-self') return "You can't delete your own account from here.";
  if (code === 'confirm-email-mismatch') return 'Type the exact account email to confirm delete.';
  if (code === 'bad-plan') return 'Pick a valid Pro plan.';
  if (code === 'bad-days') return 'Enter a positive number of days.';
  if (code === 'mail-send-failed') return 'Could not send the email. Check mail config.';
  if (code === 'forbidden') return 'Admins only.';
  if (code === 'unauthenticated') return 'Your session expired — reload and sign in.';
  return 'That action failed. Please try again.';
}

function fmtWhen(ms) {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (_) { return ''; }
}

function initials(u) {
  var src = (u.name || u.email || '?').trim();
  var parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function closeMenus() {
  if (openMenu) {
    openMenu.hidden = true;
    openMenu = null;
  }
  document.querySelectorAll('.admin-more[aria-expanded="true"]').forEach(function (b) {
    b.setAttribute('aria-expanded', 'false');
  });
}

/* ── Overlay shell ────────────────────────────────────────── */
function build() {
  overlay = document.createElement('div');
  overlay.className = 'admin-overlay';
  overlay.innerHTML =
    '<div class="admin-panel" role="dialog" aria-modal="true" aria-label="Admin tools">' +
      '<header class="admin-head">' +
        '<div>' +
          '<h2 class="admin-title">Admin</h2>' +
          '<p class="admin-sub">Manage accounts, Pro grants, and promo codes.</p>' +
        '</div>' +
        '<button type="button" class="admin-close" data-admin-close aria-label="Close">×</button>' +
      '</header>' +
      '<div class="admin-body">' +
        '<section class="admin-section">' +
          '<div class="admin-section-head">' +
            '<h3>Users</h3>' +
            '<span class="admin-hint">Search, then open ··· for more actions</span>' +
          '</div>' +
          '<input type="search" class="admin-search" data-admin-search placeholder="Search by email or name…" autocomplete="off"/>' +
          '<div class="admin-msg" data-admin-msg hidden></div>' +
          '<div class="admin-users" data-admin-users></div>' +
        '</section>' +
        '<section class="admin-section admin-section-promo">' +
          '<div class="admin-section-head">' +
            '<h3>Promo codes</h3>' +
            '<span class="admin-hint">Mint a free_sub code for N days of Pro</span>' +
          '</div>' +
          '<div class="admin-promo-grid">' +
            '<label class="admin-field">' +
              '<span>Code</span>' +
              '<input data-promo-code type="text" placeholder="Auto if blank"/>' +
            '</label>' +
            '<label class="admin-field">' +
              '<span>Days</span>' +
              '<input data-promo-days type="number" min="1" value="14"/>' +
            '</label>' +
            '<label class="admin-field">' +
              '<span>Max uses</span>' +
              '<input data-promo-max type="number" min="1" placeholder="Unlimited"/>' +
            '</label>' +
            '<div class="admin-promo-actions">' +
              '<button type="button" class="btn btn-primary btn-sm" data-promo-create>Create</button>' +
            '</div>' +
          '</div>' +
          '<div class="admin-promo-msg" data-promo-msg></div>' +
        '</section>' +
      '</div>' +
      // Grant Pro sheet
      '<div class="admin-sheet" data-grant-sheet hidden>' +
        '<div class="admin-sheet-card">' +
          '<div class="admin-sheet-head">' +
            '<h3 data-grant-title>Grant Pro</h3>' +
            '<button type="button" class="admin-close" data-grant-cancel aria-label="Cancel">×</button>' +
          '</div>' +
          '<p class="admin-sheet-email" data-grant-email></p>' +
          '<label class="admin-field">' +
            '<span>Plan</span>' +
            '<select data-grant-plan>' +
              '<option value="trial">Trial</option>' +
              '<option value="monthly">Monthly</option>' +
              '<option value="three_month">3 months</option>' +
              '<option value="yearly">Yearly</option>' +
              '<option value="family">Family</option>' +
              '<option value="lifetime">Lifetime</option>' +
            '</select>' +
          '</label>' +
          '<label class="admin-field" data-grant-days-wrap>' +
            '<span>Days <em data-grant-days-hint></em></span>' +
            '<input data-grant-days type="number" min="1" placeholder="Default"/>' +
          '</label>' +
          '<div class="admin-sheet-actions">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-grant-cancel>Cancel</button>' +
            '<button type="button" class="btn btn-primary btn-sm" data-grant-submit>Grant Pro</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  overlay.addEventListener('mousedown', function (e) {
    if (e.target === overlay) hide();
    else if (!e.target.closest('.admin-menu') && !e.target.closest('.admin-more')) closeMenus();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);

  overlay.querySelector('[data-admin-close]').addEventListener('click', hide);

  var search = overlay.querySelector('[data-admin-search]');
  var debounce;
  search.addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () { reload(search.value); }, 250);
  });

  overlay.querySelector('[data-promo-create]').addEventListener('click', createPromo);

  overlay.querySelectorAll('[data-grant-cancel]').forEach(function (b) {
    b.addEventListener('click', hideGrant);
  });
  overlay.querySelector('[data-grant-plan]').addEventListener('change', syncGrantDays);
  overlay.querySelector('[data-grant-submit]').addEventListener('click', submitGrant);
}

function onKey(e) {
  if (e.key !== 'Escape' || !overlay || overlay.style.display === 'none') return;
  if (openMenu) { closeMenus(); return; }
  var sheet = overlay.querySelector('[data-grant-sheet]');
  if (sheet && !sheet.hidden) { hideGrant(); return; }
  hide();
}

function hide() {
  closeMenus();
  hideGrant();
  if (overlay) overlay.style.display = 'none';
}

function setMsg(text, ok) {
  var el = overlay && overlay.querySelector('[data-admin-msg]');
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.className = 'admin-msg' + (ok ? ' is-ok' : ' is-err');
  el.textContent = text;
}

function setOk(text) { setMsg(text, true); }

/* ── Grant sheet ──────────────────────────────────────────── */
function showGrant(u, search) {
  grantTarget = { user: u, search: search };
  var sheet = overlay.querySelector('[data-grant-sheet]');
  overlay.querySelector('[data-grant-title]').textContent = u.pro ? 'Change Pro' : 'Grant Pro';
  overlay.querySelector('[data-grant-email]').textContent = u.email;
  var planEl = overlay.querySelector('[data-grant-plan]');
  planEl.value = (u.proPlan && PLAN_LABELS[u.proPlan]) ? u.proPlan : 'trial';
  syncGrantDays();
  var daysEl = overlay.querySelector('[data-grant-days]');
  daysEl.value = planEl.value === 'trial' ? '14' : '';
  sheet.hidden = false;
}

function hideGrant() {
  grantTarget = null;
  var sheet = overlay && overlay.querySelector('[data-grant-sheet]');
  if (sheet) sheet.hidden = true;
}

function syncGrantDays() {
  var plan = overlay.querySelector('[data-grant-plan]').value;
  var wrap = overlay.querySelector('[data-grant-days-wrap]');
  var hint = overlay.querySelector('[data-grant-days-hint]');
  var def = PLAN_DEFAULT_DAYS[plan];
  wrap.hidden = plan === 'lifetime';
  hint.textContent = def != null ? '(default ' + def + ')' : '';
}

function submitGrant() {
  if (!grantTarget) return;
  var u = grantTarget.user;
  var search = grantTarget.search;
  var plan = overlay.querySelector('[data-grant-plan]').value;
  var daysStr = String(overlay.querySelector('[data-grant-days]').value || '').trim();
  var body = { grant: true, plan: plan };
  if (plan !== 'lifetime' && daysStr) {
    var days = parseInt(daysStr, 10);
    if (!days || days <= 0) { setMsg('Enter a positive number of days.'); return; }
    body.days = days;
  }
  hideGrant();
  act('users/' + u.id + '/pro', body, search, 'Granted ' + (PLAN_LABELS[plan] || plan) + '.');
}

/* ── User list + actions ──────────────────────────────────── */
function act(path, body, search, okMsg) {
  adminFetch(path, 'POST', body).then(function (res) {
    if (res.ok) {
      if (okMsg) setOk(okMsg);
      reload(search);
    } else setMsg(errText(res.data && res.data.error));
  }).catch(function () { setMsg('Network error. Please try again.'); });
}

function askDelete(u, search) {
  var typed = window.prompt(
    'Permanently delete ' + u.email + ' and ALL of their data?\n\n' +
      'Type their email exactly to confirm:'
  );
  if (typed == null) return;
  act('users/' + u.id + '/delete', { confirmEmail: typed.trim() }, search, 'Account deleted.');
}

function pill(label, kind) {
  return '<span class="admin-pill admin-pill-' + kind + '">' + esc(label) + '</span>';
}

function menuItem(label, action, danger) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'admin-menu-item' + (danger ? ' is-danger' : '');
  b.textContent = label;
  b.addEventListener('click', function () {
    closeMenus();
    action();
  });
  return b;
}

function menuSep() {
  var d = document.createElement('div');
  d.className = 'admin-menu-sep';
  return d;
}

function render(users, search) {
  closeMenus();
  var listEl = overlay.querySelector('[data-admin-users]');
  listEl.innerHTML = '';
  if (!users.length) {
    listEl.innerHTML = '<div class="admin-empty">No matching users.</div>';
    return;
  }

  users.forEach(function (u) {
    var row = document.createElement('div');
    row.className = 'admin-user' + (u.suspended ? ' is-suspended' : '');

    var pills = '';
    if (u.role === 'admin') pills += pill('Admin', 'admin');
    if (u.suspended) pills += pill('Suspended', 'warn');
    if (u.pro) {
      var plan = PLAN_LABELS[u.proPlan] || u.proPlan || 'Pro';
      pills += pill(plan + (u.proExpiresAt ? ' · ' + fmtWhen(u.proExpiresAt) : ''), 'pro');
    } else {
      pills += pill('Free', 'free');
    }

    var meta = '';
    if (u.suspendedReason) meta = '<div class="admin-user-reason">' + esc(u.suspendedReason) + '</div>';

    row.innerHTML =
      '<div class="admin-avatar" aria-hidden="true">' + esc(initials(u)) + '</div>' +
      '<div class="admin-user-main">' +
        '<div class="admin-user-name">' + esc(u.name || u.email) + '</div>' +
        (u.name ? '<div class="admin-user-email">' + esc(u.email) + '</div>' : '') +
        '<div class="admin-pills">' + pills + '</div>' +
        meta +
      '</div>' +
      '<div class="admin-user-actions"></div>';

    var actions = row.querySelector('.admin-user-actions');

    var primary = document.createElement('button');
    primary.type = 'button';
    primary.className = 'btn btn-primary btn-sm';
    primary.textContent = u.pro ? 'Manage Pro' : 'Grant Pro';
    primary.addEventListener('click', function () { showGrant(u, search); });
    actions.appendChild(primary);

    var wrap = document.createElement('div');
    wrap.className = 'admin-more-wrap';

    var more = document.createElement('button');
    more.type = 'button';
    more.className = 'admin-more';
    more.setAttribute('aria-label', 'More actions');
    more.setAttribute('aria-expanded', 'false');
    more.innerHTML = '<span></span><span></span><span></span>';

    var menu = document.createElement('div');
    menu.className = 'admin-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');

    more.addEventListener('click', function (e) {
      e.stopPropagation();
      var wasOpen = openMenu === menu;
      closeMenus();
      if (wasOpen) return;
      menu.hidden = false;
      more.setAttribute('aria-expanded', 'true');
      openMenu = menu;
    });

    if (u.pro && u.proSource === 'comp') {
      menu.appendChild(menuItem('Revoke comp Pro', function () {
        act('users/' + u.id + '/pro', { grant: false }, search, 'Comp Pro revoked.');
      }));
    }
    menu.appendChild(menuItem(u.suspended ? 'Unsuspend account' : 'Suspend account', function () {
      var reason = '';
      if (!u.suspended) {
        reason = window.prompt('Optional suspend reason (shown to the user):', '');
        if (reason === null) return;
      }
      act('users/' + u.id + '/suspend', { suspend: !u.suspended, reason: reason }, search,
        u.suspended ? 'Account unsuspended.' : 'Account suspended.');
    }));
    menu.appendChild(menuItem('Send password reset', function () {
      if (!window.confirm('Send a password-reset email to ' + u.email + '?')) return;
      act('users/' + u.id + '/reset-password', {}, search, 'Password-reset email sent.');
    }));
    menu.appendChild(menuItem('Force logout', function () {
      act('users/' + u.id + '/logout', {}, search, 'All sessions cleared.');
    }));
    menu.appendChild(menuItem(u.role === 'admin' ? 'Remove admin' : 'Make admin', function () {
      act('users/' + u.id + '/role', { role: u.role === 'admin' ? 'user' : 'admin' }, search);
    }));
    menu.appendChild(menuSep());
    menu.appendChild(menuItem('Delete account…', function () { askDelete(u, search); }, true));

    wrap.appendChild(more);
    wrap.appendChild(menu);
    actions.appendChild(wrap);
    listEl.appendChild(row);
  });
}

function reload(search) {
  adminFetch('users?limit=50&q=' + encodeURIComponent(search || '')).then(function (res) {
    if (res.ok) render(res.data.users || [], search || '');
    else setMsg(res.status === 403 ? 'Admins only.' : 'Could not load users.');
  }).catch(function () { setMsg('Network error loading users.'); });
}

function createPromo() {
  var codeEl = overlay.querySelector('[data-promo-code]');
  var daysEl = overlay.querySelector('[data-promo-days]');
  var maxEl = overlay.querySelector('[data-promo-max]');
  var msgEl = overlay.querySelector('[data-promo-msg]');
  var days = parseInt(daysEl.value, 10);
  if (!days || days <= 0) {
    msgEl.className = 'admin-promo-msg is-err';
    msgEl.textContent = 'Enter a positive number of days.';
    return;
  }
  var body = { grantDays: days };
  if (codeEl.value.trim()) body.code = codeEl.value.trim();
  if (maxEl.value.trim()) body.maxRedemptions = parseInt(maxEl.value, 10);
  msgEl.className = 'admin-promo-msg';
  msgEl.textContent = 'Creating…';
  adminFetch('promo', 'POST', body).then(function (res) {
    if (res.ok) {
      msgEl.className = 'admin-promo-msg is-ok';
      msgEl.textContent = 'Created · ' + (res.data.promo && res.data.promo.code);
      codeEl.value = '';
    } else {
      msgEl.className = 'admin-promo-msg is-err';
      msgEl.textContent = errText(res.data && res.data.error);
    }
  }).catch(function () {
    msgEl.className = 'admin-promo-msg is-err';
    msgEl.textContent = 'Network error.';
  });
}

/* ── Public entry (wired from the appbar menu) ────────────── */
export function openAdminTools() {
  if (!overlay) build();
  overlay.style.display = 'flex';
  var search = overlay.querySelector('[data-admin-search]');
  search.value = '';
  setMsg('');
  reload('');
  search.focus();
}
