// Service worker Koleksi Dr. Pinguin: hanya web push (notifikasi video baru).
// Tidak ada fetch handler / cache: aman untuk HP dan tidak memakan penyimpanan pengunjung.
// Juga menggantikan SW lama (Notix, sw-posters.js) dan membersihkan cache lamanya.

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
        await self.clients.claim();
      } catch {
        /* ignore */
      }
    })(),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Video baru di Koleksi Dr. Pinguin";
  const options = {
    body: data.body || "Ada video baru, yuk tonton.",
    icon: data.icon || "/logo-penguin.png",
    badge: "/logo-penguin.png",
    data: { url: data.url || "/" },
    tag: "video-baru",
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (w.url === url && "focus" in w) return w.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
