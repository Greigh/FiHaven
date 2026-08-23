#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   generate-markdown.js — write a Markdown rendition of every
   public page into client/public/, so an agent can read the
   content without parsing our layout.

     node scripts/generate-markdown.js          # write the files
     node scripts/generate-markdown.js --check  # CI: fail if stale

   The page list comes from scripts/indexnow-urls.js, the same
   source the sitemap and IndexNow use, so a new public page is
   picked up by all three at once.

   Output lands at client/public/<slug>.md, which Vite copies to
   dist/ — so `/pricing.md` is a real URL, and server/agentWeb.js
   also serves it in place of the HTML when an agent asks for
   `Accept: text/markdown`.

   Why generate rather than convert per request: these files are
   reviewable in a diff, cost nothing to serve, and can't produce
   a surprise at 3am because a page changed shape. The cost is
   remembering to re-run — which `npm run ci` does for you.
═════════════════════════════════════════════════════════════════ */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const { PUBLIC_PAGES, publicOrigin, slugFor } = require('./indexnow-urls');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'client');
const OUT_DIR = path.join(ROOT, 'client', 'public');

/* Elements that carry no content for a reader: chrome, decoration,
   and the script/style payloads. `nav` and `footer` are the same on
   every page — repeating them 13 times is noise, and the links they
   hold are already in the sitemap and llms.txt. */
const DROP = 'script,style,noscript,template,svg,canvas,iframe,nav,footer,form,dialog';

function attr(doc, selector, name) {
  const el = doc.querySelector(selector);
  return (el && el.getAttribute(name)) || '';
}

/* Markdown's own punctuation, escaped so a literal '*' or '_' in
   copy doesn't turn into emphasis. Deliberately not escaping '.'
   or '-' — the false positives (every price, every hyphenated
   word) are worse than the rare ordered-list misread. */
function escapeText(s) {
  return s.replace(/([\\`*_[\]<>|])/g, '\\$1');
}

/** Collapse whitespace the way HTML rendering does. */
function squash(s) {
  return s.replace(/\s+/g, ' ');
}

function isBlock(el) {
  return /^(P|DIV|SECTION|ARTICLE|HEADER|MAIN|ASIDE|FIGURE|FIGCAPTION|H[1-6]|UL|OL|LI|TABLE|TR|BLOCKQUOTE|PRE|HR|DL|DT|DD|DETAILS|SUMMARY)$/
    .test(el.tagName);
}

/**
 * Turn a DOM node into Markdown.
 *
 * A recursive walk rather than a library: these are our own pages,
 * the tag vocabulary is small and known, and a purpose-built pass
 * keeps the output stable across page edits instead of drifting
 * with someone else's heuristics. It also means no new dependency
 * — jsdom is already here for the test suite.
 */
function render(node, ctx) {
  const { Node } = node.ownerDocument.defaultView;

  if (node.nodeType === Node.TEXT_NODE) {
    return escapeText(squash(node.nodeValue));
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName;
  const kids = () => Array.from(node.childNodes).map((n) => render(n, ctx)).join('');

  switch (tag) {
    case 'BR':
      return '\n';
    case 'HR':
      return '\n\n---\n\n';
    case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': {
      const level = Number(tag[1]);
      const text = squash(kids()).trim();
      return text ? `\n\n${'#'.repeat(level)} ${text}\n\n` : '';
    }
    case 'STRONG': case 'B': {
      const text = kids().trim();
      return text ? `**${text}**` : '';
    }
    case 'EM': case 'I': {
      const text = kids().trim();
      return text ? `*${text}*` : '';
    }
    case 'CODE': {
      // Inline only — a CODE inside PRE is handled by the PRE case.
      const text = node.textContent.trim();
      return text ? `\`${text}\`` : '';
    }
    case 'PRE': {
      const text = node.textContent.replace(/\s+$/, '');
      return text ? `\n\n\`\`\`\n${text}\n\`\`\`\n\n` : '';
    }
    case 'A': {
      const text = squash(kids()).trim();
      if (!text) return '';
      const href = node.getAttribute('href') || '';
      // Relative links are resolved against the canonical origin so the
      // file is useful when read on its own, away from the site.
      if (!href || href.startsWith('#')) return text;
      const abs = /^[a-z]+:/i.test(href) ? href : ctx.origin + (href.startsWith('/') ? href : `/${href}`);
      return `[${text}](${abs})`;
    }
    case 'IMG': {
      const alt = (node.getAttribute('alt') || '').trim();
      // A decorative image with no alt text says nothing worth a line.
      return alt ? `![${escapeText(alt)}]()` : '';
    }
    case 'UL': case 'OL': {
      const items = Array.from(node.children).filter((c) => c.tagName === 'LI');
      if (!items.length) return '';
      const ordered = tag === 'OL';
      const lines = items.map((li, i) => {
        const body = squash(render(li, ctx)).trim();
        if (!body) return '';
        return `${ordered ? `${i + 1}.` : '-'} ${body}`;
      }).filter(Boolean);
      return lines.length ? `\n\n${lines.join('\n')}\n\n` : '';
    }
    case 'LI':
      return kids();
    case 'BLOCKQUOTE': {
      const body = squash(kids()).trim();
      return body ? `\n\n> ${body}\n\n` : '';
    }
    case 'TABLE': {
      const rows = Array.from(node.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.children).map((cell) => squash(render(cell, ctx)).trim().replace(/\|/g, '\\|'))
      ).filter((r) => r.length);
      if (!rows.length) return '';
      const width = Math.max(...rows.map((r) => r.length));
      const pad = (r) => { while (r.length < width) r.push(''); return r; };
      const [head, ...body] = rows.map(pad);
      const out = [
        `| ${head.join(' | ')} |`,
        `|${' --- |'.repeat(width)}`,
        ...body.map((r) => `| ${r.join(' | ')} |`),
      ];
      return `\n\n${out.join('\n')}\n\n`;
    }
    default: {
      const body = kids();
      if (!body.trim()) return '';
      return isBlock(node) ? `\n\n${body.trim()}\n\n` : body;
    }
  }
}

/**
 * Normalize the run of blank lines a recursive walk inevitably leaves, and
 * strip leading indentation outside code fences — four leading spaces is a
 * code block in Markdown, and a nested inline element can easily leave that
 * many. We never emit a nested list, so there is no legitimate indentation
 * to preserve.
 */
function tidy(md) {
  let fenced = false;
  return md
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) { fenced = !fenced; return line.trim(); }
      return fenced ? line.replace(/\s+$/, '') : line.trim();
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pageToMarkdown(page, origin) {
  const html = fs.readFileSync(path.join(SRC_DIR, page.file), 'utf8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const url = page.path === '/' ? `${origin}/` : `${origin}${page.path}`;
  const title =
    attr(doc, 'meta[property="og:title"]', 'content') ||
    (doc.querySelector('title') && doc.querySelector('title').textContent.trim()) ||
    'FiHaven';
  const description = attr(doc, 'meta[name="description"]', 'content');

  const root = doc.querySelector('main') || doc.body;
  root.querySelectorAll(DROP).forEach((el) => el.remove());
  // aria-hidden and hidden mark content the page itself does not present.
  root.querySelectorAll('[aria-hidden="true"],[hidden]').forEach((el) => el.remove());

  const body = tidy(render(root, { origin }));

  // A small front matter block: agents get the canonical URL and the
  // page's own description without having to infer either.
  const front = [
    '---',
    `title: ${JSON.stringify(title)}`,
    description ? `description: ${JSON.stringify(description)}` : null,
    `url: ${url}`,
    '---',
  ].filter(Boolean).join('\n');

  return `${front}\n\n${body}\n`;
}

function build() {
  const origin = publicOrigin();
  return PUBLIC_PAGES.map((page) => ({
    file: path.join(OUT_DIR, `${slugFor(page.path)}.md`),
    body: pageToMarkdown(page, origin),
  }));
}

function main() {
  const check = process.argv.includes('--check');
  const outputs = build();
  const stale = [];

  for (const { file, body } of outputs) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (current === body) continue;
    if (check) { stale.push(path.relative(ROOT, file)); continue; }
    fs.writeFileSync(file, body);
  }

  if (check) {
    if (stale.length) {
      console.error('Markdown renditions are stale:');
      stale.forEach((f) => console.error(`  ${f}`));
      console.error('\nRun: node scripts/generate-markdown.js');
      process.exit(1);
    }
    console.log(`Markdown renditions up to date (${outputs.length} pages).`);
    return;
  }
  console.log(`Wrote ${outputs.length} Markdown renditions to client/public/.`);
}

if (require.main === module) main();

module.exports = { pageToMarkdown, build };
