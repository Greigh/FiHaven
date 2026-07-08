/* ═══════════════════════════════════════════════════════════
   home-hero.js — small enhancements for the marketing home page.
   Keeps the faux dashboard preview's month label current so the
   hero never looks stale. No-ops on pages without the element.
═══════════════════════════════════════════════════════════ */

const monthEl = document.getElementById('hero-preview-month');
if (monthEl) {
  monthEl.textContent = new Date().toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}
