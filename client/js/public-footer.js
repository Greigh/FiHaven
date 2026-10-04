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
  { href: '/changelog', label: 'Changelog' },
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

// Official App Store / Google Play badge pair — the unmodified store
// artwork lives in client/public/.
var STORE_BADGES_HTML =
  '<div class="site-footer-badges store-badges">' +
    '<a class="store-badge" href="https://apps.apple.com/app/fihaven-budget-planner/id6781084347" target="_blank" rel="noopener" aria-label="Download FiHaven on the App Store">' +
      '<img class="store-badge-apple" src="/badge-app-store.svg" alt="Download on the App Store" width="120" height="40" loading="lazy"/>' +
    '</a>' +
    '<a class="store-badge" href="https://play.google.com/store/apps/details?id=app.fihaven" target="_blank" rel="noopener" aria-label="Get FiHaven on Google Play">' +
      '<img class="store-badge-play" src="/badge-google-play.png" alt="Get it on Google Play" width="155" height="60" loading="lazy"/>' +
    '</a>' +
  '</div>';

function renderPublicFooter(container) {
  var path = currentPath();
  if (container.querySelector('a[href]')) {
    markActive(container, path);
  } else {
    container.innerHTML = FOOTER_LINKS.map(function (link) {
      return '<a href="' + link.href + '"' +
        (isActive(link.href, path) ? ' aria-current="page"' : '') + '>' + link.label + '</a>';
    }).join('');
  }
  // Badges sit on their own footer row, right after the links — a sibling
  // keeps them out of the flex wrap that packs the nav links together.
  if (!container.nextElementSibling ||
      !container.nextElementSibling.classList.contains('site-footer-badges')) {
    container.insertAdjacentHTML('afterend', STORE_BADGES_HTML);
  }
}

function initPublicFooters() {
  document.querySelectorAll('[data-public-footer]').forEach(renderPublicFooter);
}

initPublicFooters();
