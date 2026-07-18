/* ═══════════════════════════════════════════════════════════
   admin.js — admin tools overlay, opened from the appbar menu.
   Admins-only (the menu item is hidden otherwise, and every
   /api/admin/* route enforces the role server-side).
═══════════════════════════════════════════════════════════ */

var overlay = null;
var openMenu = null;
var grantTarget = null;
/** Page size for the users list (persisted for the overlay session). */
var usersPageSize = 25;
var usersPage = 1;
/** Rewards catalog pager / filters. */
var rewardsPageSize = 50;
var rewardsPage = 1;
var rewardsIssuer = '';
var cardEditId = null;
var PAGE_SIZES = [10, 25, 50, 100];
var PLAN_LABELS = {
  trial: 'Trial',
  monthly: 'Monthly',
  three_month: '3 months',
  yearly: 'Yearly',
  family: 'Family',
  lifetime: 'Lifetime',
};
var SOURCE_LABELS = {
  apple: 'App Store',
  google: 'Play Store',
  stripe: 'Web',
  comp: 'Admin',
  promo: 'Promo',
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
  if (code === 'id-taken') return 'That card id already exists.';
  if (code === 'bad-id') return 'Card id must be letters, numbers, and hyphens.';
  if (code === 'missing-fields') return 'Issuer, name, and network are required.';
  if (code === 'bad-reward-base') return 'Enter a valid base rate.';
  if (code === 'bad-point-value') return 'Enter a valid cents-per-point value.';
  if (code === 'not-found') return 'That card was not found.';
  return 'That action failed. Please try again.';
}

function fmtWhen(ms) {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (_) { return ''; }
}

function fmtRelative(ms, neverLabel) {
  if (!ms) return neverLabel || 'Never';
  var diff = Date.now() - ms;
  if (diff < 0) return fmtWhen(ms);
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  var days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 14) return days + 'd ago';
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch (_) { return fmtWhen(ms); }
}

function fmtLastLogin(ms, opts) {
  // last_login_at is only set on auth completion. Long-lived sessions and
  // accounts created before tracking can leave it NULL even when the user
  // has synced data — don't claim "Never logged in" in that case.
  if (ms) return fmtRelative(ms, 'Never signed in');
  if (opts && (opts.lastUsedAt || opts.createdAt)) return 'Unknown (pre-tracking)';
  return 'Never signed in';
}

function fmtLastUsed(ms) {
  // user_data.updated_at — last data sync write, not last app open.
  return fmtRelative(ms, 'No sync yet');
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
    openMenu.classList.remove('is-up');
    openMenu = null;
  }
  document.querySelectorAll('.admin-more[aria-expanded="true"]').forEach(function (b) {
    b.setAttribute('aria-expanded', 'false');
  });
}

function openUserMenu(more, menu) {
  var wasOpen = openMenu === menu;
  closeMenus();
  if (wasOpen) return;
  menu.classList.remove('is-up');
  menu.hidden = false;
  more.setAttribute('aria-expanded', 'true');
  openMenu = menu;
  // Flip upward when the menu would run off the bottom of the viewport
  // (common for users near the promo section).
  var rect = menu.getBoundingClientRect();
  if (rect.bottom > window.innerHeight - 12) {
    menu.classList.add('is-up');
  }
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
          '<p class="admin-sub">Manage accounts, reward rates, and promo codes.</p>' +
        '</div>' +
        '<button type="button" class="admin-close" data-admin-close aria-label="Close">×</button>' +
      '</header>' +
      '<nav class="admin-tabs" role="tablist" aria-label="Admin sections">' +
        '<button type="button" class="tab-btn active" role="tab" aria-selected="true" data-admin-tab="users">Users</button>' +
        '<button type="button" class="tab-btn" role="tab" aria-selected="false" data-admin-tab="rewards">Rewards</button>' +
        '<button type="button" class="tab-btn" role="tab" aria-selected="false" data-admin-tab="promos">Promos</button>' +
      '</nav>' +
      '<div class="admin-body">' +
        '<section class="admin-section" data-admin-tab-panel="users" role="tabpanel">' +
          '<div class="admin-section-head">' +
            '<h3 data-admin-users-title>Users</h3>' +
            '<span class="admin-hint">Search, then open ··· for more actions</span>' +
          '</div>' +
          '<div class="admin-users-toolbar">' +
            '<input type="search" class="admin-search" data-admin-search placeholder="Search by email or name…" autocomplete="off"/>' +
            '<label class="admin-page-size">' +
              '<span>Show</span>' +
              '<select data-admin-page-size aria-label="Accounts per page">' +
                PAGE_SIZES.map(function (n) {
                  return '<option value="' + n + '"' + (n === usersPageSize ? ' selected' : '') + '>' + n + '</option>';
                }).join('') +
              '</select>' +
            '</label>' +
          '</div>' +
          '<div class="admin-msg" data-admin-msg hidden></div>' +
          '<div class="admin-users" data-admin-users></div>' +
          '<div class="admin-pager" data-admin-pager hidden></div>' +
        '</section>' +
        '<section class="admin-section" data-admin-tab-panel="rewards" role="tabpanel" hidden>' +
          '<div class="admin-section-head">' +
            '<h3 data-rewards-title>Reward cards</h3>' +
            '<span class="admin-hint">Edit base %, category rates, and point value</span>' +
          '</div>' +
          '<div class="admin-users-toolbar">' +
            '<input type="search" class="admin-search" data-rewards-search placeholder="Search cards…" autocomplete="off"/>' +
            '<label class="admin-page-size">' +
              '<span>Issuer</span>' +
              '<select data-rewards-issuer aria-label="Filter by issuer">' +
                '<option value="">All</option>' +
              '</select>' +
            '</label>' +
            '<button type="button" class="btn btn-primary btn-sm" data-rewards-add>Add card</button>' +
          '</div>' +
          '<div class="admin-msg" data-rewards-msg hidden></div>' +
          '<div class="admin-rewards" data-rewards-list></div>' +
          '<div class="admin-pager" data-rewards-pager hidden></div>' +
        '</section>' +
        '<section class="admin-section" data-admin-tab-panel="promos" role="tabpanel" hidden>' +
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
          '<div class="admin-promo-list-head">Active codes</div>' +
          '<div class="admin-promo-list" data-promo-list></div>' +
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
      // Card preset edit sheet
      '<div class="admin-sheet" data-card-sheet hidden>' +
        '<div class="admin-sheet-card admin-sheet-card-wide">' +
          '<div class="admin-sheet-head">' +
            '<h3 data-card-sheet-title>Edit card</h3>' +
            '<button type="button" class="admin-close" data-card-cancel aria-label="Cancel">×</button>' +
          '</div>' +
          '<div class="admin-card-form">' +
            '<label class="admin-field">' +
              '<span>Id</span>' +
              '<input data-card-id type="text" placeholder="chase-csp" autocomplete="off"/>' +
            '</label>' +
            '<label class="admin-field">' +
              '<span>Issuer</span>' +
              '<input data-card-issuer type="text" placeholder="Chase" autocomplete="off"/>' +
            '</label>' +
            '<label class="admin-field">' +
              '<span>Name</span>' +
              '<input data-card-name type="text" placeholder="Sapphire Preferred" autocomplete="off"/>' +
            '</label>' +
            '<label class="admin-field">' +
              '<span>Network</span>' +
              '<input data-card-network type="text" placeholder="Visa" autocomplete="off"/>' +
            '</label>' +
            '<label class="admin-field">' +
              '<span>Base rate (%)</span>' +
              '<input data-card-base type="number" min="0" step="0.1" value="1"/>' +
            '</label>' +
            '<label class="admin-field">' +
              '<span>Point value (¢)</span>' +
              '<input data-card-points type="number" min="0" step="0.1" placeholder="1 = cash back"/>' +
            '</label>' +
            '<label class="admin-field admin-field-span">' +
              '<span>Category rates <em>one per line: Dining:4</em></span>' +
              '<textarea data-card-categories rows="5" placeholder="Dining: 4&#10;Travel: 3"></textarea>' +
            '</label>' +
            '<label class="admin-field">' +
              '<span>Rotating rate (%)</span>' +
              '<input data-card-rot-rate type="number" min="0" step="0.1" placeholder="Optional"/>' +
            '</label>' +
            '<label class="admin-field admin-field-span">' +
              '<span>Rotating pool <em>comma-separated categories</em></span>' +
              '<input data-card-rot-pool type="text" placeholder="Gas, Groceries, Dining"/>' +
            '</label>' +
          '</div>' +
          '<div class="admin-msg" data-card-sheet-msg hidden></div>' +
          '<div class="admin-sheet-actions">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-card-cancel>Cancel</button>' +
            '<button type="button" class="btn btn-primary btn-sm" data-card-save>Save</button>' +
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

  overlay.querySelectorAll('[data-admin-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showAdminTab(btn.getAttribute('data-admin-tab'));
    });
  });

  var search = overlay.querySelector('[data-admin-search]');
  var debounce;
  search.addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () {
      usersPage = 1;
      reload(search.value);
    }, 250);
  });

  overlay.querySelector('[data-admin-page-size]').addEventListener('change', function (e) {
    var n = parseInt(e.target.value, 10);
    if (!PAGE_SIZES.includes(n)) return;
    usersPageSize = n;
    usersPage = 1;
    reload(search.value);
  });

  var rewardsSearch = overlay.querySelector('[data-rewards-search]');
  var rewardsDebounce;
  rewardsSearch.addEventListener('input', function () {
    clearTimeout(rewardsDebounce);
    rewardsDebounce = setTimeout(function () {
      rewardsPage = 1;
      reloadRewards();
    }, 250);
  });
  overlay.querySelector('[data-rewards-issuer]').addEventListener('change', function (e) {
    rewardsIssuer = String(e.target.value || '');
    rewardsPage = 1;
    reloadRewards();
  });
  overlay.querySelector('[data-rewards-add]').addEventListener('click', function () {
    openCardSheet(null);
  });

  overlay.querySelector('[data-promo-create]').addEventListener('click', createPromo);

  overlay.querySelectorAll('[data-grant-cancel]').forEach(function (b) {
    b.addEventListener('click', hideGrant);
  });
  overlay.querySelector('[data-grant-plan]').addEventListener('change', syncGrantDays);
  overlay.querySelector('[data-grant-submit]').addEventListener('click', submitGrant);

  overlay.querySelectorAll('[data-card-cancel]').forEach(function (b) {
    b.addEventListener('click', hideCardSheet);
  });
  overlay.querySelector('[data-card-save]').addEventListener('click', saveCardSheet);
}

function showAdminTab(name) {
  if (!overlay) return;
  overlay.querySelectorAll('[data-admin-tab]').forEach(function (btn) {
    var on = btn.getAttribute('data-admin-tab') === name;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  overlay.querySelectorAll('[data-admin-tab-panel]').forEach(function (panel) {
    panel.hidden = panel.getAttribute('data-admin-tab-panel') !== name;
  });
  if (name === 'users') {
    var search = overlay.querySelector('[data-admin-search]');
    if (search) search.focus();
  } else if (name === 'rewards') {
    reloadRewards();
    var rs = overlay.querySelector('[data-rewards-search]');
    if (rs) rs.focus();
  } else if (name === 'promos') {
    reloadPromos();
  }
}

function onKey(e) {
  if (e.key !== 'Escape' || !overlay || overlay.style.display === 'none') return;
  if (openMenu) { closeMenus(); return; }
  var cardSheet = overlay.querySelector('[data-card-sheet]');
  if (cardSheet && !cardSheet.hidden) { hideCardSheet(); return; }
  var sheet = overlay.querySelector('[data-grant-sheet]');
  if (sheet && !sheet.hidden) { hideGrant(); return; }
  hide();
}

function hide() {
  closeMenus();
  hideGrant();
  hideCardSheet();
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

function render(users, search, meta) {
  closeMenus();
  meta = meta || {};
  var total = meta.total != null ? meta.total : users.length;
  var page = meta.page || 1;
  var pages = meta.pages || 1;
  var limit = meta.limit || usersPageSize;

  var title = overlay.querySelector('[data-admin-users-title]');
  if (title) {
    title.textContent = total === 1 ? 'Users (1)' : 'Users (' + total + ')';
  }

  var listEl = overlay.querySelector('[data-admin-users]');
  listEl.innerHTML = '';
  if (!users.length) {
    listEl.innerHTML = '<div class="admin-empty">No matching users.</div>';
    renderPager(search, { total: 0, page: 1, pages: 1, limit: limit });
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
      var src = SOURCE_LABELS[u.proSource] || (u.proSource ? String(u.proSource) : '');
      if (src) pills += pill(src, 'source');
    } else {
      pills += pill('Free', 'free');
    }

    // Last sign-in = users.last_login_at (auth only). Last data sync =
    // user_data.updated_at (any PUT /api/data, Plaid, scheduler) — not app open.
    var metaHtml = '<div class="admin-user-login">Last sign-in · ' + esc(fmtLastLogin(u.lastLoginAt, u)) + '</div>' +
      '<div class="admin-user-login">Last data sync · ' + esc(fmtLastUsed(u.lastUsedAt)) + '</div>';
    if (u.suspendedReason) {
      metaHtml += '<div class="admin-user-reason">' + esc(u.suspendedReason) + '</div>';
    }

    row.innerHTML =
      '<div class="admin-avatar" aria-hidden="true">' + esc(initials(u)) + '</div>' +
      '<div class="admin-user-main">' +
        '<div class="admin-user-name">' + esc(u.name || u.email) + '</div>' +
        (u.name ? '<div class="admin-user-email">' + esc(u.email) + '</div>' : '') +
        '<div class="admin-pills">' + pills + '</div>' +
        metaHtml +
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
      openUserMenu(more, menu);
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

  renderPager(search, { total: total, page: page, pages: pages, limit: limit });
}

function renderPager(search, meta) {
  var pager = overlay.querySelector('[data-admin-pager]');
  if (!pager) return;
  var total = meta.total || 0;
  var page = meta.page || 1;
  var pages = Math.max(1, meta.pages || 1);
  var limit = meta.limit || usersPageSize;

  if (total === 0) {
    pager.hidden = true;
    pager.innerHTML = '';
    return;
  }

  var from = (page - 1) * limit + 1;
  var to = Math.min(page * limit, total);
  pager.hidden = false;
  pager.innerHTML = '';

  var info = document.createElement('span');
  info.className = 'admin-pager-info';
  info.textContent = from + '–' + to + ' of ' + total;

  var nav = document.createElement('div');
  nav.className = 'admin-pager-nav';

  var prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'btn btn-ghost btn-sm';
  prev.textContent = 'Previous';
  prev.disabled = page <= 1;
  prev.addEventListener('click', function () {
    if (usersPage <= 1) return;
    usersPage -= 1;
    reload(search);
  });

  var pageLabel = document.createElement('span');
  pageLabel.className = 'admin-pager-page';
  pageLabel.textContent = 'Page ' + page + ' of ' + pages;

  var next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn btn-ghost btn-sm';
  next.textContent = 'Next';
  next.disabled = page >= pages;
  next.addEventListener('click', function () {
    if (usersPage >= pages) return;
    usersPage += 1;
    reload(search);
  });

  nav.appendChild(prev);
  nav.appendChild(pageLabel);
  nav.appendChild(next);
  pager.appendChild(info);
  pager.appendChild(nav);
}

function reload(search) {
  var q = encodeURIComponent(search || '');
  var url = 'users?limit=' + usersPageSize + '&page=' + usersPage + '&q=' + q;
  adminFetch(url).then(function (res) {
    if (res.ok) {
      usersPage = res.data.page || usersPage;
      usersPageSize = res.data.limit || usersPageSize;
      var sizeEl = overlay.querySelector('[data-admin-page-size]');
      if (sizeEl && String(sizeEl.value) !== String(usersPageSize)) {
        sizeEl.value = String(usersPageSize);
      }
      render(res.data.users || [], search || '', {
        total: res.data.total,
        page: res.data.page,
        pages: res.data.pages,
        limit: res.data.limit,
      });
    } else setMsg(res.status === 403 ? 'Admins only.' : 'Could not load users.');
  }).catch(function () { setMsg('Network error loading users.'); });
}

function promoMeta(p) {
  var bits = [];
  if (p.grantDays != null) bits.push(p.grantDays + 'd Pro');
  else if (p.kind === 'free_sub') bits.push('Lifetime Pro');
  else bits.push(p.kind || 'promo');
  bits.push((p.redeemedCount || 0) + (p.maxRedemptions != null ? '/' + p.maxRedemptions : '') + ' used');
  if (p.expiresAt) bits.push('expires ' + fmtWhen(p.expiresAt));
  return bits.join(' · ');
}

function renderPromos(promos) {
  var listEl = overlay.querySelector('[data-promo-list]');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!promos.length) {
    listEl.innerHTML = '<div class="admin-empty">No active promo codes.</div>';
    return;
  }
  promos.forEach(function (p) {
    var row = document.createElement('div');
    row.className = 'admin-promo-row' + (p.redeemable ? '' : ' is-stale');

    var status = p.redeemable
      ? pill('Redeemable', 'pro')
      : (p.exhausted ? pill('Exhausted', 'free') : pill('Expired', 'warn'));

    row.innerHTML =
      '<div class="admin-promo-main">' +
        '<div class="admin-promo-code">' + esc(p.code) + '</div>' +
        '<div class="admin-promo-meta">' + esc(promoMeta(p)) +
          (p.note ? ' · ' + esc(p.note) : '') +
        '</div>' +
        '<div class="admin-pills">' + status + '</div>' +
      '</div>' +
      '<div class="admin-promo-row-actions"></div>';

    var actions = row.querySelector('.admin-promo-row-actions');

    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn btn-ghost btn-sm';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', function () {
      var done = function () {
        copyBtn.textContent = 'Copied';
        setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(p.code).then(done).catch(function () {
          window.prompt('Copy code:', p.code);
        });
      } else {
        window.prompt('Copy code:', p.code);
      }
    });
    actions.appendChild(copyBtn);

    var offBtn = document.createElement('button');
    offBtn.type = 'button';
    offBtn.className = 'btn btn-ghost btn-sm';
    offBtn.textContent = 'Deactivate';
    offBtn.addEventListener('click', function () {
      if (!window.confirm('Deactivate ' + p.code + '? It won’t redeem anymore.')) return;
      adminFetch('promo/' + encodeURIComponent(p.code) + '/deactivate', 'POST', {}).then(function (res) {
        if (res.ok) reloadPromos();
        else {
          var msgEl = overlay.querySelector('[data-promo-msg]');
          msgEl.className = 'admin-promo-msg is-err';
          msgEl.textContent = errText(res.data && res.data.error);
        }
      });
    });
    actions.appendChild(offBtn);

    listEl.appendChild(row);
  });
}

function reloadPromos() {
  adminFetch('promo').then(function (res) {
    if (res.ok) renderPromos(res.data.promos || []);
    else {
      var listEl = overlay.querySelector('[data-promo-list]');
      if (listEl) listEl.innerHTML = '<div class="admin-empty">Could not load promo codes.</div>';
    }
  }).catch(function () {
    var listEl = overlay.querySelector('[data-promo-list]');
    if (listEl) listEl.innerHTML = '<div class="admin-empty">Could not load promo codes.</div>';
  });
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
      reloadPromos();
    } else {
      msgEl.className = 'admin-promo-msg is-err';
      msgEl.textContent = errText(res.data && res.data.error);
    }
  }).catch(function () {
    msgEl.className = 'admin-promo-msg is-err';
    msgEl.textContent = 'Network error.';
  });
}

/* ── Rewards catalog ──────────────────────────────────────── */
function setRewardsMsg(text, ok) {
  var el = overlay && overlay.querySelector('[data-rewards-msg]');
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.className = 'admin-msg ' + (ok ? 'is-ok' : 'is-err');
  el.textContent = text;
}

function fmtCats(cats) {
  var keys = Object.keys(cats || {});
  if (!keys.length) return '—';
  return keys.slice(0, 4).map(function (k) {
    return k + ' ' + cats[k] + '%';
  }).join(' · ') + (keys.length > 4 ? ' +' + (keys.length - 4) : '');
}

function renderRewards(data) {
  var total = data.total || 0;
  var title = overlay.querySelector('[data-rewards-title]');
  if (title) {
    title.textContent = total === 1 ? 'Reward cards (1)' : 'Reward cards (' + total + ')';
  }

  var issuerSel = overlay.querySelector('[data-rewards-issuer]');
  if (issuerSel) {
    var cur = rewardsIssuer;
    var opts = ['<option value="">All</option>'].concat(
      (data.issuers || []).map(function (iss) {
        return '<option value="' + esc(iss) + '"' + (iss === cur ? ' selected' : '') + '>' + esc(iss) + '</option>';
      })
    );
    issuerSel.innerHTML = opts.join('');
  }

  var listEl = overlay.querySelector('[data-rewards-list]');
  var presets = data.presets || [];
  if (!presets.length) {
    listEl.innerHTML = '<div class="admin-empty">No cards match.</div>';
  } else {
    listEl.innerHTML = presets.map(function (p) {
      var pts = p.pointValue != null ? (p.pointValue + '¢/pt') : 'cash';
      var rot = p.rotatingRate != null ? (' · rotating ' + p.rotatingRate + '%') : '';
      return (
        '<div class="admin-reward" data-preset-id="' + esc(p.id) + '">' +
          '<div class="admin-reward-main">' +
            '<div class="admin-reward-name">' + esc(p.issuer) + ' · ' + esc(p.name) + '</div>' +
            '<div class="admin-reward-meta">' +
              esc(p.network) + ' · base ' + esc(String(p.rewardBase)) + '% · ' + esc(pts) + esc(rot) +
            '</div>' +
            '<div class="admin-reward-cats">' + esc(fmtCats(p.rewardCategories)) + '</div>' +
          '</div>' +
          '<div class="admin-reward-actions">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-reward-edit>Edit</button>' +
            '<button type="button" class="btn btn-ghost btn-sm admin-reward-del" data-reward-del>Delete</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
    listEl.querySelectorAll('[data-reward-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = btn.closest('[data-preset-id]');
        var id = row && row.getAttribute('data-preset-id');
        var preset = presets.find(function (x) { return x.id === id; });
        if (preset) openCardSheet(preset);
      });
    });
    listEl.querySelectorAll('[data-reward-del]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var row = btn.closest('[data-preset-id]');
        var id = row && row.getAttribute('data-preset-id');
        if (!id) return;
        if (!window.confirm('Delete reward card "' + id + '"?')) return;
        adminFetch('card-presets/' + encodeURIComponent(id), 'DELETE').then(function (res) {
          if (res.ok) {
            setRewardsMsg('Deleted ' + id + '.', true);
            reloadRewards();
            import('./cardPresets.js').then(function (m) {
              if (m.loadCardPresetsFromServer) m.loadCardPresetsFromServer();
            }).catch(function () {});
          } else {
            setRewardsMsg(errText(res.data && res.data.error), false);
          }
        });
      });
    });
  }

  var pager = overlay.querySelector('[data-rewards-pager]');
  var pages = Math.max(1, data.pages || 1);
  if (pages <= 1) {
    pager.hidden = true;
    pager.innerHTML = '';
    return;
  }
  pager.hidden = false;
  pager.innerHTML =
    '<span class="admin-pager-info">Page ' + (data.page || 1) + ' of ' + pages + '</span>' +
    '<div class="admin-pager-nav">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-rewards-prev' +
        (data.page <= 1 ? ' disabled' : '') + '>Previous</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-rewards-next' +
        (data.page >= pages ? ' disabled' : '') + '>Next</button>' +
    '</div>';
  var prev = pager.querySelector('[data-rewards-prev]');
  var next = pager.querySelector('[data-rewards-next]');
  if (prev) prev.addEventListener('click', function () {
    if (rewardsPage > 1) { rewardsPage -= 1; reloadRewards(); }
  });
  if (next) next.addEventListener('click', function () {
    if (rewardsPage < pages) { rewardsPage += 1; reloadRewards(); }
  });
}

function reloadRewards() {
  var q = '';
  var searchEl = overlay && overlay.querySelector('[data-rewards-search]');
  if (searchEl) q = searchEl.value || '';
  var qs = 'card-presets?q=' + encodeURIComponent(q) +
    '&issuer=' + encodeURIComponent(rewardsIssuer || '') +
    '&limit=' + rewardsPageSize +
    '&page=' + rewardsPage;
  adminFetch(qs).then(function (res) {
    if (res.ok) renderRewards(res.data);
    else {
      var listEl = overlay.querySelector('[data-rewards-list]');
      listEl.innerHTML = '<div class="admin-empty">' + esc(errText(res.data && res.data.error)) + '</div>';
    }
  }).catch(function () {
    var listEl = overlay.querySelector('[data-rewards-list]');
    listEl.innerHTML = '<div class="admin-empty">Network error.</div>';
  });
}

function catsToText(cats) {
  return Object.keys(cats || {}).map(function (k) {
    return k + ': ' + cats[k];
  }).join('\n');
}

function textToCats(text) {
  var out = {};
  String(text || '').split(/\n+/).forEach(function (line) {
    line = line.trim();
    if (!line) return;
    var m = line.match(/^(.+?)\s*[:=]\s*([\d.]+)\s*%?\s*$/);
    if (!m) return;
    var rate = parseFloat(m[2]);
    if (!Number.isFinite(rate)) return;
    out[m[1].trim()] = rate;
  });
  return out;
}

function setCardSheetMsg(text, ok) {
  var el = overlay && overlay.querySelector('[data-card-sheet-msg]');
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.className = 'admin-msg ' + (ok ? 'is-ok' : 'is-err');
  el.textContent = text;
}

function openCardSheet(preset) {
  cardEditId = preset ? preset.id : null;
  var sheet = overlay.querySelector('[data-card-sheet]');
  overlay.querySelector('[data-card-sheet-title]').textContent = preset ? 'Edit card' : 'Add card';
  var idEl = overlay.querySelector('[data-card-id]');
  idEl.value = preset ? preset.id : '';
  idEl.readOnly = !!preset;
  overlay.querySelector('[data-card-issuer]').value = preset ? (preset.issuer || '') : '';
  overlay.querySelector('[data-card-name]').value = preset ? (preset.name || '') : '';
  overlay.querySelector('[data-card-network]').value = preset ? (preset.network || '') : '';
  overlay.querySelector('[data-card-base]').value = preset && preset.rewardBase != null ? preset.rewardBase : 1;
  overlay.querySelector('[data-card-points]').value = preset && preset.pointValue != null ? preset.pointValue : '';
  overlay.querySelector('[data-card-categories]').value = preset ? catsToText(preset.rewardCategories) : '';
  overlay.querySelector('[data-card-rot-rate]').value = preset && preset.rotatingRate != null ? preset.rotatingRate : '';
  overlay.querySelector('[data-card-rot-pool]').value = preset && Array.isArray(preset.rotatingPool)
    ? preset.rotatingPool.join(', ')
    : '';
  setCardSheetMsg('');
  sheet.hidden = false;
}

function hideCardSheet() {
  var sheet = overlay && overlay.querySelector('[data-card-sheet]');
  if (sheet) sheet.hidden = true;
  cardEditId = null;
}

function saveCardSheet() {
  var poolRaw = String(overlay.querySelector('[data-card-rot-pool]').value || '').trim();
  var pool = poolRaw
    ? poolRaw.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
    : [];
  var ptsRaw = String(overlay.querySelector('[data-card-points]').value || '').trim();
  var rotRaw = String(overlay.querySelector('[data-card-rot-rate]').value || '').trim();
  var body = {
    id: String(overlay.querySelector('[data-card-id]').value || '').trim(),
    issuer: String(overlay.querySelector('[data-card-issuer]').value || '').trim(),
    name: String(overlay.querySelector('[data-card-name]').value || '').trim(),
    network: String(overlay.querySelector('[data-card-network]').value || '').trim(),
    rewardBase: parseFloat(overlay.querySelector('[data-card-base]').value),
    rewardCategories: textToCats(overlay.querySelector('[data-card-categories]').value),
    pointValue: ptsRaw === '' ? null : parseFloat(ptsRaw),
    rotatingRate: rotRaw === '' ? null : parseFloat(rotRaw),
    rotatingPool: pool.length ? pool : null,
  };
  setCardSheetMsg('');
  var isEdit = !!cardEditId;
  var path = isEdit
    ? 'card-presets/' + encodeURIComponent(cardEditId)
    : 'card-presets';
  var method = isEdit ? 'PUT' : 'POST';
  adminFetch(path, method, body).then(function (res) {
    if (res.ok) {
      hideCardSheet();
      setRewardsMsg(isEdit ? 'Saved rates.' : 'Card added.', true);
      reloadRewards();
      import('./cardPresets.js').then(function (m) {
        if (m.loadCardPresetsFromServer) m.loadCardPresetsFromServer();
      }).catch(function () {});
    } else {
      setCardSheetMsg(errText(res.data && res.data.error), false);
    }
  }).catch(function () {
    setCardSheetMsg('Network error.', false);
  });
}

/* ── Public entry (wired from the appbar menu) ────────────── */
export function openAdminTools() {
  if (!overlay) build();
  overlay.style.display = 'flex';
  showAdminTab('users');
  var search = overlay.querySelector('[data-admin-search]');
  search.value = '';
  usersPage = 1;
  setMsg('');
  setRewardsMsg('');
  var promoMsg = overlay.querySelector('[data-promo-msg]');
  if (promoMsg) { promoMsg.textContent = ''; promoMsg.className = 'admin-promo-msg'; }
  var rewardsSearch = overlay.querySelector('[data-rewards-search]');
  if (rewardsSearch) rewardsSearch.value = '';
  rewardsIssuer = '';
  rewardsPage = 1;
  reload('');
  reloadPromos();
  search.focus();
}
