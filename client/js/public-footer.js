/* ═══════════════════════════════════════════════════════════
   public-footer.js — shared footer links across public,
   dashboard, and settings pages.
═══════════════════════════════════════════════════════════ */

var FOOTER_SETS = {
  public: [
    { href: '/',         label: 'Home' },
    { href: '/pricing',  label: 'Pricing' },
    { href: '/faq',      label: 'FAQ' },
    { href: '/security', label: 'Security' },
    { href: '/contact',  label: 'Contact' },
    { href: '/login',    label: 'Log In' },
    { href: '/terms',    label: 'Terms' },
    { href: '/privacy',  label: 'Privacy' },
  ],
  app: [
    { href: '/faq',     label: 'FAQ' },
    { href: '/contact', label: 'Contact' },
    { href: '/terms',   label: 'Terms' },
    { href: '/privacy', label: 'Privacy' },
    { type: 'logout',   label: 'Log Out' },
  ],
  settings: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/pricing',   label: 'Pricing' },
    { href: '/faq',       label: 'FAQ' },
    { href: '/contact',   label: 'Contact' },
    { href: '/security',  label: 'Security' },
    { href: '/terms',     label: 'Terms' },
    { href: '/privacy',   label: 'Privacy' },
    {
      href: 'https://github.com/Greigh/FiHaven/issues/new?template=bug_report.md',
      label: 'Report a bug',
      external: true,
    },
    {
      href: 'https://github.com/Greigh/FiHaven/issues/new?template=feature_request.md',
      label: 'Suggest a feature',
      external: true,
    },
  ],
};

function footerVariant(container) {
  if (container.hasAttribute('data-site-footer')) {
    return container.dataset.siteFooter || 'public';
  }
  if (container.hasAttribute('data-public-footer')) return 'public';
  if (container.hasAttribute('data-app-footer')) return 'app';
  if (container.hasAttribute('data-settings-footer')) return 'settings';
  return 'public';
}

function linkMarkup(link, path) {
  if (link.type === 'logout') {
    return '<a href="#" onclick="logout();return false;">' + link.label + '</a>';
  }
  var active = !link.external && (
    (link.href === '/' && path === '/') ||
    (link.href !== '/' && path === link.href)
  );
  var attrs = ' href="' + link.href + '"';
  if (link.external) attrs += ' target="_blank" rel="noopener"';
  if (active) attrs += ' aria-current="page"';
  return '<a' + attrs + '>' + link.label + '</a>';
}

function renderFooter(container) {
  var variant = footerVariant(container);
  var links = FOOTER_SETS[variant] || FOOTER_SETS.public;
  var path = (location.pathname || '/').replace(/\/+$/, '') || '/';
  container.innerHTML = links.map(function (link) {
    return linkMarkup(link, path);
  }).join('');
}

function initFooters() {
  document.querySelectorAll(
    '[data-site-footer], [data-public-footer], [data-app-footer], [data-settings-footer]'
  ).forEach(renderFooter);
}

initFooters();
