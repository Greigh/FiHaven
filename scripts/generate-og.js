#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   scripts/generate-og.js — render the Open Graph share cards to
   PNG from an HTML template, using headless Chrome.

   Why not just ship the SVG? Because X, Facebook, LinkedIn,
   Slack, Discord, and iMessage all refuse SVG for preview cards.
   An og:image that is an SVG renders as no image at all.

   Why Chrome and not rsvg-convert? The card is set in Manrope,
   which is a webfont — it is not installed on the machine, so a
   plain SVG rasterizer silently falls back to a system sans and
   the brand drifts. Chrome loads the real font.

   Why JPEG output? The card is a large smooth gradient. Chrome's
   PNG lands at ~400 KB, and palette-quantizing it to get that
   down puts visible concentric banding in the orb. JPEG q92 is
   ~76 KB with no banding and crisp text at this weight/size.

   Output is committed to client/public/, so this is a dev tool
   you re-run when the wording or brand changes, not a build step.
   Needs network (Google Fonts), Google Chrome, and ImageMagick.

     node scripts/generate-og.js            # all cards
     node scripts/generate-og.js home       # just one
═════════════════════════════════════════════════════════════════ */

'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'client', 'public');

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

/* The cards. `slug` becomes og-<slug>.png (bare `og-image.png`
   for the default). Keep the headline to two short lines — the
   card is often rendered at thumbnail size in a timeline. */
const CARDS = [
  {
    slug: null,
    name: 'home',
    line1: 'Quiet money.',
    line2: 'Calm month.',
    sub: "A focused bill and debt dashboard for people who'd rather\nspend five calm minutes a week than a frantic afternoon.",
  },
  {
    slug: 'pricing',
    name: 'pricing',
    line1: 'Free to start.',
    line2: 'Pro when you want it.',
    sub: 'Bill and debt tracking free forever. Pro adds bank linking,\nfamily sharing, and the rewards optimizer.',
  },
  {
    slug: 'security',
    name: 'security',
    line1: 'Boring security,',
    line2: 'on purpose.',
    sub: 'Encrypted at rest, passkeys and two-factor, and a published\nsecurity policy you can actually read.',
  },
];

function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) {
    console.error('Google Chrome not found. Install Chrome, or add its path to CHROME_CANDIDATES.');
    process.exit(1);
  }
  return found;
}

/* The FiHaven "Fi" monogram, inlined so the template has no
   external image fetch to race against the screenshot. */
const MARK = `
<svg width="68" height="68" viewBox="0 0 68 68" xmlns="http://www.w3.org/2000/svg">
  <rect width="68" height="68" rx="16" fill="#3D6FE1"/>
  <g transform="scale(1.0625)" fill="#fff">
    <rect x="16" y="17" width="7" height="30" rx="2"/>
    <rect x="16" y="17" width="22" height="7" rx="2"/>
    <rect x="16" y="29" width="17" height="6" rx="2"/>
    <rect x="41" y="27" width="7" height="20" rx="2"/>
    <circle cx="44.5" cy="20" r="4"/>
  </g>
</svg>`;

function template(card) {
  const sub = card.sub
    .split('\n')
    .map((l) => `<span>${l}</span>`)
    .join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;800&display=block" rel="stylesheet"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1200px;height:630px}
  body{
    font-family:Manrope,system-ui,sans-serif;
    background:linear-gradient(135deg,#FAFAFB 0%,#EAF0FE 100%);
    position:relative;overflow:hidden;
  }
  /* Brand orb, top right — matches the marketing hero. */
  .orb{
    position:absolute;top:-30%;right:-15%;width:1000px;height:1000px;
    background:radial-gradient(circle,rgba(61,111,225,.32) 0%,rgba(61,111,225,0) 62%);
  }
  .wrap{position:relative;padding:96px 80px;height:100%;display:flex;flex-direction:column}
  .brand{display:flex;align-items:center;gap:22px}
  .brand b{font-weight:800;font-size:36px;letter-spacing:-1px;color:#15161A}
  h1{
    margin-top:74px;font-weight:800;font-size:92px;line-height:1.12;
    letter-spacing:-3px;color:#15161A;
  }
  h1 em{font-style:normal;color:#3D6FE1;display:block}
  p{
    margin-top:auto;font-weight:500;font-size:28px;line-height:1.38;
    letter-spacing:-.4px;color:#6C6E77;
  }
  p span{display:block}
</style></head>
<body>
  <div class="orb"></div>
  <div class="wrap">
    <div class="brand">${MARK}<b>FiHaven</b></div>
    <h1>${card.line1}<em>${card.line2}</em></h1>
    <p>${sub}</p>
  </div>
</body></html>`;
}

function render(chrome, card) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fihaven-og-'));
  const htmlPath = path.join(work, 'card.html');
  const shot = path.join(work, 'shot.png');
  const outName = card.slug ? `og-${card.slug}.jpg` : 'og-image.jpg';
  const outPath = path.join(OUT_DIR, outName);

  fs.writeFileSync(htmlPath, template(card));
  try {
    execFileSync(
      chrome,
      [
        '--headless',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--window-size=1200,630',
        // Give the webfont time to fetch and paint before capture.
        '--virtual-time-budget=8000',
        `--screenshot=${shot}`,
        `file://${htmlPath}`,
      ],
      { stdio: 'pipe' }
    );
    if (!fs.existsSync(shot)) throw new Error('Chrome produced no screenshot');
    // -strip drops the EXIF/colour-profile chunks Chrome writes;
    // they are dead weight in a share card.
    execFileSync('magick', [shot, '-strip', '-quality', '92', outPath], { stdio: 'pipe' });
    const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
    console.log(`  ✓ ${outName}  (${kb} KB)`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  return outPath;
}

function main() {
  const only = process.argv[2];
  const chrome = findChrome();
  const cards = only ? CARDS.filter((c) => c.name === only) : CARDS;
  if (!cards.length) {
    console.error(`Unknown card "${only}". Known: ${CARDS.map((c) => c.name).join(', ')}`);
    process.exit(1);
  }
  console.log(`Rendering ${cards.length} OG card(s) with ${path.basename(chrome)}…`);
  cards.forEach((c) => render(chrome, c));
  console.log('Done. Commit the JPEGs in client/public/.');
}

main();
