'use strict';

/* ═══════════════════════════════════════════════════════════
   indexnow-urls.js — the single source of truth for FiHaven's
   public, indexable URLs.

   Both the IndexNow submitter (scripts/submit-indexnow.js) and
   the sitemap generator (scripts/generate-sitemap.js) read this
   list, so client/public/sitemap.xml can no longer drift out of
   sync with what gets pinged.

   `file` is the client source page. The sitemap generator asks
   git when that file last changed to fill in <lastmod>, so the
   dates stay honest without anyone editing them by hand.

   Private/authenticated pages are deliberately absent — they are
   noindex in HTML and disallowed in robots.txt.
═══════════════════════════════════════════════════════════ */

const PUBLIC_PAGES = [
  { path: '/',                          file: 'home.html',                     changefreq: 'weekly',  priority: '1.0' },
  { path: '/pricing',                   file: 'pricing.html',                  changefreq: 'monthly', priority: '0.8' },
  { path: '/bill-tracker-app',          file: 'bill-tracker-app.html',         changefreq: 'monthly', priority: '0.8' },
  { path: '/mint-alternative',          file: 'mint-alternative.html',         changefreq: 'monthly', priority: '0.7' },
  { path: '/rocket-money-alternative',  file: 'rocket-money-alternative.html', changefreq: 'monthly', priority: '0.7' },
  { path: '/faq',                       file: 'faq.html',                      changefreq: 'monthly', priority: '0.7' },
  { path: '/login',                     file: 'login.html',                    changefreq: 'monthly', priority: '0.6' },
  { path: '/security',                  file: 'security.html',                 changefreq: 'monthly', priority: '0.5' },
  { path: '/contact',                   file: 'contact.html',                  changefreq: 'monthly', priority: '0.5' },
  { path: '/terms',                     file: 'terms.html',                    changefreq: 'yearly',  priority: '0.3' },
  { path: '/privacy',                   file: 'privacy.html',                  changefreq: 'yearly',  priority: '0.3' },
  { path: '/refunds',                   file: 'refunds.html',                  changefreq: 'yearly',  priority: '0.3' },
  { path: '/delete-account',            file: 'delete-account.html',           changefreq: 'yearly',  priority: '0.3' },
];

const PUBLIC_PATHS = PUBLIC_PAGES.map((p) => p.path);

/* The basename of a page's Markdown rendition: '/' → 'index',
   '/pricing' → 'pricing'. Lives here rather than in the generator
   because server/agentWeb.js needs the same rule to find the file,
   and the generator pulls in jsdom — a devDependency the production
   server must never load. */
function slugFor(urlPath) {
  return urlPath === '/' ? 'index' : urlPath.replace(/^\//, '').replace(/\//g, '-');
}

function publicOrigin() {
  return (process.env.PUBLIC_ORIGIN || 'https://fihaven.app').replace(/\/$/, '');
}

function publicUrls(origin) {
  const base = origin || publicOrigin();
  return PUBLIC_PATHS.map((p) => (p === '/' ? `${base}/` : `${base}${p}`));
}

module.exports = { PUBLIC_PAGES, PUBLIC_PATHS, publicOrigin, publicUrls, slugFor };
