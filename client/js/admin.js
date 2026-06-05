/* ═══════════════════════════════════════════════════════════
   admin.js — admin tools overlay, opened from the appbar menu.
   Admins-only (the menu item is hidden otherwise, and every
   /api/admin/* route enforces the role server-side). Built to
   hold more tools over time; "User management" is the first.
═══════════════════════════════════════════════════════════ */

var overlay = null;

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
  if (code === 'forbidden') return 'Admins only.';
  if (code === 'unauthenticated') return 'Your session expired — reload and sign in.';
  return 'That action failed. Please try again.';
}

/* ── Overlay shell ────────────────────────────────────────── */
function build() {
  overlay = document.createElement('div');
  overlay.className = 'admin-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:1000;display:flex;align-items:flex-start;justify-content:center;' +
    'padding:40px 16px;overflow:auto;background:rgba(0,0,0,.45);';
  overlay.innerHTML =
    '<div class="admin-panel" role="dialog" aria-modal="true" aria-label="Admin tools" style="' +
      'width:min(640px,100%);background:var(--surface);color:var(--text);border:1px solid var(--border);' +
      'border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden;">' +
      '<div style="display:flex;align-items:center;gap:8px;padding:16px 18px;border-bottom:1px solid var(--border);">' +
        '<strong style="font-size:18px;letter-spacing:-.02em;flex:1;">Admin</strong>' +
        '<button type="button" data-admin-close aria-label="Close" style="' +
          'background:none;border:none;color:var(--muted);font-size:22px;line-height:1;cursor:pointer;padding:4px 8px;">×</button>' +
      '</div>' +
      '<div style="padding:18px;">' +
        '<h3 style="margin:0;font-size:16px;">User management</h3>' +
        '<p style="margin:6px 0 12px;color:var(--muted);font-size:13px;">Grant or revoke Pro, and manage admin access. Changes take effect immediately.</p>' +
        '<input type="search" data-admin-search placeholder="Search by email or name…" autocomplete="off" style="' +
          'width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2,var(--surface));color:var(--text);"/>' +
        '<div data-admin-msg style="color:var(--red);font-size:13px;min-height:1em;margin-top:8px;"></div>' +
        '<div data-admin-users style="margin-top:4px;"></div>' +
      '</div>' +
    '</div>';

  overlay.addEventListener('mousedown', function (e) {
    if (e.target === overlay) hide();
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
}

function onKey(e) {
  if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') hide();
}

function hide() {
  if (overlay) overlay.style.display = 'none';
}

function setMsg(text) {
  var el = overlay && overlay.querySelector('[data-admin-msg]');
  if (el) el.textContent = text || '';
}

/* ── User list + actions ──────────────────────────────────── */
function smallBtn(label, onClick) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn-secondary';
  b.style.cssText = 'padding:6px 12px;font-size:13px;';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function act(path, body, search) {
  adminFetch(path, 'POST', body).then(function (res) {
    if (res.ok) reload(search);
    else setMsg(errText(res.data && res.data.error));
  }).catch(function () { setMsg('Network error. Please try again.'); });
}

function render(users, search) {
  var listEl = overlay.querySelector('[data-admin-users]');
  listEl.innerHTML = '';
  if (!users.length) {
    listEl.innerHTML = '<div style="color:var(--muted);padding:14px 0;">No matching users.</div>';
    return;
  }
  users.forEach(function (u) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:12px 0;border-top:1px solid var(--border);flex-wrap:wrap;';
    var info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:180px;';
    var sub = (u.role === 'admin' ? 'Admin · ' : '') + (u.pro ? 'Pro' : 'Free');
    info.innerHTML =
      '<div style="font-weight:600;">' + esc(u.name || u.email) + '</div>' +
      '<div style="font-size:12px;color:var(--muted);">' +
      (u.name ? esc(u.email) + ' · ' : '') + sub + '</div>';
    row.appendChild(info);
    row.appendChild(smallBtn(u.pro ? 'Revoke Pro' : 'Grant Pro', function () {
      act('users/' + u.id + '/pro', { grant: !u.pro }, search);
    }));
    row.appendChild(smallBtn(u.role === 'admin' ? 'Remove admin' : 'Make admin', function () {
      act('users/' + u.id + '/role', { role: u.role === 'admin' ? 'user' : 'admin' }, search);
    }));
    listEl.appendChild(row);
  });
}

function reload(search) {
  setMsg('');
  adminFetch('users?limit=50&q=' + encodeURIComponent(search || '')).then(function (res) {
    if (res.ok) render(res.data.users || [], search || '');
    else setMsg(res.status === 403 ? 'Admins only.' : 'Could not load users.');
  }).catch(function () { setMsg('Network error loading users.'); });
}

/* ── Public entry (wired from the appbar menu) ────────────── */
export function openAdminTools() {
  if (!overlay) build();
  overlay.style.display = 'flex';
  var search = overlay.querySelector('[data-admin-search]');
  search.value = '';
  reload('');
  search.focus();
}
