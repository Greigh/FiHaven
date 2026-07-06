/* ═══════════════════════════════════════════════════════════
   sw.js — FiHaven service worker (web push only).

   Deliberately minimal: it exists to receive Web Push events and show
   notifications. The app is online-first, so there's no offline caching
   here — adding caching later is safe as long as this push handler stays.
═══════════════════════════════════════════════════════════ */

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
