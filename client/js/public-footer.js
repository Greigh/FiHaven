/* ═══════════════════════════════════════════════════════════
   public-footer.js — shared footer links on marketing pages.
═══════════════════════════════════════════════════════════ */

var FOOTER_LINKS = [
  { href: '/',         label: 'Home' },
  { href: '/pricing',  label: 'Pricing' },
  { href: '/faq',      label: 'FAQ' },
  { href: '/security', label: 'Security' },
  { href: '/contact',  label: 'Contact' },
  { href: '/login',    label: 'Log In' },
  { href: '/terms',    label: 'Terms' },
  { href: '/privacy',  label: 'Privacy' },
];

function renderPublicFooter(container) {
  var path = (location.pathname || '/').replace(/\/+$/, '') || '/';
  container.innerHTML = FOOTER_LINKS.map(function (link) {
    var active = (link.href === '/' && path === '/') ||
      (link.href !== '/' && path === link.href);
    return '<a href="' + link.href + '"' +
      (active ? ' aria-current="page"' : '') + '>' + link.label + '</a>';
  }).join('');
}

function initPublicFooters() {
  document.querySelectorAll('[data-public-footer]').forEach(renderPublicFooter);
}

initPublicFooters();
