"use client";

import { useEffect } from "react";

/**
 * One-time cleanup for visitors who already have the old Notix or poster Service Workers.
 * Unregisters them and clears Cache Storage so disk usage stops growing.
 * Posters continue to work via R2 + /thumb + brand fallbacks (no SW required).
 * PENTING: SW web push kita sendiri (/sw.js) TIDAK boleh di-unregister — langganan push ikut
 * terhapus bersama registrasinya, sehingga ajakan notifikasi muncul lagi di tiap halaman.
 */
function isOwnPushSw(r: ServiceWorkerRegistration): boolean {
  const w = r.active || r.waiting || r.installing;
  if (!w) return false;
  try {
    return new URL(w.scriptURL).pathname === "/sw.js";
  } catch {
    return false;
  }
}

export function SwCleanup() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    (async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        if (cancelled) return;
        await Promise.all(regs.filter((r) => !isOwnPushSw(r)).map((r) => r.unregister().catch(() => {})));
      } catch {
        /* ignore */
      }

      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          if (cancelled) return;
          await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
