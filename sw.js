// Jesus Mar Couto · notificações (service worker)
// Só trata das notificações push: não guarda páginas em cache, para as atualizações continuarem a chegar logo.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const show = self.registration.showNotification(d.title || 'Jesus Mar Couto', {
    body: d.body || '', icon: 'icon-256.png', badge: 'icon-256.png',
    data: { url: d.url || './' }, timestamp: Date.now()
  });
  const badge = self.navigator && self.navigator.setAppBadge && d.badge != null
    ? (d.badge ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge()).catch(() => {}) : Promise.resolve();
  e.waitUntil(Promise.all([show, badge]));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = all.find((w) => w.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ abrir: new URL(url).searchParams.get('abrir') }); return c.focus(); }
    return self.clients.openWindow(url);
  })());
});
