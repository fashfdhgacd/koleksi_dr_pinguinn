// Poster SW disabled.
// Posters are served from R2 (img.koleksidrpinguin.com) with /thumb and brand fallbacks.
// Aggressive Cache Storage was causing large visitor disk usage.
// This file now only cleans up old caches and unregisters itself.

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore */
      }
      try {
        await self.registration.unregister();
      } catch {
        /* ignore */
      }
    })(),
  );
});

self.addEventListener("fetch", () => {});
