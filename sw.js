/* ═══════════════════════════════════════════════════════════
   Los Angelitos — Service Worker
   v2.2 — fix pushsubscriptionchange iOS (null oldSubscription)
═══════════════════════════════════════════════════════════ */

const CACHE_NAME = 'angelitos-admin-v4';

/* ── Install: skip waiting para activarse de inmediato ── */
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

/* ── Activate: limpiar caches viejos ── */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ════════════════════════════════════════════════════════
   PUSH — se dispara cuando el Worker de Cloudflare envía
   un push real. Funciona con el celu bloqueado o apagado.
════════════════════════════════════════════════════════ */
self.addEventListener('push', function(event) {
  var data = {};
  if (event.data) {
    try { data = event.data.json(); } catch(e) { data = { title: event.data.text() }; }
  }

  var title   = data.title  || 'Los Angelitos';
  var body    = data.body   || 'Nuevo evento en el panel';
  var iconUrl = 'https://res.cloudinary.com/newen123/image/upload/q_auto/f_auto/v1779159240/logo_x9e3ej.jpg';
  var targetUrl = (data.data && data.data.url) || 'https://losangelito.com.ar/admin-mobile.html';

  // Tag dinámico para que notificaciones de distinto tipo no se colapsen entre sí
  var tag = (data.data && data.data.tag) || ('angelitos-' + Date.now());

  var options = {
    body:      body,
    icon:      iconUrl,
    badge:     iconUrl,
    tag:       tag,
    renotify:  true,
    vibrate:   [200, 100, 200],
    requireInteraction: false,
    data: { url: targetUrl }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/* ════════════════════════════════════════════════════════
   PUSHSUBSCRIPTIONCHANGE — iOS puede rotar la suscripción
   push después de actualizaciones o tiempo sin uso.
   Sin este handler, la suscripción vieja queda guardada en
   el Worker de Cloudflare y los pushes dejan de llegar.
════════════════════════════════════════════════════════ */
self.addEventListener('pushsubscriptionchange', function(event) {
  // En iOS oldSubscription puede ser null — necesitamos la VAPID key como fallback (Bug fix s34-b3)
  var VAPID_KEY = 'BBXzZ-mT-cAqC53DB6wjkggXtOPm1fiDNk727nz5SzFi-V8enrznswRdvROYivdyOjseVdsuJiNCsVu5Gc8c-qU';

  function b64ToUint8(b64) {
    var pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - b64.length % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  var appServerKey = (event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey)
    ? event.oldSubscription.options.applicationServerKey
    : b64ToUint8(VAPID_KEY);

  event.waitUntil(
    self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey
    }).then(function(newSub) {
      // Notificar a todos los clientes abiertos para que actualicen el Worker
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: newSub.toJSON() });
        });
        // Si no hay clientes abiertos, persistir directamente en el Worker de Cloudflare
        if (!clients.length) {
          return fetch('https://losangelitos-push.ewielcrack.workers.dev/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: newSub.toJSON() })
          }).catch(function() { /* sin conexión, el cliente lo reintentará al abrir la app */ });
        }
      });
    }).catch(function(e) {
      console.warn('[sw] pushsubscriptionchange error:', e);
    })
  );
});

/* ════════════════════════════════════════════════════════
   NOTIFICATION CLICK — al tocar la notificación abre
   la PWA (o la trae al frente si ya está abierta).
════════════════════════════════════════════════════════ */
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var targetUrl = (event.notification.data && event.notification.data.url)
    || 'https://losangelito.com.ar/admin-mobile.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients) {
      // Si la PWA ya está abierta, traerla al frente
      for (var i = 0; i < clients.length; i++) {
        var client = clients[i];
        if (client.url.indexOf('admin-mobile') !== -1 && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no está abierta, abrirla
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

/* ════════════════════════════════════════════════════════
   FETCH — estrategia network-first para la app,
   cache-first para assets estáticos de Cloudinary.
════════════════════════════════════════════════════════ */
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Ignorar peticiones al Apps Script, Worker de push y APIs externas
  if (url.indexOf('script.google.com') !== -1
   || url.indexOf('workers.dev') !== -1
   || url.indexOf('api.') !== -1) {
    return; // dejar pasar sin intervenir
  }

  // Para la app HTML: network-first (siempre la versión más fresca)
  if (url.indexOf('admin-mobile.html') !== -1) {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Para assets de Cloudinary: cache-first (logos, íconos)
  if (url.indexOf('cloudinary.com') !== -1) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        return cached || fetch(event.request).then(function(response) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
          return response;
        });
      })
    );
    return;
  }
});
