/* ═══════════════════════════════════════════════════════════
   householdShared.js — a live "Shared with your household" card
   on the dashboard. Read-only here (manage sharing from Settings
   → Family); it subscribes to the same SSE stream so a partner's
   share/edit/unshare shows up instantly.
═══════════════════════════════════════════════════════════ */

function host() { return document.getElementById('household-shared'); }

function money(n) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(n || 0)); }
  catch (e) { return '$' + Number(n || 0).toFixed(2); }
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

var KINDS = {
  bill: { label: 'Bill', title: function (d) { return d.name || 'Bill'; }, sub: function (d) { return d.amount != null ? money(d.amount) : ''; } },
  card: { label: 'Card', title: function (d) { return d.name || 'Card'; }, sub: function (d) { return d.balance != null ? money(d.balance) : ''; } },
  goal: { label: 'Goal', title: function (d) { return d.name || 'Goal'; }, sub: function (d) { return d.target != null ? money(d.target) : ''; } },
  account: { label: 'Account', title: function (d) { return d.name || 'Account'; }, sub: function () { return ''; } },
  transaction: { label: 'Transaction', title: function (d) { return d.merchant || d.name || 'Transaction'; }, sub: function (d) { return d.amount != null ? money(d.amount) : ''; } },
};

var members = {};   // userId -> label
var myId = null;
var entities = [];
var es = null;

function ownerLabel(id) {
  if (id === myId) return 'You';
  return members[id] || 'Household';
}

function render() {
  var el = host();
  if (!el) return;
  if (!entities.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';

  var rows = entities.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }).map(function (e) {
    var k = KINDS[e.kind] || { title: function (d) { return d.name || e.kind; }, sub: function () { return ''; } };
    var sub = k.sub(e.data);
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid color-mix(in srgb,var(--border) 55%,transparent);font-size:14px;">' +
      '<span style="flex:1 1 auto;min-width:0;">' + esc(k.title(e.data)) + (sub ? ' · ' + esc(sub) : '') + '</span>' +
      '<span class="badge badge-blue" style="flex:0 0 auto;">' + esc(ownerLabel(e.ownerUserId)) + '</span>' +
    '</div>';
  }).join('');

  el.innerHTML =
    '<div class="card" style="padding:16px;">' +
      '<div style="display:flex;align-items:center;gap:8px;">' +
        '<span style="font-weight:600;">Shared with your household</span>' +
        '<span class="badge badge-blue">Live</span>' +
        '<a href="/settings?tab=family" style="margin-left:auto;font-size:13px;">Manage</a>' +
      '</div>' +
      rows +
    '</div>';
}

function applyDelta(entity) {
  if (!entity || entity.id == null) return;
  var i = entities.findIndex(function (e) { return e.kind === entity.kind && String(e.id) === String(entity.id); });
  if (entity.deleted) { if (i >= 0) entities.splice(i, 1); }
  else if (i >= 0) entities[i] = entity;
  else entities.push(entity);
  render();
}

function openStream(since) {
  if (typeof EventSource === 'undefined') return;
  try {
    es = new EventSource('/api/household/stream?since=' + (since || 0));
    es.addEventListener('entity', function (ev) {
      try { var d = JSON.parse(ev.data); if (d && d.entity) applyDelta(d.entity); } catch (e) { /* ignore */ }
    });
  } catch (e) { es = null; }
}

var started = false;
export function initHouseholdShared() {
  if (started || !host()) return;
  started = true;

  var myEmail = '';
  var who = (window.AppAuth && window.AppAuth.me) ? window.AppAuth.me() : Promise.resolve(null);
  who.then(function (u) { myEmail = (u && u.email) || ''; })
    .catch(function () {})
    .then(function () {
      return fetch('/api/household', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : {}; });
    })
    .then(function (info) {
      var view = info && info.household;
      if (!view) return; // not in a household → nothing to show
      (view.members || []).forEach(function (m) {
        members[m.userId] = m.name || m.email;
        if (myEmail && String(m.email).toLowerCase() === myEmail.toLowerCase()) myId = m.userId;
      });
      return fetch('/api/household/data', { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : { entities: [], seq: 0 }; })
        .then(function (snap) {
          entities = snap.entities || [];
          render();
          openStream(snap.seq || 0);
        });
    })
    .catch(function () { /* offline / not available */ });
}
