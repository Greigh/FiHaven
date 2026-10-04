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
  { href: '/refunds',  label: 'Refunds' },
  // Google Play requires a web-accessible account-deletion path for apps that
  // allow account creation; a footer link keeps it discoverable off-app.
  { href: '/delete-account', label: 'Delete Account' },
];

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
  var path = (location.pathname || '/').replace(/\/+$/, '') || '/';
  container.innerHTML = FOOTER_LINKS.map(function (link) {
    var active = (link.href === '/' && path === '/') ||
      (link.href !== '/' && path === link.href);
    return '<a href="' + link.href + '"' +
      (active ? ' aria-current="page"' : '') + '>' + link.label + '</a>';
  }).join('');
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
