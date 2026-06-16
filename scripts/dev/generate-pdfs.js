#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   scripts/dev/generate-pdfs.js — export docs/*.md compliance
   policies to styled PDFs in docs/ (headless Chrome print).

   Run from repo root:
     npm run generate:pdfs

   Requires a Chromium-based browser. Override path if needed:
     CHROME_PATH=/usr/bin/chromium node scripts/dev/generate-pdfs.js

   Default (macOS): /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
═════════════════════════════════════════════════════════════════ */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '../..');
const docsDir = path.join(REPO_ROOT, 'docs');

const DEFAULT_CHROME_MAC =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const files = [
  { name: 'access-control-policy', title: 'FiHaven — Access Control Policy' },
  { name: 'data-retention-policy', title: 'FiHaven — Data Retention & Disposal Policy' },
  { name: 'information-security-policy', title: 'FiHaven — Information Security Policy' },
];

function resolveChromePath() {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }
  if (fs.existsSync(DEFAULT_CHROME_MAC)) {
    return DEFAULT_CHROME_MAC;
  }
  for (const candidate of [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return DEFAULT_CHROME_MAC;
}

const chromePath = resolveChromePath();
if (!fs.existsSync(chromePath)) {
  console.error(`Chrome/Chromium not found at: ${chromePath}`);
  console.error('Set CHROME_PATH to your browser binary and retry.');
  process.exit(1);
}

console.log(`Using browser: ${chromePath}`);

files.forEach((file) => {
  const mdPath = path.join(docsDir, `${file.name}.md`);
  const htmlPath = path.join(docsDir, `${file.name}.temp.html`);
  const pdfPath = path.join(docsDir, `${file.name}.pdf`);

  if (!fs.existsSync(mdPath)) {
    console.error(`Warning: Markdown file not found: ${mdPath}`);
    return;
  }

  console.log(`Processing ${file.name}.md...`);

  const mdContent = fs.readFileSync(mdPath, 'utf8');

  let bodyHtml;
  try {
    bodyHtml = execSync('npx -y marked', { input: mdContent, encoding: 'utf8', cwd: REPO_ROOT });
  } catch (error) {
    console.error(`Error parsing Markdown for ${file.name}:`, error);
    return;
  }

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${file.title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@300;400;500;600&display=swap');
    
    @page {
      size: letter;
      margin: 1.2in 1.2in 1.2in 1.2in;
    }
    
    body {
      font-family: 'Manrope', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #1e293b;
      line-height: 1.6;
      font-size: 11pt;
    }
    
    h1 {
      font-size: 24pt;
      font-weight: 800;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 20px;
      line-height: 1.2;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 15px;
    }
    
    h2 {
      font-size: 15pt;
      font-weight: 700;
      color: #1e3a8a;
      margin-top: 30px;
      margin-bottom: 12px;
      page-break-after: avoid;
    }
    
    h3 {
      font-size: 11pt;
      font-weight: 600;
      color: #1e40af;
      margin-top: 20px;
      margin-bottom: 8px;
      page-break-after: avoid;
    }
    
    p {
      margin-top: 0;
      margin-bottom: 12px;
      text-align: justify;
    }
    
    ul, ol {
      margin-top: 0;
      margin-bottom: 16px;
      padding-left: 20px;
    }
    
    li {
      margin-bottom: 6px;
    }
    
    li::marker {
      color: #3d6fe1;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 25px;
      page-break-inside: avoid;
    }
    
    th, td {
      border: 1px solid #e2e8f0;
      padding: 8px 12px;
      text-align: left;
      vertical-align: top;
      font-size: 9.5pt;
    }
    
    th {
      background-color: #f8fafc;
      font-weight: 600;
      color: #334155;
    }
    
    table:first-of-type {
      margin-bottom: 30px;
      border: 1px solid #e2e8f0;
    }
    table:first-of-type td {
      padding: 8px 12px;
    }
    table:first-of-type tr td:first-child {
      font-weight: 700;
      width: 30%;
      background-color: #f8fafc;
      color: #475569;
    }
    
    hr {
      border: 0;
      border-top: 1px solid #e2e8f0;
      margin: 25px 0;
    }
    
    blockquote {
      margin: 16px 0;
      padding: 12px 18px;
      background-color: #f8fafc;
      border-left: 4px solid #3d6fe1;
      border-radius: 0 4px 4px 0;
      color: #475569;
      font-style: italic;
    }
    
    blockquote p:last-child {
      margin-bottom: 0;
    }
    
    code {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 9pt;
      background-color: #f1f5f9;
      padding: 2px 4px;
      border-radius: 4px;
      color: #0f172a;
    }
    
    pre code {
      display: block;
      padding: 12px;
      overflow-x: auto;
      line-height: 1.4;
    }
    
    strong {
      font-weight: 600;
      color: #0f172a;
    }
    
    a {
      color: #3d6fe1;
      text-decoration: none;
    }
    
    tr {
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;

  fs.writeFileSync(htmlPath, fullHtml, 'utf8');

  try {
    const cmd = `"${chromePath}" --headless --disable-gpu --print-to-pdf="${pdfPath}" --no-sandbox "${htmlPath}"`;
    execSync(cmd);
    console.log(`Successfully generated ${pdfPath}`);
  } catch (error) {
    console.error(`Error rendering PDF for ${file.name}:`, error);
  } finally {
    if (fs.existsSync(htmlPath)) {
      fs.unlinkSync(htmlPath);
    }
  }
});

console.log('PDF generation complete!');
