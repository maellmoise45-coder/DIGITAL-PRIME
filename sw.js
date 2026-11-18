self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Les navigateurs renouvellent parfois l'abonnement : on ré-enregistre la nouvelle clé côté serveur.
self.addEventListener('pushsubscriptionchange', (event) => {
  const sync = (async () => {
    const keyRes = await fetch('api/push.php?action=key', { credentials: 'same-origin' });
    const key = (await keyRes.json()).key;
    let s = key.replace(/-/g, '+').replace(/_/g, '/');
    s += '='.repeat((4 - s.length % 4) % 4);
    const binary = Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const sub = event.newSubscription || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: binary });
    const j = sub.toJSON();
    await fetch('api/push.php?action=subscribe', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys })
    });
  })();
  if (event.waitUntil) event.waitUntil(sync.catch(() => {}));
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try { data = event.data.json(); } catch (e) { data = { body: event.data.text() }; }
  }
  const title = data.title || 'Appel entrant — DIGITAL-PRIME';
  const options = {
    body: data.body || 'Un ami vous appelle sur DIGITAL-PRIME.',
    icon: 'images/logo-h.svg',
    badge: 'images/logo-h.svg',
    tag: data.tag || 'dp-call',
    renotify: true,
    requireInteraction: true,
    data: { url: data.url || 'app.html' },
    actions: [
      { action: 'open', title: 'Répondre' },
      { action: 'dismiss', title: 'Ignorer' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const raw = (event.notification.data && event.notification.data.url) || 'app.html';
  const url = new URL(raw, self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.indexOf('digital-prime') !== -1 && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
