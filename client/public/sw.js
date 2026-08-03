/* ═══════════════════════════════════════════════════════════
   sw.js — FiHaven service worker: web push + offline app shell.

   This used to be push-only, with a note that the app was
   "online-first". It isn't meant to be: the native contract has always
   asked for offline reads, and without a cached shell the web app can't
   even start without a connection — the localStorage data cache behind
   it was unreachable, because the HTML and JS that read it had to come
   off the network first.

   Two strategies, chosen by what breaks worst when it goes stale:

   - **Navigations and same-origin static assets: network first**, then
     cache. Freshness matters more than speed here — a stale bundle
     served against a newer server is how you get a client that can't
     parse a response — and the cache is the fallback, not the default.
   - **/api/*: never cached.** A cached balance or bill total that looks
     live is worse than an honest failure; the app already has its own
     data cache and its own "Offline" indicator for that.

   Bump CACHE_VERSION to retire every previously cached response.
═══════════════════════════════════════════════════════════ */

var CACHE_VERSION = 'fihaven-v1';
var OFFLINE_URL = '/offline.html';

/* Shell entries worth having before the first offline load. Deliberately
   short: hashed bundles are picked up at runtime instead, so this list
   never has to be regenerated at build time. */
var PRECACHE = [OFFLINE_URL, '/icon.svg', '/site.webmanifest'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // One bad entry must not fail the whole install, so each is added on
      // its own and allowed to fail.
      .then(function (cache) {
        return Promise.all(
          PRECACHE.map(function (url) {
            return cache.add(url).catch(function () {});
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            return key === CACHE_VERSION ? undefined : caches.delete(key);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

/** Same-origin GETs we're willing to serve from cache. */
function isCacheable(request) {
  if (request.method !== 'GET') return false;
  var url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return false;
  }
  if (url.origin !== self.location.origin) return false;
  // Never the API: stale financial data that looks current is worse than
  // an error the app can report honestly.
  if (url.pathname.indexOf('/api/') === 0) return false;
  return true;
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (!isCacheable(request)) return;

  event.respondWith(
    fetch(request)
      .then(function (response) {
        // Only cache responses we can actually replay. An opaque or error
        // response cached here would be served back as if it were the page.
        if (response && response.ok && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) {
            cache.put(request, copy).catch(function () {});
          });
        }
        return response;
      })
      .catch(function () {
        return caches.match(request).then(function (hit) {
          if (hit) return hit;
          // A navigation with nothing cached still needs *something* to
          // render, or the browser shows its own dinosaur.
          if (request.mode === 'navigate') {
            return caches.match(OFFLINE_URL).then(function (page) {
              return (
                page ||
                new Response('You are offline.', {
                  status: 503,
                  headers: { 'Content-Type': 'text/plain' },
                })
              );
            });
          }
          return new Response('', { status: 504 });
        });
      })
  );
});

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  var title = data.title || 'FiHaven';
  var options = {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || 'fihaven-reminder',
    data: { url: data.url || '/dashboard' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) { list[i].focus(); return undefined; }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    })
  );
});
