/**
 * Owner analytics shared helpers (split for maintainability / PR upload size).
 */
import { dbSource } from "@/lib/db";
import { resolveAnalyticsKV } from "@/lib/analytics-kv";

export type DeviceKind = "mobile" | "desktop" | "tablet" | "bot" | "other";

export type PageHit = {
  path: string;
  ref: string;
  device: DeviceKind;
  host: string;
  ts: number;
};

export type OwnerStats = {
  online: number;
  count: number;
  peakToday: number;
  peakDay: string;
  views24h: number;
  viewsToday: number;
  uniqueToday: number;
  views7d: number;
  views30d: number;
  hourly: { hour: string; views: number }[];
  topPaths: { path: string; views: number }[];
  topRefs: { ref: string; views: number }[];
  devices: { device: DeviceKind; views: number }[];
  hosts: { host: string; views: number }[];
  storage: "postgres" | "pglite" | "kv" | "kv-rest" | "memory" | "error";
  persistOk: boolean;
  database: "connected" | "error";
  analytics: "operational" | "unavailable";
  updatedAt: string;
  presence?: "memory" | "kv" | "postgres" | "hybrid";
  hint?: string;
};

/** Active window — UI says ±2 menit; client heartbeat 90s; KV TTL ≥ window + margin. */
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;
export const ONLINE_KV_PREFIX = "online:";
export const ONLINE_KV_TTL_SEC = 180; // 3 min TTL (≥ 2 min window + margin)
export const DAYSTATS_KV_PREFIX = "daystats:";
export const UV_KV_PREFIX = "uv:";
export const DAYSTATS_TTL_SEC = 172800; // 48h — keep today+yesterday

type MemState = {
  lastTelegramAlertAt: number;
  lastTelegramPeak: number;
  /** sessionId → lastSeen ms */
  presence: Map<string, number>;
};

declare global {
  // eslint-disable-next-line no-var
  var __drPinguinAnalyticsMem: MemState | undefined;
}

export function mem(): MemState {
  if (!globalThis.__drPinguinAnalyticsMem) {
    globalThis.__drPinguinAnalyticsMem = {
      lastTelegramAlertAt: 0,
      lastTelegramPeak: 0,
      presence: new Map(),
    };
  }
  if (!globalThis.__drPinguinAnalyticsMem.presence) {
    globalThis.__drPinguinAnalyticsMem.presence = new Map();
  }
  return globalThis.__drPinguinAnalyticsMem;
}

export function dayKey(ts = Date.now()): string {
  return new Date(ts + 7 * 3600_000).toISOString().slice(0, 10);
}

export function hourUtcBucket(ts = Date.now()): Date {
  const d = new Date(ts);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

export function classifyDevice(ua: string): DeviceKind {
  const u = ua.toLowerCase();
  if (!u) return "other";
  if (/bot|crawl|spider|slurp|facebookexternalhit|preview/i.test(u)) return "bot";
  if (/ipad|tablet|kindle|playbook/i.test(u)) return "tablet";
  if (/mobi|android|iphone|ipod|phone/i.test(u)) return "mobile";
  if (/windows|macintosh|linux|cros/i.test(u)) return "desktop";
  return "other";
}

export function classifyBrowser(ua: string): string {
  const u = ua.toLowerCase();
  if (/edg\//.test(u)) return "edge";
  if (/chrome|crios/.test(u)) return "chrome";
  if (/safari/.test(u) && !/chrome|crios/.test(u)) return "safari";
  if (/firefox|fxios/.test(u)) return "firefox";
  if (/opr\//.test(u)) return "opera";
  return "other";
}

export function normalizePath(path: string): string {
  let p = (path || "/").trim().slice(0, 200);
  if (!p.startsWith("/")) p = "/" + p;
  const q = p.indexOf("?");
  if (q >= 0) p = p.slice(0, q);
  return p || "/";
}

export function normalizeRef(ref: string): string {
  const r = (ref || "").trim().slice(0, 200);
  if (!r) return "(direct)";
  try {
    return new URL(r).hostname.replace(/^www\./, "");
  } catch {
    return r.slice(0, 80) || "(direct)";
  }
}

export function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

export function emptyHourly(now = Date.now()): { hour: string; views: number }[] {
  const hourly: { hour: string; views: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const t = now - i * 3600_000;
    const label = new Date(t + 7 * 3600_000).toISOString().slice(11, 13);
    hourly.push({ hour: label, views: 0 });
  }
  return hourly;
}

export function emptyStats(partial: Partial<OwnerStats> = {}): OwnerStats {
  const dk = dayKey();
  return {
    online: 0,
    count: 0,
    peakToday: 0,
    peakDay: dk,
    views24h: 0,
    viewsToday: 0,
    uniqueToday: 0,
    views7d: 0,
    views30d: 0,
    hourly: emptyHourly(),
    topPaths: [],
    topRefs: [],
    devices: [],
    hosts: [],
    storage: dbSource === "neon" ? "postgres" : "pglite",
    persistOk: dbSource === "neon",
    database: "connected",
    analytics: "operational",
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

export async function optionalKvPut(key: string, value: string, ttl?: number): Promise<void> {
  try {
    const handle = await resolveAnalyticsKV();
    if (!handle?.kv) return;
    await handle.kv.put(key, value, ttl ? { expirationTtl: ttl } : undefined);
  } catch {
    /* KV is optional */
  }
}

export async function optionalKvGet(key: string): Promise<string | null> {
  try {
    const handle = await resolveAnalyticsKV();
    if (!handle?.kv) return null;
    const v = await handle.kv.get(key);
    return v == null ? null : String(v);
  } catch {
    return null;
  }
}

export type DayStatsKv = { views: number; unique: number; peak: number };

export async function readDayStatsKv(dk = dayKey()): Promise<DayStatsKv> {
  const raw = await optionalKvGet(`${DAYSTATS_KV_PREFIX}${dk}`);
  if (!raw) return { views: 0, unique: 0, peak: 0 };
  try {
    const j = JSON.parse(raw) as Partial<DayStatsKv>;
    return {
      views: Math.max(0, Number(j.views) || 0),
      unique: Math.max(0, Number(j.unique) || 0),
      peak: Math.max(0, Number(j.peak) || 0),
    };
  } catch {
    return { views: 0, unique: 0, peak: 0 };
  }
}

export async function writeDayStatsKv(dk: string, stats: DayStatsKv): Promise<void> {
  await optionalKvPut(
    `${DAYSTATS_KV_PREFIX}${dk}`,
    JSON.stringify(stats),
    DAYSTATS_TTL_SEC,
  );
}

/** Persist pageview counters to KV when Postgres is down (or as parallel backup). */
export async function recordHitKv(input: {
  visitorId: string;
  sessionId: string;
  path: string;
  onlineHint?: number;
}): Promise<DayStatsKv> {
  const dk = dayKey();
  const stats = await readDayStatsKv(dk);
  stats.views += 1;

  const vid = input.visitorId || input.sessionId;
  if (vid) {
    const uvKey = `${UV_KV_PREFIX}${dk}:${vid}`;
    const existed = await optionalKvGet(uvKey);
    if (!existed) {
      stats.unique += 1;
      await optionalKvPut(uvKey, "1", DAYSTATS_TTL_SEC);
    }
  }

  const online = Math.max(stats.peak, input.onlineHint || 0, 1);
  if (online > stats.peak) stats.peak = online;

  await writeDayStatsKv(dk, stats);
  return stats;
}

export async function bumpPeakKv(online: number): Promise<void> {
  if (online <= 0) return;
  const dk = dayKey();
  const stats = await readDayStatsKv(dk);
  if (online > stats.peak) {
    stats.peak = online;
    await writeDayStatsKv(dk, stats);
  }
}

export async function getKV() {
  try {
    const handle = await resolveAnalyticsKV();
    return handle?.kv || null;
  } catch {
    return null;
  }
}

export function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
}
