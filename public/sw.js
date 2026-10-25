// Cleanup SW: Notix (3nbf4.com) is no longer used.
// This replaces the old SW so existing registrations self-destruct and clear caches.

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
      try {
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) {
          client.postMessage({ type: "SW_CLEANED" });
        }
      } catch {
        /* ignore */
      }
    })(),
  );
});

// Do not intercept any fetches. Posters and everything else go straight to network / browser cache.
self.addEventListener("fetch", () => {});
