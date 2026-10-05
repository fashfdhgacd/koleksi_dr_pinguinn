"use client";

const SECRET_KEY = "drp_owner_secret";
const SECRET_LEGACY = "drp_online_secret";
export const POLL_MS = 25_000;

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
