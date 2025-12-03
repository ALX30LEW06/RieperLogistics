/* ============================================================
   service-worker.js – Offline-Funktion & Cache-Verwaltung
   ============================================================
   Funktionen:
   - Offline-Nutzung der App
   - Dateien werden gecached (HTML, CSS, JS)
   - App lädt auch ohne Internet
   - Ideal für PWA-Installationen
   ============================================================ */

const CACHE_VERSION = "rieper-cache-v3";  
// ↑ Falls etwas nicht funktioniert: einfach Version erhöhen und Browser lädt alles neu.

const FILES_TO_CACHE = [
  "index.html",
  "styles.css",
  "app.js",
  "scanner.js",
  "csv.js",
  "db.js",
  "utils.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

/* ============================================================
   INSTALL – wird ausgeführt, wenn der Service Worker installiert wird
   ============================================================ */
self.addEventListener("install", (event) => {
  console.log("[SW] Install startet…");

  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      console.log("[SW] Cache wird befüllt");
      return cache.addAll(FILES_TO_CACHE);
    })
  );
});

/* ============================================================
   ACTIVATE – Alte Caches entfernen
   ============================================================ */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_VERSION) {
            console.log("[SW] Lösche alten Cache:", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
});

/* ============================================================
   FETCH – Jede Anfrage läuft durch diesen Handler
   ============================================================ */
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      // Falls Datei im Cache → nutze sie
      if (cached) {
        return cached;
      }

      // Falls nicht im Cache → aus dem Netz laden
      return fetch(event.request)
        .then((networkResponse) => {
          // Antworten, die nicht gecached werden sollen, filtern wir aus
          if (
            !networkResponse ||
            networkResponse.status !== 200 ||
            networkResponse.type !== "basic"
          ) {
            return networkResponse;
          }

          // Erfolgreiche Antwort → in Cache speichern
          const responseToCache = networkResponse.clone();

          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          // OPTIONAL: Fallback wenn offline und Datei fehlt
          return caches.match("index.html");
        });
    })
  );
});