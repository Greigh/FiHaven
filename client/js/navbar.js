/* ═══════════════════════════════════════════════════════════
   navbar.js — renders the polished app bar into a
   <header data-app-nav data-variant="..."></header> placeholder
   on every page. Three variants:
     dashboard  — primary app tabs (showTab) + avatar menu
     account    — minimal authed nav + avatar menu
     public     — marketing tabs + theme button + auth CTA
   Depends on: theme.js (window.toggleTheme), auth.js
   (window.AppAuth, window.logout). Loads them via classic
   <script> tags before navbar.js.
═══════════════════════════════════════════════════════════ */

import { openAdminTools } from './admin.js';
import { openProDialog } from './pro.js';

    /* ── Inline SVG icons (Feather-style, 1.75 stroke) ─────── */
  var ICONS = {
    dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>',
    bills:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    cards:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/></svg>',
    loans:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9.5L12 4l9 5.5"/><path d="M5 10v8M19 10v8M9.5 10v8M14.5 10v8"/><path d="M3.5 21h17"/></svg>',
    rewards:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="9" r="5.5"/><path d="M9 13.5L7.5 21l4.5-2.5L16.5 21 15 13.5"/></svg>',
    subscriptions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 9h18"/><path d="M8 14a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0z"/><path d="M11 14l4.5-3"/></svg>',
    budget:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3a9 9 0 1 0 9 9h-9V3z"/></svg>',
    spending:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 7h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z"/><path d="M4 10h16"/><path d="M8 15h3"/></svg>',
    history:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/></svg>',
    payoff:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
    calendar:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4M16 3v4"/></svg>',
    export:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 4v12"/><path d="M6 10l6 6 6-6"/><path d="M4 20h16"/></svg>',
    user:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="8.5" r="3.5"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>',
    theme:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
    logout:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 17l5-5-5-5"/><path d="M20 12H9"/><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/></svg>',
    home:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2v-9z"/></svg>',
    doc:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h6"/></svg>',
    shield:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3z"/></svg>',
    admin:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3l8 3v5.5c0 4.6-3.2 7.4-8 8.5-4.8-1.1-8-3.9-8-8.5V6l8-3z"/><circle cx="12" cy="10" r="2.2"/><path d="M8.4 16.6c.6-1.6 2-2.5 3.6-2.5s3 .9 3.6 2.5"/></svg>',
    pro:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 16l-1.2-8 4.7 3.4L12 6l3.5 5.4L20 8l-1.2 8H5z"/><path d="M5 19h14"/></svg>',
    arrow:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 18l-6-6 6-6"/></svg>',
    more:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>',
    chevron:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9l6 6 6-6"/></svg>',
  };

  // Primary bar tabs vs overflow "More" menu (order matches app.js TABS).
  var PRIMARY_TABS = ['dashboard', 'bills', 'cards', 'loans', 'budget', 'spending'];
  var MORE_TABS = ['subscriptions', 'calendar', 'history', 'payoff', 'rewards'];
  var TAB_LABELS = {
    dashboard: 'Dashboard', bills: 'Bills', cards: 'Cards', loans: 'Loans',
    budget: 'Budget', spending: 'Spending', subscriptions: 'Subscriptions',
    calendar: 'Calendar', history: 'History', payoff: 'Payoff', rewards: 'Rewards',
  };

  // Brand mark — "Fi" monogram on a rounded accent tile. The tile
  // tracks the accent via currentColor so the wordmark + mark stay in
  // sync; the letters are always white.
  var BRAND_MARK =
    '<svg class="appbar-mark" viewBox="0 0 64 64" aria-hidden="true">' +
      '<rect width="64" height="64" rx="15" fill="currentColor"/>' +
      '<g fill="#fff">' +
        '<rect x="16" y="17" width="7" height="30" rx="2"/>' +
        '<rect x="16" y="17" width="22" height="7" rx="2"/>' +
        '<rect x="16" y="29" width="17" height="6" rx="2"/>' +
        '<rect x="41" y="27" width="7" height="20" rx="2"/>' +
        '<circle cx="44.5" cy="20" r="4"/>' +
      '</g>' +
    '</svg>';

  function brand(href) {
    return (
      '<a class="appbar-brand" href="' + (href || '/') + '" aria-label="FiHaven home">' +
        '<span class="appbar-mark-wrap">' + BRAND_MARK + '</span>' +
        '<span class="appbar-brand-text">Fi<em>Haven</em></span>' +
      '</a>'
    );
  }

  function tab(icon, label, opts) {
    opts = opts || {};
    var cls = 'appbar-tab' + (opts.extraClass ? ' ' + opts.extraClass : '') + (opts.active ? ' active' : '');
    var dataTab = opts.tab ? ' data-tab="' + opts.tab + '"' : '';
    if (opts.href) {
      return '<a class="' + cls + '"' + dataTab + ' href="' + opts.href + '">' + ICONS[icon] + '<span>' + label + '</span></a>';
    }
    return (
      '<button type="button" class="' + cls + '"' + dataTab + ' onclick="' + (opts.onclick || '') + '">' +
        ICONS[icon] + '<span>' + label + '</span>' +
      '</button>'
    );
  }

  // Two-letter avatar initials. If a display name is set we use the
  // first letters of its first two words; otherwise we derive from
  // the email local-part.
  function initials(user) {
    if (user && user.name) {
      var parts = String(user.name).trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    }
    var email = (user && user.email) || '';
    if (!email) return '··';
    var local = String(email).split('@')[0] || email;
    var lparts = local.split(/[._\-+]/).filter(Boolean);
    if (lparts.length >= 2) return (lparts[0][0] + lparts[1][0]).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  }

  function accountMenuMarkup() {
    return (
      '<div class="appbar-account" data-account-menu>' +
        '<button class="appbar-avatar" type="button" aria-haspopup="menu" aria-expanded="false" data-avatar-btn aria-label="Open account menu">' +
          '<span data-initials>··</span>' +
        '</button>' +
        '<div class="appbar-menu" role="menu" hidden data-account-menu-panel>' +
          '<div class="appbar-menu-head">' +
            '<div class="appbar-menu-label">Signed in as</div>' +
            '<div class="appbar-menu-name" data-account-name hidden></div>' +
            '<div class="appbar-menu-email" data-account-email>…</div>' +
          '</div>' +
          '<a class="appbar-menu-item" role="menuitem" href="/settings">' +
            ICONS.user + '<span>Settings</span>' +
          '</a>' +
          '<button class="appbar-menu-item appbar-menu-pro" type="button" role="menuitem" data-pro-menu-item>' +
            ICONS.pro + '<span>FiHaven Pro</span>' +
            '<span class="appbar-menu-meta" data-pro-menu-status hidden></span>' +
          '</button>' +
          '<button class="appbar-menu-item" type="button" role="menuitem" data-admin-menu-item hidden>' +
            ICONS.admin + '<span>Admin</span>' +
          '</button>' +
          '<button class="appbar-menu-item" type="button" role="menuitem" data-theme-menu-item>' +
            ICONS.theme + '<span>Theme</span>' +
            '<span class="appbar-menu-meta" data-theme-label>—</span>' +
          '</button>' +
          '<button class="appbar-menu-item appbar-menu-danger" type="button" role="menuitem" onclick="logout()">' +
            ICONS.logout + '<span>Log out</span>' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function wireAccountMenu(host) {
    var btn = host.querySelector('[data-avatar-btn]');
    var panel = host.querySelector('[data-account-menu-panel]');
    var themeItem = host.querySelector('[data-theme-menu-item]');
    var themeLabel = host.querySelector('[data-theme-label]');
    var emailEl = host.querySelector('[data-account-email]');
    var nameEl = host.querySelector('[data-account-name]');
    var initialsEl = host.querySelector('[data-initials]');
    var adminItem = host.querySelector('[data-admin-menu-item]');
    var proItem = host.querySelector('[data-pro-menu-item]');
    var proStatus = host.querySelector('[data-pro-menu-status]');
    var proLoaded = false;
    if (!btn || !panel) return;

    function syncThemeLabel() {
      var t = document.documentElement.dataset.theme || 'light';
      if (themeLabel) themeLabel.textContent = t === 'dark' ? 'Dark' : 'Light';
    }
    syncThemeLabel();

    function close() {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    }
    function open() {
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      document.addEventListener('mousedown', onOutside);
      document.addEventListener('keydown', onKey);
      // Lazily label the Pro entry "Pro"/"Free" the first time the menu
      // opens, so authed pages don't pay a billing fetch up front.
      if (!proLoaded && proStatus) {
        proLoaded = true;
        fetch('/api/billing/status', { credentials: 'same-origin' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            var pro = d && d.entitlement && d.entitlement.pro;
            proStatus.textContent = pro ? 'Pro' : 'Free';
            proStatus.style.color = pro ? 'var(--green)' : 'var(--muted)';
            proStatus.hidden = false;
          })
          .catch(function () { /* leave hidden */ });
      }
    }
    function onOutside(e) {
      if (!host.contains(e.target)) close();
    }
    function onKey(e) {
      if (e.key === 'Escape') { close(); btn.focus(); }
    }

    btn.addEventListener('click', function () {
      panel.hidden ? open() : close();
    });
    if (themeItem) {
      themeItem.addEventListener('click', function () {
        if (window.toggleTheme) window.toggleTheme();
        syncThemeLabel();
      });
    }
    if (adminItem) {
      adminItem.addEventListener('click', function () {
        close();
        openAdminTools();
      });
    }
    if (proItem) {
      proItem.addEventListener('click', function () {
        close();
        openProDialog();
      });
    }

    // Render the menu header + avatar initials from /me. Re-runs on
    // 'fihaven:user-changed' (dispatched by Settings after a name
    // or email change) so the navbar stays in sync without reload.
    function paint(user) {
      if (!user) return;
      if (nameEl) {
        if (user.name) {
          nameEl.textContent = user.name;
          nameEl.hidden = false;
        } else {
          nameEl.textContent = '';
          nameEl.hidden = true;
        }
      }
      if (emailEl) emailEl.textContent = user.email;
      if (initialsEl) initialsEl.textContent = initials(user);
      // Reveal the Admin entry only for admins.
      if (adminItem) adminItem.hidden = user.role !== 'admin';
    }

    if (window.AppAuth && window.AppAuth.me) {
      window.AppAuth.me().then(paint);
    }
    window.addEventListener('fihaven:user-changed', function () {
      if (window.AppAuth && window.AppAuth.me) window.AppAuth.me().then(paint);
    });
  }

  function wireMoreMenu(host) {
    var wrap = host.querySelector('[data-more-menu]');
    var btn = host.querySelector('[data-more-trigger]');
    var panel = host.querySelector('[data-more-panel]');
    if (!wrap || !btn || !panel) return;

    function close() {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    }
    function open() {
      panel.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      document.addEventListener('mousedown', onOutside);
      document.addEventListener('keydown', onKey);
    }
    function onOutside(e) {
      if (!wrap.contains(e.target)) close();
    }
    function onKey(e) {
      if (e.key === 'Escape') { close(); btn.focus(); }
    }

    btn.addEventListener('click', function () {
      panel.hidden ? open() : close();
    });
    Array.prototype.forEach.call(panel.querySelectorAll('.tab-btn'), function (item) {
      item.addEventListener('click', function () { setTimeout(close, 0); });
    });
    window.addEventListener('fihaven:tab-changed', close);
  }

  /* ── Variant: dashboard ─────────────────────────────────── */
  function buildDashboard(host) {
    var primary = PRIMARY_TABS.map(function (name) {
      return tab(name, TAB_LABELS[name], {
        onclick: "showTab('" + name + "')",
        active: name === 'dashboard',
        extraClass: 'tab-btn',
        tab: name,
      });
    }).join('');

    var moreItems = MORE_TABS.map(function (name) {
      return tab(name, TAB_LABELS[name], {
        onclick: "showTab('" + name + "')",
        extraClass: 'tab-btn appbar-more-item',
        tab: name,
      });
    }).join('');

    var moreMenu =
      '<div class="appbar-more" data-more-menu>' +
        '<button type="button" class="appbar-tab appbar-more-trigger" aria-haspopup="menu" aria-expanded="false" data-more-trigger>' +
          ICONS.more + '<span>More</span>' +
          '<span class="appbar-more-chevron" aria-hidden="true">' + ICONS.chevron + '</span>' +
        '</button>' +
        '<div class="appbar-more-panel" role="menu" hidden data-more-panel>' + moreItems + '</div>' +
      '</div>';

    var tabs = primary + moreMenu;

    host.className = 'appbar';
    host.innerHTML =
      brand('/dashboard') +
      '<div class="appbar-nav-wrap"><div class="appbar-nav" role="navigation" aria-label="Primary">' + tabs + '</div></div>' +
      '<div class="appbar-right">' +
        '<span id="sync-status" class="sync-status" aria-live="polite"></span>' +
        accountMenuMarkup() +
      '</div>';

    wireAccountMenu(host);
    wireMoreMenu(host);
  }

  /* ── Variant: settings page ─────────────────────────────── */
  function buildSettings(host) {
    var tabs = [
      tab('dashboard', 'Dashboard', { href: '/dashboard' }),
      tab('user',      'Settings',  { href: '/settings', active: true }),
    ].join('');

    host.className = 'appbar';
    host.innerHTML =
      brand('/dashboard') +
      '<div class="appbar-nav-wrap"><div class="appbar-nav" role="navigation" aria-label="Primary">' + tabs + '</div></div>' +
      '<div class="appbar-right">' +
        accountMenuMarkup() +
      '</div>';

    wireAccountMenu(host);
  }

  /* ── Variant: public (home / login / terms / privacy) ───── */
  function buildPublic(host) {
    // Strip leading slash and use the first path segment as the slug.
    // Both "/" and "/" count as the home page.
    var current = location.pathname.replace(/^\/+/, '').toLowerCase().split('/')[0];
    function match(name) {
      if (name === 'home') return current === '' || current === 'home';
      return current === name;
    }

    var tabs = [
      tab('home',   'Home',    { href: '/',        active: match('home') }),
      tab('user',   'Log In',  { href: '/login',   active: match('login') }),
      tab('doc',    'Terms',   { href: '/terms',   active: match('terms') }),
      tab('shield', 'Privacy', { href: '/privacy', active: match('privacy') }),
    ].join('');

    // Same CTA on every public page so the navbar stays consistent.
    // auth.js rewrites this to "Open dashboard" when the visitor is
    // signed in (data-login-cta hook).
    var cta = '<a class="appbar-cta appbar-cta-primary" href="/login" data-login-cta>Get Started</a>';

    host.className = 'appbar';
    host.innerHTML =
      brand('/') +
      '<div class="appbar-nav-wrap"><div class="appbar-nav" role="navigation" aria-label="Primary">' + tabs + '</div></div>' +
      '<div class="appbar-right">' +
        '<button class="appbar-icon-btn" type="button" data-theme-btn aria-label="Toggle theme" title="Toggle theme">' + ICONS.theme + '</button>' +
        cta +
      '</div>';

    var themeBtn = host.querySelector('[data-theme-btn]');
    if (themeBtn) themeBtn.addEventListener('click', function () {
      if (window.toggleTheme) window.toggleTheme();
    });
  }

  /* ── Dispatch ──────────────────────────────────────────── */
  // Idempotent: rendered hosts get [data-rendered] and are skipped.
  // Called both at script-eval time (so an already-parsed placeholder
  // renders synchronously) and again on DOMContentLoaded as a safety
  // net for placeholders added later.
  function init() {
    var hosts = document.querySelectorAll('[data-app-nav]:not([data-rendered])');
    Array.prototype.forEach.call(hosts, function (host) {
      var variant = host.dataset.variant || 'public';
      if (variant === 'dashboard') buildDashboard(host);
      else if (variant === 'settings' || variant === 'account') buildSettings(host);
      else buildPublic(host);
      host.setAttribute('data-rendered', 'true');
    });
  }

  init();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  }

/* ═══════════════════════════════════════════════════════════
   Mobile navigation — hamburger + slide-out drawer.
   Progressive enhancement over the rendered appbar: inject a
   hamburger button and a body-level drawer that CLONES the nav
   links so their existing onclick / href keep working. Clones
   drop the `tab-btn` class so app.js showTab's index-based active
   toggle still maps to the original buttons only. CSS in
   css/mobile.css gates visibility to small screens.
   ═══════════════════════════════════════════════════════════ */
(function () {
  var BURGER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  var openDrawer = null;

  function lockScroll(on) { document.body.style.overflow = on ? 'hidden' : ''; }

  function close() {
    if (!openDrawer) return;
    var d = openDrawer;
    d.classList.remove('open');
    if (d.__overlay) d.__overlay.classList.remove('open');
    if (d.__burger) d.__burger.setAttribute('aria-expanded', 'false');
    lockScroll(false);
    openDrawer = null;
    document.removeEventListener('keydown', onKey);
  }
  function open(d) {
    if (openDrawer && openDrawer !== d) close();
    syncActive(d);
    d.classList.add('open');
    if (d.__overlay) d.__overlay.classList.add('open');
    if (d.__burger) d.__burger.setAttribute('aria-expanded', 'true');
    lockScroll(true);
    openDrawer = d;
    document.addEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function syncActive(d) {
    if (!d.__source) return;
    var active = document.querySelector('.tab-btn[data-tab].active');
    var activeTab = active && active.dataset.tab;
    Array.prototype.forEach.call(d.querySelectorAll('.mnav-item'), function (item) {
      item.classList.toggle('active', !!activeTab && item.dataset.tab === activeTab);
    });
  }

  /** Flatten primary nav + More overflow into one list for the mobile drawer. */
  function navItemsForMobile(nav) {
    var out = [];
    Array.prototype.forEach.call(nav.children, function (child) {
      if (child.matches('[data-more-menu]')) {
        var panel = child.querySelector('[data-more-panel]');
        if (panel) Array.prototype.forEach.call(panel.children, function (c) { out.push(c); });
      } else {
        out.push(child);
      }
    });
    return out;
  }

  function enhance(appbar) {
    if (appbar.dataset.mnav) return;
    var nav = appbar.querySelector('.appbar-nav');
    if (!nav || !nav.children.length) return;
    appbar.dataset.mnav = '1';

    var burger = document.createElement('button');
    burger.type = 'button';
    burger.className = 'appbar-burger';
    burger.setAttribute('aria-label', 'Open menu');
    burger.setAttribute('aria-expanded', 'false');
    burger.innerHTML = BURGER_SVG;
    appbar.insertBefore(burger, appbar.firstChild);

    var overlay = document.createElement('div');
    overlay.className = 'mnav-overlay';

    var drawer = document.createElement('aside');
    drawer.className = 'mnav-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', 'Navigation');

    var head = document.createElement('div');
    head.className = 'mnav-head';
    head.innerHTML = '<span class="mnav-title">Fi<em>Haven</em></span>';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'mnav-close';
    closeBtn.setAttribute('aria-label', 'Close menu');
    closeBtn.innerHTML = '&times;';
    head.appendChild(closeBtn);

    var list = document.createElement('nav');
    list.className = 'mnav-list';
    list.setAttribute('aria-label', 'Primary');

    Array.prototype.forEach.call(navItemsForMobile(nav), function (child) {
      var clone = child.cloneNode(true);
      clone.classList.remove('tab-btn');
      clone.classList.add('mnav-item');
      clone.addEventListener('click', function () { setTimeout(close, 0); });
      list.appendChild(clone);
    });

    drawer.appendChild(head);
    drawer.appendChild(list);
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    drawer.__overlay = overlay;
    drawer.__burger = burger;
    drawer.__source = nav;

    burger.addEventListener('click', function () {
      (openDrawer === drawer) ? close() : open(drawer);
    });
    overlay.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
  }

  function enhanceAll() {
    Array.prototype.forEach.call(document.querySelectorAll('.appbar'), enhance);
  }

  window.addEventListener('resize', function () {
    if (openDrawer && window.innerWidth > 900) close();
  });

  enhanceAll();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceAll);
  }
})();
