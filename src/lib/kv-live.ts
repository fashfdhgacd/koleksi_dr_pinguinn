/** Live visitors + daily rollup on Cloudflare KV. No Postgres required. */

import { resolveAnalyticsKV } from "@/lib/analytics-kv";

const ONLINE_PREFIX = "online:";
const ROLL_PREFIX = "roll:";
const UNIQ_PREFIX = "uniq:";
const ONLINE_TTL_SEC = 150;
const ROLL_TTL_SEC = 172800;

export type KvRoll = {
  views: number;
  unique: number;
  peak: number;
  paths: Record<string, number>;
  refs: Record<string, number>;
  devices: Record<string, number>;
};

function dayKey(ts = Date.now()): string {
  return new Date(ts + 7 * 3600_000).toISOString().slice(0, 10);
}

function emptyRoll(): KvRoll {
  return { views: 0, unique: 0, peak: 0, paths: {}, refs: {}, devices: {} };
}

function bumpMap(map: Record<string, number>, key: string, cap = 40): void {
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

export async function kvCountOnline(): Promise<number> {
  try {
    const handle = await resolveAnalyticsKV();
    if (!handle?.kv) return 0;
    let cursor: string | undefined;
    let total = 0;
    for (let page = 0; page < 8; page++) {
      const listed = await handle.kv.list({
        prefix: ONLINE_PREFIX,
        limit: 1000,
        cursor,
      });
      total += listed.keys.length;
      if (listed.list_complete) break;
      cursor = listed.cursor;
      if (!cursor) break;
    }
    return total;
  } catch {
    return 0;
  }
}

export async function kvReadRoll(day = dayKey()): Promise<KvRoll> {
  try {
    const handle = await resolveAnalyticsKV();
    if (!handle?.kv) return emptyRoll();
    const raw = await handle.kv.get(`${ROLL_PREFIX}${day}`);
    if (!raw) return emptyRoll();
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
    const handle = await resolveAnalyticsKV();
    if (!handle?.kv) return;
    const now = Date.now();
    const day = dayKey(now);
    await handle.kv.put(`${ONLINE_PREFIX}${id}`, String(now), { expirationTtl: ONLINE_TTL_SEC });

    if (input.recordView === false) {
      const roll = await kvReadRoll(day);
      const peak = Math.max(roll.peak, input.onlineGuess || 0);
      if (peak > roll.peak) {
        roll.peak = peak;
        await handle.kv.put(`${ROLL_PREFIX}${day}`, JSON.stringify(roll), { expirationTtl: ROLL_TTL_SEC });
      }
      return;
    }

    const uniqKey = `${UNIQ_PREFIX}${day}:${id}`;
    const seen = await handle.kv.get(uniqKey);
    if (!seen) {
      await handle.kv.put(uniqKey, "1", { expirationTtl: ROLL_TTL_SEC });
    }

    const roll = await kvReadRoll(day);
    roll.views += 1;
    if (!seen) roll.unique += 1;
    roll.peak = Math.max(roll.peak, input.onlineGuess || 0, 1);
    if (input.path) {
      const p = input.path.startsWith("/") ? input.path : `/${input.path}`;
      bumpMap(roll.paths, p.split("?")[0] || "/");
    }
    if (input.ref) bumpMap(roll.refs, input.ref);
    if (input.device && input.device !== "bot") bumpMap(roll.devices, input.device);
    await handle.kv.put(`${ROLL_PREFIX}${day}`, JSON.stringify(roll), { expirationTtl: ROLL_TTL_SEC });
  } catch {
    /* KV optional */
  }
}

export function rollToStats(roll: KvRoll, online: number) {
  return {
    online,
    count: online,
    peakToday: Math.max(roll.peak, online),
    viewsToday: roll.views,
    views24h: roll.views,
    uniqueToday: roll.unique,
    views7d: roll.views,
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
