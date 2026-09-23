/**
 * Owner analytics — in-memory per isolate (Cloudflare/Vercel).
 * Cukup untuk dashboard live; reset saat isolate dingin.
 */

export type DeviceKind = "mobile" | "desktop" | "tablet" | "bot" | "other";

export type PageHit = {
  path: string;
  ref: string;
  device: DeviceKind;
  host: string;
  ts: number;
};

type AnalyticsState = {
  online: Map<string, number>;
  hits: PageHit[];
  peakToday: number;
  peakDay: string; // YYYY-MM-DD UTC+7 approx via local ISO date slice
  hourly: Map<string, number>; // key: YYYY-MM-DD-HH
  lastTelegramAlertAt: number;
  lastTelegramPeak: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __drPinguinAnalytics: AnalyticsState | undefined;
}

const ONLINE_TTL_MS = 45_000;
const HIT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_HITS = 8_000;

function dayKey(ts = Date.now()): string {
  // WIB = UTC+7
  return new Date(ts + 7 * 3600_000).toISOString().slice(0, 10);
}

function hourKey(ts = Date.now()): string {
  return new Date(ts + 7 * 3600_000).toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

function state(): AnalyticsState {
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

function pruneOnline(now: number) {
  const s = state();
  for (const [id, ts] of s.online) {
    if (now - ts > ONLINE_TTL_MS) s.online.delete(id);
  }
}

function pruneHits(now: number) {
  const s = state();
  const cutoff = now - HIT_TTL_MS;
  s.hits = s.hits.filter((h) => h.ts >= cutoff);
  if (s.hits.length > MAX_HITS) {
    s.hits = s.hits.slice(s.hits.length - MAX_HITS);
  }
  // hourly keys older than 48h
  for (const k of s.hourly.keys()) {
    const t = Date.parse(k + ":00:00+07:00");
    if (!Number.isNaN(t) && now - t > 48 * 3600_000) s.hourly.delete(k);
  }
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
  // drop query
  const q = p.indexOf("?");
  if (q >= 0) p = p.slice(0, q);
  return p || "/";
}

function normalizeRef(ref: string): string {
  const r = (ref || "").trim().slice(0, 200);
  if (!r) return "(direct)";
  try {
    const u = new URL(r);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return r.slice(0, 80) || "(direct)";
  }
}

export function touchOnline(id: string): number {
  const now = Date.now();
  const s = state();
  s.online.set(id, now);
  pruneOnline(now);
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

export function countOnline(): number {
  const now = Date.now();
  pruneOnline(now);
  return state().online.size;
}

export function recordHit(input: {
  path: string;
  ref?: string;
  ua?: string;
  host?: string;
}): void {
  const now = Date.now();
  const s = state();
  const hit: PageHit = {
    path: normalizePath(input.path),
    ref: normalizeRef(input.ref || ""),
    device: classifyDevice(input.ua || ""),
    host: (input.host || "").replace(/^www\./, "").slice(0, 80) || "(unknown)",
    ts: now,
  };
  s.hits.push(hit);
  const hk = hourKey(now);
  s.hourly.set(hk, (s.hourly.get(hk) || 0) + 1);
  pruneHits(now);
}

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
};

function topN(map: Map<string, number>, n: number): { key: string; views: number }[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, views]) => ({ key, views }));
}

export function getOwnerStats(): OwnerStats {
  const now = Date.now();
  pruneOnline(now);
  pruneHits(now);
  const s = state();
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

  // last 24 hours buckets
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
  };
}

/** Optional Telegram alert when online crosses threshold. */
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

  const s = state();
  const now = Date.now();
  // cooldown 30 menit, atau peak baru lebih tinggi
  if (now - s.lastTelegramAlertAt < 30 * 60_000 && online <= s.lastTelegramPeak) return;

  s.lastTelegramAlertAt = now;
  s.lastTelegramPeak = online;

  const text = `🟢 Dr. Pinguin online: *${online}* (threshold ${threshold})\nPeak hari ini: ${s.peakToday}`;
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
    // silent
  }
}
