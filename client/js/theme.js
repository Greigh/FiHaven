/* ═══════════════════════════════════════════════════════════
   theme.js — light/dark theme, shared by every page.
   Self-contained (no other module dependency) so it works on
   public pages too. The theme is a device-local preference and
   is never synced to the account.
═══════════════════════════════════════════════════════════ */

function readTheme() {
  try {
    return localStorage.getItem('fh_theme') || 'light';
  } catch (e) {
    return 'light';
  }
}

// Apply the saved theme immediately so there is no flash.
document.documentElement.dataset.theme = readTheme();

export function toggleTheme() {
  var next =
    document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('fh_theme', next);
  } catch (e) {
    /* storage unavailable — theme still applies for this page */
  }
}

// Inline onclick="toggleTheme()" handlers still work.
window.toggleTheme = toggleTheme;
