import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { prefersMarkdown, markdownForAgents, agentLinkHeaders } = require('./agentWeb');
const { PUBLIC_PAGES, slugFor } = require('../scripts/indexnow-urls');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/*
 * Cloudflare's AI-readiness checks want two things from the public site: a
 * clean text rendition an agent can read without stripping our layout, and
 * Link headers telling it where the rest of the machine-readable material is.
 *
 * The risk in content negotiation is over-eagerness. `Accept: * / *` is what
 * curl, link-preview fetchers and half-written scrapers send, and it means
 * "anything", not "Markdown please". Answering it with Markdown would quietly
 * change what most non-browser clients receive — including, on a bad day, a
 * search crawler that then indexes the wrong representation.
 */
describe('agentWeb — Accept negotiation', () => {
  it('serves Markdown only when the client actually prefers it', () => {
    expect(prefersMarkdown('text/markdown')).toBe(true);
    expect(prefersMarkdown('application/markdown')).toBe(true);
    expect(prefersMarkdown('text/markdown, text/html;q=0.5')).toBe(true);
    // Order alone doesn't decide it; the q value does.
    expect(prefersMarkdown('text/html;q=0.9, text/markdown;q=1.0')).toBe(true);
  });

  it('leaves every ordinary client on HTML', () => {
    const browser = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8';
    expect(prefersMarkdown(browser)).toBe(false);
    expect(prefersMarkdown('*/*')).toBe(false);          // curl, most bots
    expect(prefersMarkdown('')).toBe(false);
    expect(prefersMarkdown(undefined)).toBe(false);
    expect(prefersMarkdown('text/html, text/markdown;q=0.5')).toBe(false);
    // q=0 is an explicit refusal, not a preference.
    expect(prefersMarkdown('text/markdown;q=0, text/html')).toBe(false);
  });

  it('is not confused by malformed q values', () => {
    // A junk q falls back to 1 rather than NaN, which would compare false
    // against everything and silently disable the feature.
    expect(prefersMarkdown('text/markdown;q=abc')).toBe(true);
    expect(prefersMarkdown('  TEXT/MARKDOWN  ')).toBe(true);
  });
});

function run(middleware, req) {
  const headers = {};
  let nexted = false;
  let sent = null;
  const res = {
    setHeader: (k, v) => { headers[k] = v; },
    getHeader: (k) => headers[k],
    vary: (k) => { headers.Vary = headers.Vary ? `${headers.Vary}, ${k}` : k; },
    type: (t) => { headers['Content-Type'] = t; return res; },
    sendFile: (f) => { sent = f; },
  };
  middleware({ method: 'GET', get: (h) => req.accept, ...req }, res, () => { nexted = true; });
  return { headers, nexted, sent };
}

describe('agentWeb — markdownForAgents', () => {
  const mw = markdownForAgents(path.join(ROOT, 'client'));

  it('serves the rendition for a public page when asked', () => {
    const { sent, nexted } = run(mw, { path: '/pricing', accept: 'text/markdown' });
    expect(nexted).toBe(false);
    expect(sent).toBe(path.join(ROOT, 'client', 'public', 'pricing.md'));
  });

  it('maps the root to index.md', () => {
    const { sent } = run(mw, { path: '/', accept: 'text/markdown' });
    expect(sent).toBe(path.join(ROOT, 'client', 'public', 'index.md'));
  });

  it('never touches the signed-in app or the API', () => {
    for (const p of ['/dashboard', '/settings', '/api/data', '/welcome']) {
      const { nexted, sent, headers } = run(mw, { path: p, accept: 'text/markdown' });
      expect(nexted).toBe(true);
      expect(sent).toBeNull();
      // Not even a Vary, because we did not consider Accept for this path.
      expect(headers.Vary).toBeUndefined();
    }
  });

  it('marks the response as varying on Accept either way', () => {
    // A cache that missed this could hand an agent's Markdown to a browser.
    const asHtml = run(mw, { path: '/pricing', accept: 'text/html' });
    expect(asHtml.nexted).toBe(true);
    expect(asHtml.headers.Vary).toBe('Accept');

    const asMd = run(mw, { path: '/pricing', accept: 'text/markdown' });
    expect(asMd.headers.Vary).toBe('Accept');
  });

  it('falls through to HTML when a page has no rendition yet', () => {
    // A page added to PUBLIC_PAGES without re-running the generator must not
    // 404 for a real visitor.
    const missing = markdownForAgents(path.join(ROOT, 'client', 'does-not-exist'));
    const { nexted, sent } = run(missing, { path: '/pricing', accept: 'text/markdown' });
    expect(nexted).toBe(true);
    expect(sent).toBeNull();
  });
});

describe('agentWeb — Link headers', () => {
  const mw = agentLinkHeaders();

  it('points a public page at llms.txt, the sitemap, the catalog, and its own Markdown', () => {
    const { headers } = run(mw, { path: '/pricing' });
    expect(headers.Link).toContain('<https://fihaven.app/llms.txt>; rel="describedby"');
    expect(headers.Link).toContain('rel="sitemap"');
    expect(headers.Link).toContain('rel="api-catalog"');
    expect(headers.Link).toContain('<https://fihaven.app/pricing.md>; rel="alternate"; type="text/markdown"');
  });

  it('leaves private paths and the API alone', () => {
    for (const p of ['/dashboard', '/api/data', '/settings']) {
      expect(run(mw, { path: p }).headers.Link).toBeUndefined();
    }
  });
});

describe('the generated renditions', () => {
  it('exists for every public page, and is committed', () => {
    // The generator runs in `npm run build`, but a stale file in git is what
    // actually gets reviewed — `npm run markdown:check` gates that in CI.
    for (const page of PUBLIC_PAGES) {
      const file = path.join(ROOT, 'client', 'public', `${slugFor(page.path)}.md`);
      expect(fs.existsSync(file), `missing ${file}`).toBe(true);
    }
  });

  it('carries front matter with the canonical URL, and real content', () => {
    const md = fs.readFileSync(path.join(ROOT, 'client', 'public', 'pricing.md'), 'utf8');
    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('url: https://fihaven.app/pricing');
    expect(md).toContain('# Free to start.');
    // Layout, scripts and nav chrome must not survive the conversion.
    expect(md).not.toMatch(/<script|<svg|<div|class=/);
  });

  it('resolves relative links against the canonical origin', () => {
    // The file is read away from the site, so `/login` on its own is useless.
    const md = fs.readFileSync(path.join(ROOT, 'client', 'public', 'pricing.md'), 'utf8');
    expect(md).toContain('](https://fihaven.app/login)');
    expect(md).not.toMatch(/\]\(\/[a-z]/);
  });
});

describe('the well-known documents', () => {
  it('publishes a valid RFC 9727 linkset', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'client', 'public', '.well-known', 'api-catalog'), 'utf8');
    const doc = JSON.parse(raw);
    expect(Array.isArray(doc.linkset)).toBe(true);
    expect(doc.linkset[0].anchor).toBe('https://fihaven.app/.well-known/api-catalog');
    expect(doc.linkset[0].item.length).toBeGreaterThan(0);
    for (const item of doc.linkset[0].item) {
      expect(item.href).toMatch(/^https:\/\//);
      expect(item.title).toBeTruthy();
    }
  });

  it('states plainly that there is no agent login', () => {
    const md = fs.readFileSync(path.join(ROOT, 'client', 'public', '.well-known', 'auth.md'), 'utf8');
    // The whole point of the file: an agent must be able to establish this
    // without probing, and must not be encouraged to ask for a password.
    expect(md).toContain('does not offer delegated access');
    expect(md).toContain('Do not ask a user for their FiHaven password');
  });
});

/*
 * res.sendFile refuses any path containing a dot-segment unless told
 * otherwise, and `.well-known` is one. That is not a hypothetical: the
 * apple-app-site-association route shipped without the option and returned
 * 500 in production — which silently broke iOS Universal Links and passkey
 * `webcredentials:`, neither of which reports a failure anywhere a person
 * would look.
 *
 * A source guard rather than an HTTP test because booting server/index.js
 * starts the scheduler and opens the database. The rule it enforces is
 * mechanical enough to check this way: every sendFile into .well-known must
 * carry dotfiles: 'allow'.
 */
describe('serving .well-known documents', () => {
  it('passes dotfiles:allow on every sendFile into .well-known', () => {
    const src = fs.readFileSync(path.join(ROOT, 'server', 'index.js'), 'utf8');
    const calls = src.match(/sendFile\([\s\S]*?\)\s*;/g) || [];
    const wellKnown = calls.filter((c) => c.includes("'.well-known'"));

    expect(wellKnown.length).toBeGreaterThan(0);
    for (const call of wellKnown) {
      expect(call, `missing dotfiles:allow in ${call.replace(/\s+/g, ' ')}`)
        .toContain("dotfiles: 'allow'");
    }
  });
});
