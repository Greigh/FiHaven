/* ═══════════════════════════════════════════════════════════
   webpush.js — browser push subscription (Chrome / Firefox / Edge,
   via the Web Push protocol + VAPID).

   Registers the service worker, requests notification permission,
   subscribes to push, and registers the subscription with the server
   as a `web` push device (stored alongside iOS/Android tokens). Every
   path degrades gracefully where the browser or server lacks support.
═══════════════════════════════════════════════════════════ */

export function webPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function csrf() {
  return (window.AppAuth && window.AppAuth.getCsrfToken && window.AppAuth.getCsrfToken()) || '';
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('request-failed');
  return res.json().catch(() => ({}));
}

function serverConfig() {
  return fetch('/api/push/config', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
}

// { supported, configured, enabled, permission } — drives the settings UI.
export async function webPushStatus() {
  if (!webPushSupported()) return { supported: false, configured: false, enabled: false, permission: 'default' };
  const cfg = await serverConfig();
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return {
    supported: true,
    configured: !!(cfg && cfg.webPushPublicKey),
    enabled: !!sub && Notification.permission === 'granted',
    permission: Notification.permission,
  };
}

export async function enableWebPush() {
  if (!webPushSupported()) throw new Error('unsupported');
  const cfg = await serverConfig();
  if (!cfg || !cfg.webPushPublicKey) throw new Error('not-configured');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');

  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(cfg.webPushPublicKey),
    });
  }
  await postJson('/api/push/register', { platform: 'web', token: JSON.stringify(sub) });
  return true;
}

export async function disableWebPush() {
  if (!webPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  try { await postJson('/api/push/unregister', { token: JSON.stringify(sub) }); } catch (e) { /* ignore */ }
  try { await sub.unsubscribe(); } catch (e) { /* ignore */ }
}
