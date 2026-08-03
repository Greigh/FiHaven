/* ═══════════════════════════════════════════════════════════
   swRegister.js — register the service worker for every signed-in page.

   Registration used to happen only inside enableWebPush(), so the shell
   was cached only for people who had turned notifications on. Offline
   support can't depend on an unrelated opt-in: without a registered
   worker the app simply doesn't start without a connection, however
   much data is sitting in localStorage.

   Registering is idempotent — the browser reuses an existing
   registration for the same scope, so enableWebPush() calling it again
   is harmless.
═══════════════════════════════════════════════════════════ */

export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // Wait for load: registering during startup competes with the requests
  // that paint the dashboard, on exactly the connections that can least
  // afford it.
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {
      /* unsupported, blocked by policy, or a non-secure origin — the app
         works exactly as it did before, just without offline start-up. */
    });
  });
}

registerServiceWorker();
