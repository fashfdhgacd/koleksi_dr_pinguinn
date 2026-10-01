/** Live visitors + daily rollup. Sedikit panggilan KV per request. */

import { resolveAnalyticsKV, type KVNamespaceLike } from "@/lib/analytics-kv";

const ONLINE_PREFIX = "online:";
const ROLL_PREFIX = "roll:";
const UNIQ_PREFIX = "uniq:";
const ONLINE_TTL_SEC = 150;
const ROLL_TTL_SEC = 90 * 24 * 3600;
const FLUSH_MS = 20_000;
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

async function flushRoll(force = false): Promise<void> {
  if (!rollDirty || !rollMem) return;
  const now = Date.now();
  if (!force && now - lastFlush < FLUSH_MS) return;
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

export async function kvTouchLive(input: {
  id: string;
  path?: string;
  ref?: string;
  device?: string;
  onlineGuess?: number;
  recordView?: boolean;
}): Promise<void> {
  const id = input.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  if (!id) return;
  try {
    const store = await kv();
    if (!store) return;
    const now = Date.now();
    const day = dayKey(now);
    await store.put(`${ONLINE_PREFIX}${id}`, "1", { expirationTtl: ONLINE_TTL_SEC });
    if (countCache) countCache = null;

    if (input.recordView === false) {
      await flushRoll(false);
      return;
    }

    if (!rollMem || rollDay !== day) {
      rollDay = day;
      rollMem = parseRoll(await store.get(`${ROLL_PREFIX}${day}`));
    }
    rollMem.views += 1;
    rollMem.peak = Math.max(rollMem.peak, input.onlineGuess || 0, 1);
    if (input.path) {
      const p = input.path.startsWith("/") ? input.path : `/${input.path}`;
      bumpMap(rollMem.paths, p.split("?")[0] || "/");
    }
    if (input.ref) bumpMap(rollMem.refs, input.ref);
    if (input.device && input.device !== "bot") bumpMap(rollMem.devices, input.device);

    const uniqKey = `${UNIQ_PREFIX}${day}:${id}`;
    const seen = await store.get(uniqKey);
    if (!seen) {
      rollMem.unique += 1;
      await store.put(uniqKey, "1", { expirationTtl: 36 * 3600 });
    }
    rollDirty = true;
    historyCache = null;
    await flushRoll(false);
  } catch {
    /* KV optional */
  }
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
    persistOk: true,
    storage: "kv" as const,
    presence: "kv" as const,
    analytics: "operational" as const,
    hint: undefined as string | undefined,
  };
}
