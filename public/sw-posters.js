/* Poster only. Tidak menyentuh /api atau HTML. */
const CACHE = "dp-posters-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.destination !== "image") return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === "opaque")) {
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      } catch (err) {
        const fallback = await cache.match(req);
        if (fallback) return fallback;
        throw err;
      }
    }),
  );
});
