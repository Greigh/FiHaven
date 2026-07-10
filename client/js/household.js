/* ═══════════════════════════════════════════════════════════
   household.js — the "Family" settings panel: create or join a
   shared household, invite members, manage membership, and
   selectively share bills, cards, and goals.
═════════════════════════════════════════════════════════════ */

import { openProDialog } from './pro.js';

function root() { return document.querySelector('[data-household-root]'); }

function getCsrf() {
  return (window.AppAuth && window.AppAuth.getCsrfToken && window.AppAuth.getCsrfToken()) || '';
}

function api(path, method, body) {
  var opts = { method: method || 'GET', credentials: 'same-origin', headers: {} };
  if (method && method !== 'GET') {
    opts.headers['Content-Type'] = 'application/json';
    opts.headers['X-CSRF-Token'] = getCsrf();
  }
  if (body) opts.body = JSON.stringify(body);
  return fetch('/api/household' + path, opts).then(function (r) {
    return r.json().then(
      function (d) { return { ok: r.ok, status: r.status, data: d }; },
      function () { return { ok: r.ok, status: r.status, data: {} }; }
    );
  });
}

var ERR = {
  'pro-required': 'Creating a household is part of the Family plan.',
  'already-in-household': 'You’re already in a household.',
  'not-owner': 'Only the household owner can do that.',
  'invalid-email': 'Enter a valid email address.',
  'already-member': 'That person is already in your household.',
  'household-full': 'Your household is full — upgrade for more members.',
  'invalid-invite': 'That invite link is invalid.',
  'invite-used': 'That invite has already been used.',
  'invite-expired': 'That invite has expired.',
  'invite-email-mismatch': 'That invite was sent to a different email address.',
  'cannot-remove-self': 'Use “Leave household” to remove yourself.',
  'not-in-household': 'You’re not in a household.',
  'invalid-kind': 'That item can’t be shared.',
  'invalid-item': 'That item can’t be shared.',
  'entity-not-found': 'That shared item no longer exists.',
  'conflict': 'Someone else just changed that — refreshing.',
  'not-allowed': 'Only the person who shared an item (or the owner) can remove it.',
};
function msgFor(code) { return ERR[code] || 'Something went wrong. Please try again.'; }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function fmtDate(ms) {
  try { return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch (e) { return ''; }
}

var myEmail = '';
var banner = '';     // transient success/info message shown above the panel
var bannerErr = false;
var sharedCtx = null; // { view, personal, currency, entities } for live re-render
var es = null;        // the open EventSource (live deltas)

function setBanner(text, isError) { banner = text || ''; bannerErr = !!isError; }

// ── Rendering ────────────────────────────────────────────────
function bannerHtml() {
  if (!banner) return '';
  return '<div style="margin-bottom:12px;font-size:13px;color:' +
    (bannerErr ? 'var(--red)' : 'var(--green)') + ';">' + esc(banner) + '</div>';
}

function renderUpsell() {
  root().innerHTML = bannerHtml() +
    '<div class="card" style="padding:16px;">' +
      '<div style="font-weight:600;">Share with your family</div>' +
      '<p style="margin-top:6px;color:var(--muted);font-size:14px;">' +
        'Creating a household is part of the <strong>FiHaven Family plan</strong> ($25.99/yr) — start one and invite up to three people. Already invited? Joining is free.' +
      '</p>' +
      '<button class="btn btn-primary" type="button" data-hh-upgrade style="margin-top:12px;">See the Family plan</button>' +
    '</div>';
  root().querySelector('[data-hh-upgrade]').addEventListener('click', function () { openProDialog(); });
}

function renderCreate() {
  root().innerHTML = bannerHtml() +
    '<div class="card" style="padding:16px;">' +
      '<div style="font-weight:600;">Start a household</div>' +
      '<p style="margin-top:6px;color:var(--muted);font-size:14px;">' +
        'Create a household, then invite your partner or family by email. Everyone keeps their own account.' +
      '</p>' +
      '<div class="auth-field" style="margin-top:12px;">' +
        '<label for="hh-name">Household name</label>' +
        '<input type="text" id="hh-name" maxlength="60" placeholder="e.g. The Smiths" autocomplete="off"/>' +
      '</div>' +
      '<button class="btn btn-primary" type="button" data-hh-create>Create household</button>' +
    '</div>';
  var input = root().querySelector('#hh-name');
  root().querySelector('[data-hh-create]').addEventListener('click', function () {
    api('/', 'POST', { name: input.value.trim() }).then(function (res) {
      if (res.ok) { setBanner('Household created.'); load(); }
      else { setBanner(msgFor(res.data.error), true); load(); }
    });
  });
}

function memberRowHtml(m, isOwnerViewer) {
  var you = String(m.email).toLowerCase() === String(myEmail).toLowerCase();
  var label = (m.name ? esc(m.name) + ' · ' : '') + esc(m.email) + (you ? ' (you)' : '');
  var badge = '<span class="badge ' + (m.role === 'owner' ? 'badge-blue' : 'badge-gray') + '">' +
    (m.role === 'owner' ? 'Owner' : 'Member') + '</span>';
  var remove = (isOwnerViewer && !you && m.role !== 'owner')
    ? '<button class="btn btn-secondary" type="button" data-hh-remove="' + m.userId + '" style="padding:4px 10px;font-size:13px;">Remove</button>'
    : '';
  return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid color-mix(in srgb,var(--border) 55%,transparent);">' +
    '<span style="flex:1 1 auto;min-width:0;font-size:14px;">' + label + '</span>' + badge + remove +
  '</div>';
}

function inviteRowHtml(i) {
  return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid color-mix(in srgb,var(--border) 55%,transparent);">' +
    '<span style="flex:1 1 auto;min-width:0;font-size:13px;color:var(--muted);">' +
      esc(i.email) + ' · invited, expires ' + fmtDate(i.expiresAt) +
    '</span>' +
    '<button class="btn btn-secondary" type="button" data-hh-revoke="' + i.id + '" style="padding:4px 10px;font-size:13px;">Revoke</button>' +
  '</div>';
}

function renderHousehold(view) {
  var isOwner = view.role === 'owner';
  var full = view.memberCount >= view.memberMax;

  var html = bannerHtml() + '<div class="card" style="padding:16px;">';
  html += '<div style="display:flex;align-items:center;gap:10px;">' +
    '<div style="flex:1 1 auto;min-width:0;"><div style="font-weight:600;font-size:16px;">' + esc(view.household.name) + '</div>' +
    '<div style="color:var(--muted);font-size:12.5px;">' + view.memberCount + ' of ' + view.memberMax + ' members' + (isOwner ? ' · you’re the owner' : '') + '</div></div>' +
    '<span class="badge badge-blue">Household</span></div>';

  // Members
  html += '<div style="margin-top:8px;">' + view.members.map(function (m) { return memberRowHtml(m, isOwner); }).join('') + '</div>';

  // Owner: invite + pending
  if (isOwner) {
    html += '<div style="margin-top:16px;">' +
      '<div class="section-title" style="font-size:12px;">Invite someone</div>' +
      (full
        ? '<p style="margin-top:6px;color:var(--muted);font-size:13px;">Your household is full. <a href="#" data-hh-upgrade2>Upgrade</a> to add more people.</p>'
        : '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">' +
            '<input type="email" id="hh-invite-email" placeholder="name@email.com" autocomplete="off" style="flex:1 1 200px;"/>' +
            '<button class="btn btn-primary" type="button" data-hh-invite>Send invite</button>' +
          '</div>') +
      '</div>';
    if (view.pendingInvites && view.pendingInvites.length) {
      html += '<div style="margin-top:14px;"><div class="section-title" style="font-size:12px;">Pending invites</div>' +
        view.pendingInvites.map(inviteRowHtml).join('') + '</div>';
    }
  }

  // Shared finances (selective sharing) — filled in by loadShared().
  html += '<div data-hh-shared style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px;"></div>';

  // Leave
  html += '<div style="margin-top:18px;border-top:1px solid var(--border);padding-top:14px;">' +
    '<button class="btn btn-secondary" type="button" data-hh-leave style="color:var(--red);">' +
    (isOwner ? 'Leave (transfers or dissolves household)' : 'Leave household') + '</button></div>';

  html += '</div>';

  root().innerHTML = html;

  // Wire actions
  var upg = root().querySelector('[data-hh-upgrade2]');
  if (upg) upg.addEventListener('click', function (e) { e.preventDefault(); openProDialog(); });

  var inviteBtn = root().querySelector('[data-hh-invite]');
  if (inviteBtn) {
    inviteBtn.addEventListener('click', function () {
      var email = root().querySelector('#hh-invite-email').value.trim();
      inviteBtn.disabled = true;
      api('/invite', 'POST', { email: email }).then(function (res) {
        inviteBtn.disabled = false;
        if (res.ok) setBanner(res.data.emailed === false ? 'Invite created, but the email couldn’t be sent.' : 'Invite sent to ' + email + '.', res.data.emailed === false);
        else setBanner(msgFor(res.data.error), true);
        load();
      });
    });
  }

  Array.prototype.forEach.call(root().querySelectorAll('[data-hh-revoke]'), function (b) {
    b.addEventListener('click', function () {
      api('/invites/' + b.getAttribute('data-hh-revoke'), 'DELETE').then(function (res) {
        if (!res.ok) setBanner(msgFor(res.data.error), true);
        load();
      });
    });
  });

  Array.prototype.forEach.call(root().querySelectorAll('[data-hh-remove]'), function (b) {
    b.addEventListener('click', function () {
      if (!window.confirm('Remove this member from the household?')) return;
      api('/members/' + b.getAttribute('data-hh-remove'), 'DELETE').then(function (res) {
        if (!res.ok) setBanner(msgFor(res.data.error), true);
        load();
      });
    });
  });

  root().querySelector('[data-hh-leave]').addEventListener('click', function () {
    if (!window.confirm('Leave this household? You’ll keep your personal data.')) return;
    api('/leave', 'POST').then(function (res) {
      if (res.ok) setBanner('You’ve left the household.');
      else setBanner(msgFor(res.data.error), true);
      load();
    });
  });

  loadShared(view);
}

/* ── Selective sharing (the shared-finances subsection) ──────── */

function money(n, currency) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(Number(n || 0)); }
  catch (e) { return '$' + Number(n || 0).toFixed(2); }
}

// The personal collections we let people contribute, and how to label them.
var SHARE_KINDS = [
  { kind: 'bill', label: 'Bills', coll: 'bills', title: function (d) { return d.name || 'Bill'; }, sub: function (d, c) { return d.amount != null ? money(d.amount, c) : ''; } },
  { kind: 'card', label: 'Cards', coll: 'cards', title: function (d) { return d.name || 'Card'; }, sub: function (d, c) { return d.balance != null ? money(d.balance, c) : ''; } },
  { kind: 'goal', label: 'Goals', coll: 'goals', title: function (d) { return d.name || 'Goal'; }, sub: function (d, c) { return d.target != null ? money(d.target, c) : ''; } },
];

function myUserId(view) {
  var m = (view.members || []).find(function (x) { return String(x.email).toLowerCase() === String(myEmail).toLowerCase(); });
  return m ? m.userId : null;
}
function memberLabel(view, userId) {
  var m = (view.members || []).find(function (x) { return x.userId === userId; });
  if (!m) return 'Someone';
  return String(m.email).toLowerCase() === String(myEmail).toLowerCase() ? 'You' : (m.name || m.email);
}

function loadShared(view) {
  var host = root() && root().querySelector('[data-hh-shared]');
  if (!host) return;
  host.innerHTML = '<div style="color:var(--muted);font-size:13px;">Loading shared items…</div>';
  Promise.all([
    api('/data', 'GET'),
    fetch('/api/data', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
  ]).then(function (arr) {
    if (!root() || !root().querySelector('[data-hh-shared]')) return; // tab changed
    var snap = (arr[0].ok ? arr[0].data : null) || { entities: [], seq: 0 };
    var personal = arr[1] || {};
    sharedCtx = {
      view: view,
      personal: personal,
      currency: (personal.settings && personal.settings.currency) || 'USD',
      entities: snap.entities || [],
    };
    renderSharedFromCtx();
    openStream(snap.seq || 0); // live deltas from here
  });
}

function renderSharedFromCtx() {
  var host = root() && root().querySelector('[data-hh-shared]');
  if (!host || !sharedCtx) return;
  renderShared(host, sharedCtx.view, sharedCtx.entities, sharedCtx.personal, sharedCtx.currency);
}

// Apply one live delta (upsert or tombstone) to the cached shared set and
// re-render in place.
function applyDelta(entity) {
  if (!sharedCtx || !entity || entity.id == null) return;
  var arr = sharedCtx.entities;
  var i = arr.findIndex(function (e) { return e.kind === entity.kind && String(e.id) === String(entity.id); });
  if (entity.deleted) { if (i >= 0) arr.splice(i, 1); }
  else if (i >= 0) arr[i] = entity;
  else arr.push(entity);
  renderSharedFromCtx();
}

function openStream(since) {
  closeStream();
  if (typeof EventSource === 'undefined') return; // graceful: snapshot still works
  try {
    es = new EventSource('/api/household/stream?since=' + (since || 0));
    es.addEventListener('entity', function (ev) {
      try { var d = JSON.parse(ev.data); if (d && d.entity) applyDelta(d.entity); }
      catch (e) { /* ignore malformed frame */ }
    });
    // EventSource auto-reconnects and resends Last-Event-ID, so a dropped
    // connection resumes with no gap; no manual handling needed on error.
  } catch (e) { es = null; }
}

function closeStream() {
  if (es) { try { es.close(); } catch (e) { /* noop */ } es = null; }
}

function renderShared(host, view, shared, personal, currency) {
  var mine = myUserId(view);
  var byKind = {};
  shared.forEach(function (e) { (byKind[e.kind] = byKind[e.kind] || []).push(e); });

  var html = '<div class="section-title" style="font-size:12px;">Shared finances</div>' +
    '<p style="margin-top:4px;color:var(--muted);font-size:12.5px;">Choose what to pool with your household. Anything you don’t share stays private.</p>';

  SHARE_KINDS.forEach(function (k) {
    var items = byKind[k.kind] || [];
    var sharedIds = {};
    items.forEach(function (e) { sharedIds[String(e.id)] = true; });
    var personalItems = Array.isArray(personal[k.coll]) ? personal[k.coll] : [];
    var available = personalItems.filter(function (it) { return it && it.id != null && !sharedIds[String(it.id)]; });
    if (!items.length && !available.length) return;

    html += '<div style="margin-top:12px;"><div style="font-size:13px;font-weight:600;">' + esc(k.label) + '</div>';
    if (items.length) {
      html += items.map(function (e) {
        var canRemove = e.ownerUserId === mine || view.role === 'owner';
        var subText = k.sub(e.data, currency);
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;">' +
          '<span style="flex:1 1 auto;min-width:0;">' + esc(k.title(e.data)) + (subText ? ' · ' + esc(subText) : '') +
            ' <span style="color:var(--muted);">— ' + esc(memberLabel(view, e.ownerUserId)) + '</span></span>' +
          (canRemove ? '<button class="btn btn-secondary" type="button" data-hh-unshare="' + esc(k.kind) + '␟' + esc(String(e.id)) + '" style="padding:3px 9px;font-size:12px;">Unshare</button>' : '') +
        '</div>';
      }).join('');
    }
    if (available.length) {
      html += '<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;">' +
        '<select data-hh-pick="' + esc(k.kind) + '" style="flex:1 1 180px;"><option value="">Share a ' + esc(k.label.toLowerCase().replace(/s$/, '')) + '…</option>' +
        available.map(function (it) { return '<option value="' + esc(String(it.id)) + '">' + esc(k.title(it)) + '</option>'; }).join('') +
        '</select>' +
        '<button class="btn btn-secondary" type="button" data-hh-share="' + esc(k.kind) + '" style="padding:4px 12px;font-size:13px;">Share</button>' +
      '</div>';
    }
    html += '</div>';
  });

  host.innerHTML = html;

  Array.prototype.forEach.call(host.querySelectorAll('[data-hh-share]'), function (btn) {
    btn.addEventListener('click', function () {
      var kind = btn.getAttribute('data-hh-share');
      var sel = host.querySelector('[data-hh-pick="' + kind + '"]');
      var id = sel && sel.value;
      if (!id) return;
      var def = SHARE_KINDS.find(function (x) { return x.kind === kind; });
      var item = (Array.isArray(personal[def.coll]) ? personal[def.coll] : []).find(function (it) { return String(it.id) === String(id); });
      if (!item) return;
      btn.disabled = true;
      api('/entities', 'POST', { kind: kind, item: item }).then(function (res) {
        if (!res.ok) setBanner(msgFor(res.data.error), true);
        load();
      });
    });
  });

  Array.prototype.forEach.call(host.querySelectorAll('[data-hh-unshare]'), function (btn) {
    btn.addEventListener('click', function () {
      var parts = btn.getAttribute('data-hh-unshare').split('␟');
      api('/entities/' + encodeURIComponent(parts[0]) + '/' + encodeURIComponent(parts[1]), 'DELETE').then(function (res) {
        if (!res.ok) setBanner(msgFor(res.data.error), true);
        load();
      });
    });
  });
}

// ── Load + accept-token handling ─────────────────────────────
function load() {
  var el = root();
  if (!el) return;
  closeStream(); // re-opened by loadShared() when we're in a household
  api('/', 'GET').then(function (res) {
    if (!res.ok) { el.innerHTML = '<div style="color:var(--muted);font-size:14px;">Couldn’t load your household.</div>'; return; }
    var d = res.data;
    if (d.household) renderHousehold(d.household);
    else if (d.canCreate) renderCreate();
    else renderUpsell();
  });
}

// If the page was opened from an invite link (?household=<token>), redeem
// it, then clean the URL and show the result.
function consumeInviteToken() {
  var token;
  try { token = new URLSearchParams(window.location.search).get('household'); } catch (e) { token = null; }
  if (!token) return Promise.resolve(false);
  try {
    var url = new URL(window.location.href);
    url.searchParams.delete('household');
    window.history.replaceState({}, '', url.pathname + url.search);
  } catch (e) { /* ignore */ }
  return api('/accept', 'POST', { token: token }).then(function (res) {
    setBanner(res.ok ? 'You’ve joined the household!' : msgFor(res.data.error), !res.ok);
    return true;
  });
}

export function initHousehold(user) {
  if (!root()) return;
  myEmail = (user && user.email) || '';
  consumeInviteToken().then(load);
}
