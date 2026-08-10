/* ═══════════════════════════════════════════════════════════
   public-footer.js — shared footer links on marketing pages.

   The links are also written into the HTML of every public page.
   That matters for crawlers: search engines render JavaScript,
   but most AI crawlers do not, and a JS-only footer left them
   seeing a site with almost no internal links.

   So this script is progressive enhancement now. If the markup
   already carries the links it only marks the current page;
   it re-renders from scratch only when the container is empty.
═══════════════════════════════════════════════════════════ */

var FOOTER_LINKS = [
  { href: '/',         label: 'Home' },
  { href: '/pricing',  label: 'Pricing' },
  { href: '/faq',      label: 'FAQ' },
  { href: '/bill-tracker-app', label: 'Bill Tracker Guide' },
  { href: '/security', label: 'Security' },
  { href: '/contact',  label: 'Contact' },
  { href: '/login',    label: 'Log In' },
  { href: '/terms',    label: 'Terms' },
  { href: '/privacy',  label: 'Privacy' },
  { href: '/refunds',  label: 'Refunds' },
  // Google Play requires a web-accessible account-deletion path for apps that
  // allow account creation; a footer link keeps it discoverable off-app.
  { href: '/delete-account', label: 'Delete Account' },
];

function currentPath() {
  return (location.pathname || '/').replace(/\/+$/, '') || '/';
}

function isActive(href, path) {
  return (href === '/' && path === '/') || (href !== '/' && path === href);
}

/* Server-rendered case: the anchors are already in the markup,
   so only the active marker is missing. */
function markActive(container, path) {
  container.querySelectorAll('a[href]').forEach(function (a) {
    // Compare the literal attribute, not a.href — the property is
    // resolved to an absolute URL by the DOM.
    if (isActive(a.getAttribute('href'), path)) {
      a.setAttribute('aria-current', 'page');
    } else {
      a.removeAttribute('aria-current');
    }
  });
}

function renderPublicFooter(container) {
  var path = currentPath();
  if (container.querySelector('a[href]')) {
    markActive(container, path);
    return;
  }
  container.innerHTML = FOOTER_LINKS.map(function (link) {
    return '<a href="' + link.href + '"' +
      (isActive(link.href, path) ? ' aria-current="page"' : '') + '>' + link.label + '</a>';
  }).join('');
}

function initPublicFooters() {
  document.querySelectorAll('[data-public-footer]').forEach(renderPublicFooter);
}

initPublicFooters();
