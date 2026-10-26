import { useEffect, useState } from "react";

/**
 * Tombol "Aktifkan notifikasi" (web push video baru). Izin browser hanya diminta saat tombol di-tap,
 * tidak pernah otomatis. Disembunyikan kalau browser tidak mendukung atau sudah berlangganan.
 */
type State = "hidden" | "idle" | "busy" | "on" | "denied" | "error";

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function keyBytes(b64u: string): Uint8Array {
  const b = atob(b64u.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64u.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export function PushButton() {
  const [state, setState] = useState<State>("hidden");

  useEffect(() => {
    if (!supported()) return;
    if (Notification.permission === "denied") {
      setState("hidden");
      return;
    }
    let alive = true;
    // Cek tanpa prompt: sudah berlangganan → tombol tidak perlu tampil.
    navigator.serviceWorker
      .getRegistration("/")
      .then((reg) => (reg ? reg.pushManager.getSubscription() : null))
      .then((sub) => {
        if (alive) setState(sub ? "on" : "idle");
      })
      .catch(() => alive && setState("idle"));
    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const res = await fetch("/api/push", { cache: "no-store" });
      const { publicKey } = (await res.json()) as { publicKey: string };
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const save = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setState(save.ok ? "on" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "hidden") return null;
  if (state === "on") {
    return <p className="text-xs text-muted">🔔 Notifikasi video baru aktif.</p>;
  }
  if (state === "denied") {
    return <p className="text-xs text-muted">Notifikasi diblokir browser. Aktifkan lewat pengaturan situs kalau mau.</p>;
  }
  return (
    <button
      type="button"
      onClick={enable}
      disabled={state === "busy"}
      className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-2 disabled:opacity-60"
    >
      🔔 {state === "busy" ? "Mengaktifkan…" : state === "error" ? "Gagal, coba lagi" : "Aktifkan notifikasi"}
    </button>
  );
}
