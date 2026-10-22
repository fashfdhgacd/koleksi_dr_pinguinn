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

/** One row of "Video terpopuler hari ini" (/watch/<id> pageviews, today WIB). */
export type TopVideo = {
  id: string;
  path: string;
  views: number;
  unique?: number;
  title?: string;
  category?: string;
};

export type DayRow = { day: string; views: number; unique: number; peak: number };

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
  /** Last 14 WIB days, newest first. days[0] is today — same numbers as the top cards. */
  days: DayRow[];
  yesterdayViews: number;
  yesterdayUnique: number;
  /** Where days/top cards came from (single source of truth for this response). */
  historySource: "d1" | "postgres" | "kv" | "none";
  hourly: { hour: string; views: number }[];
  topPaths: { path: string; views: number }[];
  /** Today's (WIB) most viewed video pages, views desc. Separate from topPaths. */
  topVideos: TopVideo[];
  topRefs: { ref: string; views: number }[];
  devices: { device: DeviceKind; views: number }[];
  browsers?: { browser: string; views: number }[];
  countries?: { country: string; views: number }[];
  hosts: { host: string; views: number }[];
  storage: "d1" | "postgres" | "pglite" | "kv" | "kv-rest" | "memory" | "error";
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
/** Keep ≥14 WIB days so the KV fallback can render the full history table. */
export const DAYSTATS_TTL_SEC = 16 * 86400;
/** Unique-visitor marker only needs to outlive its WIB day. */
export const UV_TTL_SEC = 36 * 3600;
export const HISTORY_DAYS = 14;

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
  if (/opr\/|opera/.test(u)) return "opera";
  if (/samsungbrowser/.test(u)) return "samsung";
  if (/ucbrowser/.test(u)) return "uc";
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
    days: [],
    yesterdayViews: 0,
    yesterdayUnique: 0,
    historySource: "none",
    hourly: emptyHourly(),
    topPaths: [],
    topVideos: [],
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

/** `at` = epoch ms of the last D1 → KV mirror (absent on per-hit KV counters). */
export type DayStatsKv = { views: number; unique: number; peak: number; at?: number };

export async function readDayStatsKv(dk = dayKey()): Promise<DayStatsKv> {
  const raw = await optionalKvGet(`${DAYSTATS_KV_PREFIX}${dk}`);
  if (!raw) return { views: 0, unique: 0, peak: 0 };
  try {
    const j = JSON.parse(raw) as Partial<DayStatsKv>;
    const at = Number(j.at) || 0;
    return {
      views: Math.max(0, Number(j.views) || 0),
      unique: Math.max(0, Number(j.unique) || 0),
      peak: Math.max(0, Number(j.peak) || 0),
      ...(at > 0 ? { at } : {}),
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

/**
 * KV fallback counters (only used when D1/Postgres is unavailable or failing).
 * Budget guard: hits are buffered in isolate memory and flushed to KV at most once per
 * KV_FALLBACK_FLUSH_MS per isolate (one daystats write), and no per-visitor uv:<day>:<id> key is
 * written any more. Before this, an outage of the database meant 2 KV writes per pageview, which
 * alone could burn the 1M writes/month in a day or two. Unique visitors are approximated from
 * distinct ids seen by this isolate inside the buffer window (undercount, fallback only).
 */
const KV_FALLBACK_FLUSH_MS = 60_000;
type KvHitBuffer = { day: string; views: number; ids: Set<string>; peak: number; lastFlush: number };
const kvHitState = globalThis as typeof globalThis & { __kdpKvHitBuf__?: KvHitBuffer };

function kvHitBuffer(dk: string): KvHitBuffer {
  let b = kvHitState.__kdpKvHitBuf__;
  if (!b || b.day !== dk) {
    b = { day: dk, views: 0, ids: new Set<string>(), peak: 0, lastFlush: b?.day === dk ? b.lastFlush : 0 };
    kvHitState.__kdpKvHitBuf__ = b;
  }
  return b;
}

async function flushKvHitBuffer(dk: string, force = false): Promise<DayStatsKv> {
  const b = kvHitBuffer(dk);
  const now = Date.now();
  const stats = await readDayStatsKv(dk);
  const pending = b.views > 0 || b.peak > stats.peak;
  if (!pending) return stats;
  if (!force && b.lastFlush && now - b.lastFlush < KV_FALLBACK_FLUSH_MS) {
    return {
      views: stats.views + b.views,
      unique: stats.unique + b.ids.size,
      peak: Math.max(stats.peak, b.peak),
    };
  }
  const next: DayStatsKv = {
    views: stats.views + b.views,
    unique: stats.unique + b.ids.size,
    peak: Math.max(stats.peak, b.peak),
  };
  b.views = 0;
  b.ids = new Set<string>();
  b.lastFlush = now;
  await writeDayStatsKv(dk, next);
  return next;
}

/** Persist pageview counters to KV when Postgres is down (or as parallel backup). Buffered. */
export async function recordHitKv(input: {
  visitorId: string;
  sessionId: string;
  path: string;
  onlineHint?: number;
}): Promise<DayStatsKv> {
  const dk = dayKey();
  const b = kvHitBuffer(dk);
  b.views += 1;
  const vid = input.visitorId || input.sessionId;
  if (vid && b.ids.size < 5000) b.ids.add(vid);
  // Peak = real concurrent count (bumpPeakKv from presence); only raise, never fake.
  const hint = Math.max(0, Number(input.onlineHint) || 0);
  if (hint > b.peak) b.peak = hint;
  return flushKvHitBuffer(dk);
}

export async function bumpPeakKv(online: number): Promise<void> {
  if (online <= 0) return;
  const dk = dayKey();
  const b = kvHitBuffer(dk);
  if (online > b.peak) b.peak = online;
  await flushKvHitBuffer(dk);
}

/** WIB day keys, newest first: [today, yesterday, ...]. */
export function lastDayKeys(count = HISTORY_DAYS, now = Date.now()): string[] {
  return Array.from({ length: count }, (_, i) => dayKey(now - i * 86400_000));
}

/** KV fallback history (per-request daystats counters), newest first. */
export async function readDayStatsHistoryKv(count = HISTORY_DAYS, now = Date.now()): Promise<DayRow[]> {
  const keys = lastDayKeys(count, now);
  const rows = await Promise.all(keys.map((day) => readDayStatsKv(day)));
  return keys.map((day, i) => ({ day, views: rows[i].views, unique: rows[i].unique, peak: rows[i].peak }));
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

/** Two-letter country from Cloudflare's CF-IPCountry header; "XX"/"T1" and junk become "". */
export function normalizeCountry(raw: string | null | undefined): string {
  const c = String(raw || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c) || c === "XX" || c === "T1") return "";
  return c;
}
