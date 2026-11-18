/* DIGITAL-PRIME — Service Worker
   Un gestionnaire fetch est indispensable : sans lui, Chrome/Android ne
   propose pas l'installation de l'application (beforeinstallprompt). */
var CACHE_NAME = 'digital-prime-v2';
var APP_SHELL = [
  './', './index.html', './app.html',
  './css/style.css', './js/api.js', './js/install.js',
  './images/icon-192.png', './images/icon-512.png',
  './images/apple-touch-icon.png', './manifest.webmanifest'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(APP_SHELL.map(function (url) {
        return cache.add(url).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Réseau d'abord pour TOUTES les ressources (pages, CSS, JS, images) :
   les mises à jour prennent effet dès le rechargement, et le cache sert
   uniquement de secours hors ligne. Les appels API ne sont jamais mis en
   cache (sessions, données privées). */
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') !== -1) return;

  event.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(url.href, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        return req.mode === 'navigate' ? caches.match('./index.html') : Response.error();
      });
    })
  );
});

/* Les navigateurs renouvellent parfois l'abonnement : on ré-enregistre la clé côté serveur. */
self.addEventListener('pushsubscriptionchange', function (event) {
  var sync = (async function () {
    var keyRes = await fetch('api/push.php?action=key', { credentials: 'same-origin' });
    var key = (await keyRes.json()).key;
    var s = key.replace(/-/g, '+').replace(/_/g, '/');
    s += '='.repeat((4 - s.length % 4) % 4);
    var binary = Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); });
    var sub = event.newSubscription || await self.registration.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: binary
    });
    var j = sub.toJSON();
    await fetch('api/push.php?action=subscribe', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys })
    });
  })();
  if (event.waitUntil) event.waitUntil(sync.catch(function () {}));
});

self.addEventListener('push', function (event) {
  var data = {};
  if (event.data) {
    try { data = event.data.json(); } catch (e) { data = { body: event.data.text() }; }
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Appel entrant — DIGITAL-PRIME', {
    body: data.body || 'Un ami vous appelle sur DIGITAL-PRIME.',
    icon: 'images/icon-192.png',
    badge: 'images/icon-192.png',
    tag: data.tag || 'dp-call',
    renotify: true,
    requireInteraction: true,
    data: { url: data.url || 'app.html' },
    actions: [
      { action: 'open', title: 'Répondre' },
      { action: 'dismiss', title: 'Ignorer' }
    ]
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  if (event.action === 'dismiss') return;
  var raw = (event.notification.data && event.notification.data.url) || 'app.html';
  var url = new URL(raw, self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf('digital-prime') !== -1 && 'focus' in list[i]) {
          list[i].navigate(url);
          return list[i].focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
