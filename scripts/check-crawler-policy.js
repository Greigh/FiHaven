#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   check-crawler-policy.js — assert that the live site treats AI
   crawlers the way we intend.

   The policy is "answerable, not trainable": crawlers that let an
   assistant find and cite FiHaven get through; crawlers that exist
   to bulk-collect training text do not. That policy is enforced by
   Cloudflare's AI Crawl Control, not by anything in this repo — so
   it can drift without a single file changing, and nothing in CI
   would notice.

   It already did drift once, in the worst direction: every AI
   crawler was blocked, including the user-triggered fetchers that
   fire when a real person asks an assistant about FiHaven. In one
   day that refused 267 requests from ChatGPT-User. Search engines
   were unaffected, so the site looked perfectly healthy.

     node scripts/check-crawler-policy.js
     node scripts/check-crawler-policy.js --origin https://staging.example

   Exits non-zero if any crawler is on the wrong side of the line.

   Note on method: Cloudflare decides by user-agent string here, so
   sending the UA is a faithful test. If it ever moves to verifying
   bots by IP or signature, a spoofed UA would be rejected as an
   impersonator and these results would stop meaning what they say.
   The dashboard's allowed/unsuccessful counts are the fallback.
═════════════════════════════════════════════════════════════════ */

'use strict';

const DEFAULT_ORIGIN = 'https://fihaven.app';

/* Crawlers that must reach the site. Answer engines index it so an
   assistant can cite it; the *-User agents fire on behalf of a
   person who asked a question right now. */
const MUST_ALLOW = [
  ['ChatGPT-User',      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ChatGPT-User/1.0; +https://openai.com/bot)'],
  ['OAI-SearchBot',     'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)'],
  ['Claude-User',       'Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)'],
  ['Claude-SearchBot',  'Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +claudebot@anthropic.com)'],
  ['PerplexityBot',     'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)'],
  ['Perplexity-User',   'Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)'],
  ['DuckAssistBot',     'Mozilla/5.0 (compatible; DuckAssistBot/1.0; +https://duckduckgo.com/duckassistbot)'],
  ['Googlebot',         'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
  ['Bingbot',           'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
  ['Applebot',          'Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)'],
  ['facebookexternalhit', 'facebookexternalhit/1.1'],
];

/* Crawlers that must not. These collect text for model training and
   return no discovery value. */
const MUST_BLOCK = [
  ['GPTBot',             'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)'],
  ['ClaudeBot',          'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'],
  ['CCBot',              'Mozilla/5.0 (compatible; CCBot/2.0; +https://commoncrawl.org/faq/)'],
  ['Amazonbot',          'Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/amazonbot)'],
  ['meta-externalagent', 'Mozilla/5.0 (compatible; meta-externalagent/1.1)'],
  ['Bytespider',         'Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)'],
];

/* Paths a blocked crawler should still reach, so a training bot reads
   an accurate description of FiHaven rather than nothing at all.

   These are NOT governed by the "Configure block response → Allowed
   paths" panel, which turned out to belong to a different feature.
   The real enforcement is a WAF custom rule ("AI Crawl Control - Block
   AI bots by User Agent", phase http_request_firewall_custom) whose
   expression opens with a path guard. It originally exempted only
   /robots.txt, which is exactly why everything else 403'd. The guard
   is now:

     not http.request.uri.path in {"/robots.txt" "/llms.txt" "/llms-full.txt"}

   Add a path here and to that expression together, or this check will
   start failing. */
/* Machine-readable files that must stay reachable even for a crawler the WAF
   blocks. A blocked crawler that also gets a 403 on these learns nothing about
   FiHaven at all — which is what happened when only /robots.txt was exempt.
   The .well-known pair matters most: api-catalog and auth.md exist precisely
   so an automated client can establish what is here and that there is no agent
   login, without probing for it. `/pricing.md` stands in for the 13 per-page
   Markdown renditions; the guard below covers the whole shape. */
const SHOULD_EXEMPT = [
  '/robots.txt',
  '/llms.txt',
  '/llms-full.txt',
  '/.well-known/api-catalog',
  '/.well-known/auth.md',
  '/pricing.md',
];

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function status(origin, path, ua) {
  try {
    const res = await fetch(origin + path, {
      method: 'GET',
      headers: { 'user-agent': ua },
      redirect: 'manual',
    });
    return res.status;
  } catch (err) {
    return `ERR ${err.message}`;
  }
}

async function main() {
  const origin = (arg('--origin', process.env.PUBLIC_ORIGIN || DEFAULT_ORIGIN)).replace(/\/$/, '');
  console.log(`Crawler policy check — ${origin}\n`);

  let failures = 0;

  console.log('  Must reach the site (answer engines, assistants, search):');
  for (const [name, ua] of MUST_ALLOW) {
    const code = await status(origin, '/', ua);
    const ok = code === 200;
    if (!ok) failures++;
    console.log(`    ${ok ? '✓' : '✗'} ${name.padEnd(20)} ${code}${ok ? '' : '   expected 200'}`);
  }

  console.log('\n  Must be refused (training crawlers):');
  for (const [name, ua] of MUST_BLOCK) {
    const code = await status(origin, '/', ua);
    const ok = code === 403;
    if (!ok) failures++;
    console.log(`    ${ok ? '✓' : '✗'} ${name.padEnd(20)} ${code}${ok ? '' : '   expected 403'}`);
  }

  console.log('\n  Still reachable while blocked (machine-readable summaries):');
  const blockedUa = MUST_BLOCK[0][1];
  const notExempt = [];
  for (const path of SHOULD_EXEMPT) {
    const code = await status(origin, path, blockedUa);
    const ok = code === 200;
    if (!ok) { notExempt.push(path); failures++; }
    console.log(`    ${ok ? '✓' : '✗'} ${path.padEnd(20)} ${code}${ok ? '' : '   expected 200'}`);
  }
  if (notExempt.length) {
    console.log(`\n  ${notExempt.join(', ')} is not exempt. Fix the path guard on the WAF`);
    console.log('  rule "AI Crawl Control - Block AI bots by User Agent" — its expression');
    console.log('  must open with:');
    console.log('    not http.request.uri.path in {"/robots.txt" "/llms.txt" "/llms-full.txt"');
    console.log('      "/.well-known/api-catalog" "/.well-known/auth.md"}');
    console.log('    and not ends_with(http.request.uri.path, ".md")');
  }

  console.log('');
  if (failures) {
    console.error(`FAIL — ${failures} crawler(s) on the wrong side of the policy.`);
    console.error('Check Cloudflare → Security → Bots / AI Crawl Control for this zone.');
    process.exit(1);
  }
  console.log('OK — every crawler is on the intended side of the policy.');
}

main();
