/* ═══════════════════════════════════════════════════════
   SERVICE WORKER — Los Angelitos Push Notifications
   Versión: 1.0 — sesión 34
   Subir este archivo a la raíz del repo GitHub Pages
   (mismo nivel que index.html)
═══════════════════════════════════════════════════════ */

var CACHE_NAME = 'losangelitos-sw-v1';

/* ── INSTALL ── */
self.addEventListener('install', function(e) {
  self.skipWaiting();
});

/* ── ACTIVATE ── */
self.addEventListener('activate', function(e) {
  e.waitUntil(clients.claim());
});

/* ── PUSH EVENT: llega cuando el Worker Cloudflare envía la notificación ── */
self.addEventListener('push', function(e) {
  var data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch(err) {
    data = { title: '🛒 Nuevo pedido', body: e.data ? e.data.text() : '' };
  }

  var title   = data.title  || '🛒 Los Angelitos';
  var options = {
    body:    data.body    || 'Entrá al panel para verlo.',
    icon:    data.icon    || 'https://res.cloudinary.com/newen123/image/upload/q_auto/f_auto/v1779159240/logo_x9e3ej.jpg',
    badge:   data.badge   || 'https://res.cloudinary.com/newen123/image/upload/q_auto/f_auto/v1779159240/logo_x9e3ej.jpg',
    tag:     data.tag     || 'pedido-nuevo',   // reemplaza notif anterior del mismo tipo
    renotify: true,
    vibrate: [200, 100, 200],
    data:    data.data    || { url: 'https://losangelito.com.ar' },
    actions: [
      { action: 'abrir', title: '📋 Ver panel' },
      { action: 'cerrar', title: 'Cerrar' }
    ]
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

/* ── NOTIFICATION CLICK: abre/foca el sitio ── */
self.addEventListener('notificationclick', function(e) {
  e.notification.close();

  if (e.action === 'cerrar') return;

  var targetUrl = (e.notification.data && e.notification.data.url)
    ? e.notification.data.url
    : 'https://losangelito.com.ar';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(windowClients) {
        // Si ya hay una pestaña abierta, foco en ella
        for (var i = 0; i < windowClients.length; i++) {
          var client = windowClients[i];
          if (client.url.indexOf('losangelito.com.ar') !== -1 && 'focus' in client) {
            return client.focus();
          }
        }
        // Si no hay pestaña abierta, abrir una nueva
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
