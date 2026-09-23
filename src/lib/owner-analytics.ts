/**
 * Owner analytics — Cloudflare KV (global) + in-memory fallback (Vercel / dev).
 * Binding name: ANALYTICS_KV → namespace dr-pinguin-analytics
 */

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
  peakToday: number;
  peakDay: string;
  views24h: number;
  hourly: { hour: string; views: number }[];
  topPaths: { path: string; views: number }[];
  topRefs: { ref: string; views: number }[];
  devices: { device: DeviceKind; views: number }[];
  hosts: { host: string; views: number }[];
  storage: "kv" | "memory";
};

type KVNamespaceLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
};

type MemState = {
  online: Map<string, number>;
  hits: PageHit[];
  peakToday: number;
  peakDay: string;
  hourly: Map<string, number>;
  lastTelegramAlertAt: number;
  lastTelegramPeak: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __drPinguinAnalytics: MemState | undefined;
}

const ONLINE_TTL_SEC = 60;
const ONLINE_TTL_MS = ONLINE_TTL_SEC * 1000;
const HIT_TTL_SEC = 24 * 60 * 60;
const HIT_TTL_MS = HIT_TTL_SEC * 1000;
const MAX_HITS_MEM = 8_000;

function dayKey(ts = Date.now()): string {
  return new Date(ts + 7 * 3600_000).toISOString().slice(0, 10);
}

function hourKey(ts = Date.now()): string {
  return new Date(ts + 7 * 3600_000).toISOString().slice(0, 13);
}

function mem(): MemState {
  if (!globalThis.__drPinguinAnalytics) {
    globalThis.__drPinguinAnalytics = {
      online: new Map(),
      hits: [],
      peakToday: 0,
      peakDay: dayKey(),
      hourly: new Map(),
      lastTelegramAlertAt: 0,
      lastTelegramPeak: 0,
    };
  }
  return globalThis.__drPinguinAnalytics;
}

/** Resolve Cloudflare KV binding ANALYTICS_KV (or hyphenated alias). */
export async function getKV(): Promise<KVNamespaceLike | null> {
  try {
    // Official Workers module (CF runtime)
    const mod = (await import("cloudflare:workers")) as {
      env?: Record<string, KVNamespaceLike | undefined>;
    };
    const env = mod.env;
    if (env?.ANALYTICS_KV) return env.ANALYTICS_KV;
    if (env?.["dr-pinguin-analytics"]) return env["dr-pinguin-analytics"] as KVNamespaceLike;
  } catch {
    /* not on CF module workers */
  }
  try {
    // Some Nitro / adapter paths attach env here
    const g = globalThis as unknown as {
      ANALYTICS_KV?: KVNamespaceLike;
      env?: Record<string, KVNamespaceLike | undefined>;
    };
    if (g.ANALYTICS_KV) return g.ANALYTICS_KV;
    if (g.env?.ANALYTICS_KV) return g.env.ANALYTICS_KV;
  } catch {
    /* ignore */
  }
  return null;
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

function normalizePath(path: string): string {
  let p = (path || "/").trim().slice(0, 200);
  if (!p.startsWith("/")) p = "/" + p;
  const q = p.indexOf("?");
  if (q >= 0) p = p.slice(0, q);
  return p || "/";
}

function normalizeRef(ref: string): string {
  const r = (ref || "").trim().slice(0, 200);
  if (!r) return "(direct)";
  try {
    return new URL(r).hostname.replace(/^www\./, "");
  } catch {
    return r.slice(0, 80) || "(direct)";
  }
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

async function listAll(
  kv: KVNamespaceLike,
  prefix: string,
  limit = 1000,
): Promise<string[]> {
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix, limit: Math.min(1000, limit - names.length), cursor });
    for (const k of page.keys) names.push(k.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && names.length < limit);
  return names;
}

async function bumpPeak(kv: KVNamespaceLike, count: number): Promise<void> {
  const dk = dayKey();
  const key = `peak:${dk}`;
  const cur = Number((await kv.get(key)) || "0") || 0;
  if (count > cur) {
    await kv.put(key, String(count), { expirationTtl: 48 * 3600 });
  }
}

export async function touchOnline(id: string): Promise<number> {
  const sid = safeId(id);
  if (!sid) return 0;
  const now = Date.now();
  const kv = await getKV();

  if (kv) {
    await kv.put(`online:${sid}`, String(now), { expirationTtl: ONLINE_TTL_SEC });
    const keys = await listAll(kv, "online:", 2000);
    const count = keys.length;
    await bumpPeak(kv, count);
    return count;
  }

  // memory fallback
  const s = mem();
  s.online.set(sid, now);
  for (const [k, ts] of s.online) {
    if (now - ts > ONLINE_TTL_MS) s.online.delete(k);
  }
  const count = s.online.size;
  const dk = dayKey(now);
  if (s.peakDay !== dk) {
    s.peakDay = dk;
    s.peakToday = count;
  } else if (count > s.peakToday) {
    s.peakToday = count;
  }
  return count;
}

export async function countOnline(): Promise<number> {
  const kv = await getKV();
  if (kv) {
    const keys = await listAll(kv, "online:", 2000);
    return keys.length;
  }
  const now = Date.now();
  const s = mem();
  for (const [k, ts] of s.online) {
    if (now - ts > ONLINE_TTL_MS) s.online.delete(k);
  }
  return s.online.size;
}

export async function recordHit(input: {
  path: string;
  ref?: string;
  ua?: string;
  host?: string;
}): Promise<void> {
  const now = Date.now();
  const hit: PageHit = {
    path: normalizePath(input.path),
    ref: normalizeRef(input.ref || ""),
    device: classifyDevice(input.ua || ""),
    host: (input.host || "").replace(/^www\./, "").slice(0, 80) || "(unknown)",
    ts: now,
  };

  const kv = await getKV();
  if (kv) {
    const rand = Math.random().toString(36).slice(2, 8);
    await kv.put(`hit:${now}:${rand}`, JSON.stringify(hit), {
      expirationTtl: HIT_TTL_SEC,
    });
    // hourly counter
    const hk = `hour:${hourKey(now)}`;
    const prev = Number((await kv.get(hk)) || "0") || 0;
    await kv.put(hk, String(prev + 1), { expirationTtl: 48 * 3600 });
    return;
  }

  const s = mem();
  s.hits.push(hit);
  const cutoff = now - HIT_TTL_MS;
  s.hits = s.hits.filter((h) => h.ts >= cutoff);
  if (s.hits.length > MAX_HITS_MEM) s.hits = s.hits.slice(-MAX_HITS_MEM);
  const hk = hourKey(now);
  s.hourly.set(hk, (s.hourly.get(hk) || 0) + 1);
}

function topN(map: Map<string, number>, n: number) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, views]) => ({ key, views }));
}

export async function getOwnerStats(): Promise<OwnerStats> {
  const now = Date.now();
  const kv = await getKV();

  if (kv) {
    const onlineKeys = await listAll(kv, "online:", 2000);
    const online = onlineKeys.length;

    const dk = dayKey(now);
    const peakToday = Number((await kv.get(`peak:${dk}`)) || "0") || 0;

    const hitKeys = await listAll(kv, "hit:", 3000);
    const pathMap = new Map<string, number>();
    const refMap = new Map<string, number>();
    const deviceMap = new Map<DeviceKind, number>();
    const hostMap = new Map<string, number>();
    let views24h = 0;

    // sample up to 500 hits for top lists (KV get is per-key)
    const sample = hitKeys.slice(-500);
    for (const name of sample) {
      try {
        const raw = await kv.get(name);
        if (!raw) continue;
        const h = JSON.parse(raw) as PageHit;
        if (!h?.path || now - (h.ts || 0) > HIT_TTL_MS) continue;
        views24h++;
        pathMap.set(h.path, (pathMap.get(h.path) || 0) + 1);
        refMap.set(h.ref || "(direct)", (refMap.get(h.ref || "(direct)") || 0) + 1);
        deviceMap.set(h.device || "other", (deviceMap.get(h.device || "other") || 0) + 1);
        hostMap.set(h.host || "(unknown)", (hostMap.get(h.host || "(unknown)") || 0) + 1);
      } catch {
        /* skip bad */
      }
    }
    // better views24h from key count if larger
    if (hitKeys.length > views24h) views24h = hitKeys.length;

    const hourly: { hour: string; views: number }[] = [];
    for (let i = 23; i >= 0; i--) {
      const t = now - i * 3600_000;
      const k = hourKey(t);
      const label = new Date(t + 7 * 3600_000).toISOString().slice(11, 13) + ":00";
      const views = Number((await kv.get(`hour:${k}`)) || "0") || 0;
      hourly.push({ hour: label, views });
    }

    return {
      online,
      peakToday,
      peakDay: dk,
      views24h,
      hourly,
      topPaths: topN(pathMap, 15).map(({ key, views }) => ({ path: key, views })),
      topRefs: topN(refMap, 12).map(({ key, views }) => ({ ref: key, views })),
      devices: (["mobile", "desktop", "tablet", "bot", "other"] as DeviceKind[])
        .map((device) => ({ device, views: deviceMap.get(device) || 0 }))
        .filter((d) => d.views > 0),
      hosts: topN(hostMap, 6).map(({ key, views }) => ({ host: key, views })),
      storage: "kv",
    };
  }

  // memory
  const s = mem();
  for (const [k, ts] of s.online) {
    if (now - ts > ONLINE_TTL_MS) s.online.delete(k);
  }
  const cutoff = now - HIT_TTL_MS;
  const recent = s.hits.filter((h) => h.ts >= cutoff);
  const pathMap = new Map<string, number>();
  const refMap = new Map<string, number>();
  const deviceMap = new Map<DeviceKind, number>();
  const hostMap = new Map<string, number>();
  for (const h of recent) {
    pathMap.set(h.path, (pathMap.get(h.path) || 0) + 1);
    refMap.set(h.ref, (refMap.get(h.ref) || 0) + 1);
    deviceMap.set(h.device, (deviceMap.get(h.device) || 0) + 1);
    hostMap.set(h.host, (hostMap.get(h.host) || 0) + 1);
  }
  const hourly: { hour: string; views: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const t = now - i * 3600_000;
    const k = hourKey(t);
    const label = new Date(t + 7 * 3600_000).toISOString().slice(11, 13) + ":00";
    hourly.push({ hour: label, views: s.hourly.get(k) || 0 });
  }

  return {
    online: s.online.size,
    peakToday: s.peakDay === dayKey(now) ? s.peakToday : 0,
    peakDay: s.peakDay,
    views24h: recent.length,
    hourly,
    topPaths: topN(pathMap, 15).map(({ key, views }) => ({ path: key, views })),
    topRefs: topN(refMap, 12).map(({ key, views }) => ({ ref: key, views })),
    devices: (["mobile", "desktop", "tablet", "bot", "other"] as DeviceKind[])
      .map((device) => ({ device, views: deviceMap.get(device) || 0 }))
      .filter((d) => d.views > 0),
    hosts: topN(hostMap, 6).map(({ key, views }) => ({ host: key, views })),
    storage: "memory",
  };
}

export async function maybeTelegramAlert(online: number): Promise<void> {
  const threshold = Number(process.env.ONLINE_ALERT_THRESHOLD || "0");
  if (!threshold || online < threshold) return;

  const token = (process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chat =
    process.env.ONLINE_ALERT_CHAT_ID ||
    process.env.TELEGRAM_USER_ID ||
    process.env.TELEGRAM_ADMIN_ID ||
    "";
  if (!token || !chat) return;

  const s = mem();
  const now = Date.now();
  if (now - s.lastTelegramAlertAt < 30 * 60_000 && online <= s.lastTelegramPeak) return;
  s.lastTelegramAlertAt = now;
  s.lastTelegramPeak = online;

  const text = `🟢 Dr. Pinguin online: *${online}* (threshold ${threshold})`;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* silent */
  }
}
