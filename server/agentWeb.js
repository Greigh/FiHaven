/* ═══════════════════════════════════════════════════════════
   agentWeb.js — the machine-readable half of the public site.

   Two middlewares, both for the marketing/legal pages only. The
   signed-in app is not involved in either: it is disallowed in
   robots.txt, gated server-side, and has no Markdown rendition.

   1. markdownForAgents — content negotiation. An agent that sends
      `Accept: text/markdown` gets the page's Markdown rendition
      (written by scripts/generate-markdown.js) instead of a
      layout it would have to strip. Browsers ask for text/html
      and are untouched.

   2. agentLinkHeaders — `Link:` headers pointing at llms.txt, the
      sitemap, and the API catalog, so a client that fetches one
      page learns where the rest of the machine-readable material
      is without having to guess at well-known paths.
═════════════════════════════════════════════════════════════════ */

'use strict';

const fs = require('fs');
const path = require('path');

// indexnow-urls.js is dependency-free and ships with the deploy; the
// generator beside it is NOT importable here — it pulls in jsdom, a
// devDependency the production install omits.
const { PUBLIC_PATHS, publicOrigin, slugFor } = require('../scripts/indexnow-urls');

const MARKDOWN_TYPES = ['text/markdown', 'application/markdown', 'text/x-markdown'];

/**
 * Does this request actively prefer Markdown over HTML?
 *
 * Deliberately strict: an `Accept` that lists Markdown *below* HTML, or the
 * catch-all wildcard a curl or a careless client sends, keeps the HTML.
 * Treating the wildcard as a request for Markdown would hand it to every
 * link-preview fetcher and every naive scraper, which is not what the header
 * means.
 */
function prefersMarkdown(accept) {
  if (!accept) return false;
  let markdown = -1;
  let html = -1;

  for (const part of String(accept).split(',')) {
    const [rawType, ...params] = part.trim().split(';');
    const type = rawType.trim().toLowerCase();
    if (!type) continue;

    // q defaults to 1; a malformed q is treated as absent, per RFC 9110.
    let q = 1;
    for (const p of params) {
      const m = /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(p);
      if (m) {
        const parsed = Number.parseFloat(m[1]);
        if (Number.isFinite(parsed)) q = parsed;
      }
    }
    if (q <= 0) continue;

    if (MARKDOWN_TYPES.includes(type)) markdown = Math.max(markdown, q);
    else if (type === 'text/html' || type === 'application/xhtml+xml') html = Math.max(html, q);
  }

  return markdown > 0 && markdown > html;
}

/**
 * Serve the Markdown rendition of a public page when the client asks for it.
 *
 * `clientDir` is dist/ in production (Vite has merged client/public/ into it)
 * and client/ in dev, where the public/ folder is mounted separately — so the
 * lookup tries both.
 */
function markdownForAgents(clientDir) {
  const publicPaths = new Set(PUBLIC_PATHS);

  return function markdownNegotiation(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!publicPaths.has(req.path)) return next();

    // Every response for these paths varies on Accept now, whether or not
    // this particular request took the Markdown branch — otherwise a cache
    // could hand an agent's Markdown to a browser, or the reverse.
    res.vary('Accept');
    if (!prefersMarkdown(req.get('accept'))) return next();

    const name = `${slugFor(req.path)}.md`;
    const candidates = [
      path.join(clientDir, name),
      path.join(clientDir, 'public', name),
    ];
    const file = candidates.find((f) => fs.existsSync(f));
    // No rendition (a page added without re-running the generator) is not an
    // error for the visitor — fall through and serve the HTML.
    if (!file) return next();

    res.type('text/markdown; charset=utf-8');
    return res.sendFile(file);
  };
}

/**
 * Advertise the machine-readable resources on every public page.
 *
 * `describedby` → llms.txt is the one that matters: it is the summary written
 * for an agent, and nothing in the HTML points at it. The rest are standard
 * relations an automated client already knows how to follow.
 */
function agentLinkHeaders() {
  const origin = publicOrigin();
  const publicPaths = new Set(PUBLIC_PATHS);
  const links = [
    `<${origin}/llms.txt>; rel="describedby"; type="text/plain"; title="FiHaven for LLM agents"`,
    `<${origin}/sitemap.xml>; rel="sitemap"; type="application/xml"`,
    `<${origin}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"`,
  ].join(', ');

  // Public marketing and legal pages only. The API answers machines already,
  // and the signed-in app has nothing here worth advertising to a crawler
  // that should not be reading it in the first place.
  return function linkHeaders(req, res, next) {
    if ((req.method === 'GET' || req.method === 'HEAD') && publicPaths.has(req.path)) {
      // Plus this page's own Markdown rendition. A client that would rather
      // fetch a URL than negotiate on Accept can follow the alternate.
      const md = `<${origin}/${slugFor(req.path)}.md>; rel="alternate"; type="text/markdown"`;
      res.setHeader('Link', `${links}, ${md}`);
    }
    next();
  };
}

module.exports = { markdownForAgents, agentLinkHeaders, prefersMarkdown };
