/**
 * Live visitors (online:<id> keys) + per-isolate rollup of top paths/refs/devices.
 *
 * NOTE: the roll is buffered in isolate memory and flushed with last-writer-wins,
 * so its view/unique/peak totals undercount badly when several Workers isolates
 * are live (that was the "Riwayat 14 hari" vs top-card mismatch). Daily totals now
 * come from Postgres events (or KV daystats fallback) in owner-analytics-stats;
 * this roll is only used as a fallback for the top lists.
 *
 * KV write budget (Oct 2026: the free 1M writes/month ran out): when the D1 binding ANALYTICS_DB is
 * ready, presence lives in D1 analytics_sessions (touchOnline), so no online:<id> key is written and
 * no KV list() is made per heartbeat, and the roll is flushed at most once per ROLL_FLUSH_D1_MS per
 * isolate. Without D1 everything works exactly as before (KV presence + 20 s roll flush).
 */

import { resolveAnalyticsKV, type KVNamespaceLike } from "@/lib/analytics-kv";
import { readyD1 } from "@/lib/analytics-d1";

const ONLINE_PREFIX = "online:";
const ROLL_PREFIX = "roll:";
/** ≥ presence window (120s) + margin; client heartbeat ~90s. */
const ONLINE_TTL_SEC = 180;
const ROLL_TTL_SEC = 90 * 24 * 3600;
const FLUSH_MS = 20_000;
/** Roll flush interval when D1 is the source of truth (the roll is then only a fallback). */
const ROLL_FLUSH_D1_MS = 60 * 60_000;
const COUNT_CACHE_MS = 45_000;
const HISTORY_CACHE_MS = 60_000;

export type KvRoll = {
  views: number;
  unique: number;
  peak: number;
  paths: Record<string, number>;
  refs: Record<string, number>;
  devices: Record<string, number>;
};

export type KvDayRow = {
  day: string;
  views: number;
  unique: number;
  peak: number;
};

let kvHandle: KVNamespaceLike | null = null;
let rollMem: KvRoll | null = null;
let rollDay = "";
let rollDirty = false;
let lastFlush = 0;
let countCache: { at: number; n: number } | null = null;
let historyCache: { at: number; rows: KvDayRow[] } | null = null;

function dayKey(ts = Date.now()): string {
  return new Date(ts + 7 * 3600_000).toISOString().slice(0, 10);
}

function emptyRoll(): KvRoll {
  return { views: 0, unique: 0, peak: 0, paths: {}, refs: {}, devices: {} };
}

function bumpMap(map: Record<string, number>, key: string, cap = 24): void {
  const k = (key || "(lain)").slice(0, 80);
  map[k] = (map[k] || 0) + 1;
  const keys = Object.keys(map);
  if (keys.length <= cap) return;
  const sorted = keys.sort((a, b) => (map[b] || 0) - (map[a] || 0));
  for (const extra of sorted.slice(cap)) delete map[extra];
}

function top(map: Record<string, number>, n: number): { key: string; views: number }[] {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, views]) => ({ key, views }));
}

async function kv(): Promise<KVNamespaceLike | null> {
  if (kvHandle) return kvHandle;
  try {
    const handle = await resolveAnalyticsKV();
    kvHandle = handle?.kv || null;
    return kvHandle;
  } catch {
    return null;
  }
}

function parseRoll(raw: string | null): KvRoll {
  if (!raw) return emptyRoll();
  try {
    const parsed = JSON.parse(raw) as Partial<KvRoll>;
    return {
      views: Number(parsed.views) || 0,
      unique: Number(parsed.unique) || 0,
      peak: Number(parsed.peak) || 0,
      paths: parsed.paths && typeof parsed.paths === "object" ? parsed.paths : {},
      refs: parsed.refs && typeof parsed.refs === "object" ? parsed.refs : {},
      devices: parsed.devices && typeof parsed.devices === "object" ? parsed.devices : {},
    };
  } catch {
    return emptyRoll();
  }
}

async function flushRoll(force = false, every = FLUSH_MS): Promise<void> {
  if (!rollDirty || !rollMem) return;
  const now = Date.now();
  if (!force && now - lastFlush < every) return;
  const store = await kv();
  if (!store) return;
  lastFlush = now;
  rollDirty = false;
  await store.put(`${ROLL_PREFIX}${rollDay}`, JSON.stringify(rollMem), { expirationTtl: ROLL_TTL_SEC });
}

export async function kvCountOnline(): Promise<number> {
  const now = Date.now();
  if (countCache && now - countCache.at < COUNT_CACHE_MS) return countCache.n;
  try {
    const store = await kv();
    if (!store) return countCache?.n || 0;
    const listed = await store.list({ prefix: ONLINE_PREFIX, limit: 1000 });
    const n = listed.keys.length;
    countCache = { at: now, n };
    return n;
  } catch {
    return countCache?.n || 0;
  }
}

export async function kvReadRoll(day = dayKey()): Promise<KvRoll> {
  if (rollMem && rollDay === day) return rollMem;
  try {
    const store = await kv();
    if (!store) return emptyRoll();
    const raw = await store.get(`${ROLL_PREFIX}${day}`);
    const parsed = parseRoll(raw);
    if (day === dayKey()) {
      rollDay = day;
      rollMem = parsed;
    }
    return parsed;
  } catch {
    return emptyRoll();
  }
}

export async function kvReadHistory(days = 14): Promise<KvDayRow[]> {
  const now = Date.now();
  if (historyCache && now - historyCache.at < HISTORY_CACHE_MS) return historyCache.rows;
  const n = Math.min(14, Math.max(2, days));
  const store = await kv();
  if (!store) return historyCache?.rows || [];
  const keys = Array.from({ length: n }, (_, i) => dayKey(now - i * 86400_000));
  const raws = await Promise.all(keys.map((day) => store.get(`${ROLL_PREFIX}${day}`).catch(() => null)));
  const rows = keys.map((day, i) => {
    const roll = parseRoll(raws[i]);
    return { day, views: roll.views, unique: roll.unique, peak: roll.peak };
  });
  historyCache = { at: now, rows };
  return rows;
}

/** True when the D1 analytics binding is bound and its schema is ready (cached per isolate). */
async function d1Ready(): Promise<boolean> {
  try {
    return Boolean(await readyD1());
  } catch {
    return false;
  }
}

/**
 * Presence touch + roll bump. Returns true when it wrote the KV presence key online:<id>
 * (only when D1 is not available; with D1, presence is the analytics_sessions row).
 */
export async function kvTouchLive(input: {
  id: string;
  path?: string;
  ref?: string;
  device?: string;
  onlineGuess?: number;
  recordView?: boolean;
}): Promise<boolean> {
  const id = input.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  if (!id) return false;
  let wrote = false;
  try {
    const store = await kv();
    if (!store) return false;
    const now = Date.now();
    const day = dayKey(now);
    const viaD1 = await d1Ready();
    let onlineNow = Math.max(1, Number(input.onlineGuess) || 0);
    if (!viaD1) {
      await store.put(`${ONLINE_PREFIX}${id}`, "1", { expirationTtl: ONLINE_TTL_SEC });
      wrote = true;
      // Cached list() (45s) — avoids one KV list per heartbeat. Real peak is
      // recorded by touchOnline (Postgres sessions / KV daystats).
      onlineNow = Math.max(onlineNow, await kvCountOnline());
    }
    const flushEvery = viaD1 ? ROLL_FLUSH_D1_MS : FLUSH_MS;

    if (!rollMem || rollDay !== day) {
      // New WIB day: save what is still buffered for the previous day first (one write).
      if (rollMem && rollDay && rollDirty) await flushRoll(true).catch(() => undefined);
      rollDay = day;
      rollMem = parseRoll(await store.get(`${ROLL_PREFIX}${day}`));
    }
    // Peak tracks real concurrent users on every live touch (not only pageviews).
    if (onlineNow > rollMem.peak) {
      rollMem.peak = onlineNow;
      rollDirty = true;
    }

    if (input.recordView === false) {
      await flushRoll(false, flushEvery);
      return wrote;
    }

    rollMem.views += 1;
    if (input.path) {
      const pathKey = input.path.startsWith("/") ? input.path : `/${input.path}`;
      bumpMap(rollMem.paths, pathKey.split("?")[0] || "/");
    }
    if (input.ref) bumpMap(rollMem.refs, input.ref);
    if (input.device && input.device !== "bot") bumpMap(rollMem.devices, input.device);
    // Unique visitors are counted by recordHitKv (uv:<day>:<id>) — no second marker here.
    rollDirty = true;
    historyCache = null;
    await flushRoll(false, flushEvery);
  } catch {
    /* KV optional */
  }
  return wrote;
}

export function rollToStats(roll: KvRoll, online: number, history: KvDayRow[] = []) {
  const views7d = history.slice(0, 7).reduce((s, d) => s + d.views, 0) || roll.views;
  const yesterday = history[1];
  return {
    online,
    count: online,
    peakToday: Math.max(roll.peak, online),
    viewsToday: roll.views,
    views24h: roll.views,
    uniqueToday: roll.unique,
    views7d,
    yesterdayViews: yesterday?.views || 0,
    yesterdayUnique: yesterday?.unique || 0,
    days: history,
    topPaths: top(roll.paths, 12).map((r) => ({ path: r.key, views: r.views })),
    topRefs: top(roll.refs, 8).map((r) => ({ ref: r.key, views: r.views })),
    devices: top(roll.devices, 6).map((r) => ({
      device: r.key as "mobile" | "desktop" | "tablet" | "bot" | "other",
      views: r.views,
    })),
    // Caller (liveOwnerPayload) merges real persistOk/hint from getOwnerStats.
    persistOk: false,
    storage: "kv" as const,
    presence: "kv" as const,
    analytics: "operational" as const,
    hint: undefined as string | undefined,
  };
}
