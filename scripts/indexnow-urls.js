'use strict';

/* ═══════════════════════════════════════════════════════════
   indexnow-urls.js — public marketing URLs submitted to IndexNow.
   Keep in sync with client/public/sitemap.xml.
═══════════════════════════════════════════════════════════ */

const PUBLIC_PATHS = [
  '/',
  '/pricing',
  '/faq',
  '/login',
  '/security',
  '/contact',
  '/terms',
  '/privacy',
];

function publicOrigin() {
  return (process.env.PUBLIC_ORIGIN || 'https://fihaven.app').replace(/\/$/, '');
}

function publicUrls(origin) {
  const base = origin || publicOrigin();
  return PUBLIC_PATHS.map((p) => (p === '/' ? `${base}/` : `${base}${p}`));
}

module.exports = { PUBLIC_PATHS, publicOrigin, publicUrls };
