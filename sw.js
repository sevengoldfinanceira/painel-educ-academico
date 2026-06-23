const APP_VERSION = "2026.06.23.10";
const CACHE_NAME = `educ-academico-${APP_VERSION}`;
const APP_CACHE_PREFIX = "educ-academico-";

const ASSETS = [
  `/styles.css?v=${APP_VERSION}`,
  `/app.js?v=${APP_VERSION}`,
  `/supabase-config.js?v=${APP_VERSION}`,
  `/educamais-catalog-data.js?v=${APP_VERSION}`,
  `/catedral-catalog-data.js?v=${APP_VERSION}`,
  "/assets/brand/perfil-e-logo.png",
  `/manifest.json?v=${APP_VERSION}`,
];

async function deleteOldCaches() {
  const keys = await caches.keys();
  const oldKeys = keys.filter((key) => key.startsWith(APP_CACHE_PREFIX) && key !== CACHE_NAME);
  await Promise.all(oldKeys.map((key) => caches.delete(key)));
  return oldKeys.length > 0;
}

async function notifyClientsAboutUpdate() {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => {
    client.postMessage({ type: "APP_VERSION_READY", version: APP_VERSION });
  });
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw _;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    deleteOldCaches()
      .then((hadOldCaches) => self.clients.claim().then(() => hadOldCaches))
      .then((hadOldCaches) => {
        if (hadOldCaches) return notifyClientsAboutUpdate();
        return null;
      })
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "CLEAR_OLD_CACHES") {
    event.waitUntil(deleteOldCaches());
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(request, { cache: "no-store" }).catch(() => caches.match("/") || caches.match("/index.html"))
    );
    return;
  }

  if (["style", "script", "worker", "manifest"].includes(request.destination)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (request.destination === "image") {
    event.respondWith(
      caches.match(request).then((cached) => cached || networkFirst(request))
    );
  }
});
