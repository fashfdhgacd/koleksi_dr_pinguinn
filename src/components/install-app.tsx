import { useEffect, useState } from "react";

/**
 * Tombol "Pasang aplikasi" (PWA, pakai /site.webmanifest yang sudah ada).
 * - Android/desktop Chromium: tampil hanya kalau browser mengirim `beforeinstallprompt`; tap → prompt asli.
 * - iOS Safari (tanpa beforeinstallprompt): tombol membuka petunjuk Bagikan → Tambah ke Layar Utama.
 * - Sudah terpasang (display-mode standalone) atau pernah ditutup (localStorage) → tidak tampil.
 * Murni klien: tidak ada request ke server, tidak ada tulis KV/D1.
 */
type BipEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const FLAG_KEY = "kdp:install:v1"; // "done" | "dismissed"

function readFlag(): string | null {
  try {
    return window.localStorage.getItem(FLAG_KEY);
  } catch {
    return null;
  }
}

function writeFlag(v: "done" | "dismissed") {
  try {
    window.localStorage.setItem(FLAG_KEY, v);
  } catch {
    /* ignore */
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function InstallApp() {
  const [evt, setEvt] = useState<BipEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hint, setHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined" || readFlag() || isStandalone()) return;
    if (isIos()) {
      setIos(true);
      setHidden(false);
      return;
    }
    const onBip = (e: Event) => {
      e.preventDefault();
      setEvt(e as BipEvent);
      setHidden(false);
    };
    const onInstalled = () => {
      writeFlag("done");
      setHidden(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden || (!evt && !ios)) return null;

  async function install() {
    if (ios) {
      setHint((v) => !v);
      return;
    }
    if (!evt) return;
    await evt.prompt().catch(() => undefined);
    const choice = await evt.userChoice.catch(() => null);
    writeFlag(choice?.outcome === "accepted" ? "done" : "dismissed");
    setEvt(null);
    setHidden(true);
  }

  function dismiss() {
    writeFlag("dismissed");
    setHidden(true);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={install}
          className="inline-flex items-center gap-2 rounded-full border border-teal-400/60 px-4 py-2 text-sm font-medium text-teal-300 transition-colors hover:bg-teal-400/10"
        >
          📲 Pasang aplikasi
        </button>
        <button type="button" onClick={dismiss} className="text-xs text-muted underline-offset-2 hover:underline">
          Nanti saja
        </button>
      </div>
      {ios && hint ? (
        <p className="text-xs text-zinc-400">
          Di Safari: tap tombol <strong>Bagikan</strong> (kotak dengan panah ke atas), lalu pilih{" "}
          <strong>Tambah ke Layar Utama</strong>.
        </p>
      ) : null}
    </div>
  );
}
