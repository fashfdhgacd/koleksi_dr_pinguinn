import { useEffect, useState } from "react";

/**
 * Ajakan "Aktifkan notifikasi" (web push video baru). Berlaku per SITUS, bukan per video:
 * - Tampil hanya kalau Notification.permission === "default", belum ada langganan push,
 *   dan pengunjung belum pernah menolak/menutup ajakan (flag localStorage situs-wide).
 * - Sudah berlangganan / izin sudah diputuskan → tidak tampil apa-apa di video mana pun.
 * - Langganan hanya di-POST sekali saat tombol di-tap (tidak ada tulis KV/D1 per kunjungan).
 * Izin browser hanya diminta saat tombol di-tap, tidak pernah otomatis.
 */
type State = "hidden" | "idle" | "busy" | "on" | "denied" | "error";

const FLAG_KEY = "kdp:push:v1"; // "on" | "dismissed"

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function readFlag(): string | null {
  try {
    return window.localStorage.getItem(FLAG_KEY);
  } catch {
    return null;
  }
}

function writeFlag(v: "on" | "dismissed") {
  try {
    window.localStorage.setItem(FLAG_KEY, v);
  } catch {
    /* ignore quota / private mode */
  }
}

function keyBytes(b64u: string): Uint8Array<ArrayBuffer> {
  const b = atob(b64u.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64u.length + 3) % 4));
  const out = new Uint8Array(new ArrayBuffer(b.length));
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export function PushButton() {
  const [state, setState] = useState<State>("hidden");

  useEffect(() => {
    if (!supported()) return;
    // Keputusan situs-wide: sudah pernah aktif / menolak / browser sudah memutuskan → jangan tanya lagi.
    if (readFlag() || Notification.permission !== "default") return;
    let alive = true;
    // Cek tanpa prompt: sudah berlangganan → simpan flag, tidak tampil.
    navigator.serviceWorker
      .getRegistration("/")
      .then((reg) => (reg ? reg.pushManager.getSubscription() : null))
      .then((sub) => {
        if (!alive) return;
        if (sub) {
          writeFlag("on");
          return;
        }
        setState("idle");
      })
      .catch(() => alive && setState("idle"));
    return () => {
      alive = false;
    };
  }, []);

  function dismiss() {
    writeFlag("dismissed");
    setState("hidden");
  }

  async function enable() {
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        writeFlag("dismissed");
        setState(perm === "denied" ? "denied" : "hidden");
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
      if (save.ok) {
        writeFlag("on");
        setState("on");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  if (state === "hidden") return null;
  if (state === "on") {
    return <p className="text-xs text-muted">🔔 Notifikasi aktif.</p>;
  }
  if (state === "denied") {
    return <p className="text-xs text-muted">Notifikasi diblokir browser. Aktifkan lewat pengaturan situs kalau mau.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={enable}
        disabled={state === "busy"}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-2 disabled:opacity-60"
      >
        🔔 {state === "busy" ? "Mengaktifkan…" : state === "error" ? "Gagal, coba lagi" : "Aktifkan notifikasi"}
      </button>
      {state !== "busy" && (
        <button type="button" onClick={dismiss} className="text-xs text-muted underline-offset-2 hover:underline">
          Nanti saja
        </button>
      )}
    </div>
  );
}
