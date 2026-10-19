"use client";

import { useEffect, useState } from "react";

const SECRET_KEY = "drp_owner_secret";
const SECRET_LEGACY = "drp_online_secret";
/**
 * No interval polling (Cloudflare cost): /pemilik loads when it opens, on the Refresh button, and
 * when the tab becomes visible again, at most once per REFRESH_MIN_GAP_MS.
 */
export const REFRESH_MIN_GAP_MS = 60_000;

export type DeviceKind = "mobile" | "desktop" | "tablet" | "bot" | "other";

export type DayRow = {
  day: string;
  views: number;
  unique: number;
  peak: number;
};

export type TopVideo = {
  id: string;
  path: string;
  views: number;
  unique?: number;
  title?: string;
  category?: string;
};

export type OwnerStats = {
  ok?: boolean;
  owner?: boolean;
  error?: string;
  hint?: string;
  online?: number;
  count?: number;
  peakToday?: number;
  viewsToday?: number;
  views24h?: number;
  uniqueToday?: number;
  views7d?: number;
  yesterdayViews?: number;
  yesterdayUnique?: number;
  days?: DayRow[];
  topPaths?: { path: string; views: number }[];
  topVideos?: TopVideo[];
  topRefs?: { ref: string; views: number }[];
  devices?: { device: DeviceKind; views: number }[];
  persistOk?: boolean;
  presence?: "memory" | "kv" | "postgres" | "hybrid";
  updatedAt?: string;
};

export function loadSecret(): string {
  try {
    return sessionStorage.getItem(SECRET_KEY) || sessionStorage.getItem(SECRET_LEGACY) || "";
  } catch {
    return "";
  }
}

export function saveSecret(value: string) {
  try {
    if (value) {
      sessionStorage.setItem(SECRET_KEY, value);
      sessionStorage.setItem(SECRET_LEGACY, value);
    } else {
      sessionStorage.removeItem(SECRET_KEY);
      sessionStorage.removeItem(SECRET_LEGACY);
    }
  } catch {
    /* ignore */
  }
}

export function fmt(n: number | null | undefined): string {
  return Math.max(0, Number(n) || 0).toLocaleString("id-ID");
}

export function deviceLabel(d: DeviceKind): string {
  if (d === "mobile") return "HP";
  if (d === "desktop") return "Desktop";
  if (d === "tablet") return "Tablet";
  if (d === "bot") return "Bot";
  return "Lainnya";
}

export function presenceLabel(p?: OwnerStats["presence"]): string {
  if (p === "hybrid" || p === "postgres") return "Sesi nyata (server)";
  if (p === "kv") return "Sesi nyata (KV)";
  return "Sesi isolate ini";
}

export function dayLabel(iso: string, index: number): string {
  if (index === 0) return "Hari ini";
  if (index === 1) return "Kemarin";
  try {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("id-ID", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

export function deltaPct(now: number, prev: number): string | null {
  if (!prev && !now) return null;
  if (!prev) return "baru";
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return "0%";
  return `${pct > 0 ? "+" : ""}${pct}%`;
}


export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | null;
}) {
  const up = hint && hint.startsWith("+");
  const down = hint && hint.startsWith("-");
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#141416] px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-2 font-display text-2xl tabular-nums text-zinc-50">{value}</p>
      {hint ? (
        <p className={`mt-1 text-[11px] ${up ? "text-emerald-400" : down ? "text-red-400" : "text-zinc-600"}`}>
          vs kemarin {hint}
        </p>
      ) : null}
    </div>
  );
}

/** "18.47" in WIB, or "" when unknown. */
export function wibHourMinute(ms: number | null | undefined): string {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** "19 Okt 12.03 WIB" for an ISO time / epoch ms; "belum ada data" when missing. */
export function wibDateTime(v: string | number | null | undefined): string {
  if (v == null || v === "") return "belum ada data";
  const d = new Date(typeof v === "number" ? v : String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return `${d.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} WIB`;
}

/* ---------- Error toasts (client only, no server cost) ---------- */

type ToastDetail = { id: number; text: string; kind: "error" | "ok"; action?: { label: string; run: () => void } };

const TOAST_EVENT = "drp-owner-toast";
let toastSeq = 0;

/** Shows a small floating notice at the bottom of /pemilik (hides itself after 6 s). */
export function ownerToast(text: string, kind: "error" | "ok" = "error", action?: ToastDetail["action"]) {
  if (typeof window === "undefined") return;
  toastSeq += 1;
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { id: toastSeq, text, kind, action } }));
}

export function OwnerToaster() {
  const [items, setItems] = useState<ToastDetail[]>([]);
  useEffect(() => {
    const timers = new Set<number>();
    const onToast = (e: Event) => {
      const d = (e as CustomEvent<ToastDetail>).detail;
      if (!d?.text) return;
      setItems((cur) => [...cur.filter((t) => t.text !== d.text), d].slice(-3));
      const t = window.setTimeout(() => {
        setItems((cur) => cur.filter((x) => x.id !== d.id));
        timers.delete(t);
      }, 6000);
      timers.add(t);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border border-l-[3px] px-3 py-2 text-xs shadow-xl shadow-black/50 ${
            t.kind === "error"
              ? "border-red-400/40 border-l-red-400 bg-[#1c1416] text-red-100"
              : "border-[#2dd4bf]/40 border-l-[#2dd4bf] bg-[#101a19] text-teal-50"
          }`}
        >
          <span className="min-w-0 flex-1">
            {t.text}
            {t.action ? (
              <button
                type="button"
                className="ml-2 underline underline-offset-2"
                onClick={() => {
                  t.action?.run();
                  setItems((cur) => cur.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            ) : null}
          </span>
          <button
            type="button"
            aria-label="Tutup"
            className="shrink-0 text-zinc-500 hover:text-zinc-200"
            onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
