// Service worker minimo: cachea solo el "app shell" estatico (raiz, manifest
// e iconos) para que la PWA sea instalable y arranque offline. El contenido
// dinamico (rutas /n/{opaqueId}, API de ingesta, resultado en vivo) siempre
// requiere red y nunca se cachea aqui — no es objetivo de esta tarea (E09-T1)
// tener offline-first completo, solo el shell.
const CACHE_NAME = "check-shell-v1";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !APP_SHELL.includes(url.pathname)) {
    return;
  }

  // Stale-while-revalidate solo para el shell estatico.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
