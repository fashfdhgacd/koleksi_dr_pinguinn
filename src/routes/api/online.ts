import { createFileRoute } from "@tanstack/react-router";
import {
  classifyDevice,
  getOwnerStats,
  recordHit,
  touchOnline,
} from "@/lib/owner-analytics";
import { kvCountOnline, kvReadRoll, kvTouchLive, rollToStats } from "@/lib/kv-live";
import { isOwnerKey, ownerKeyFrom, ownerSecret } from "@/lib/owner-auth";

const BOT_UA =
  /bot|crawl|spider|slurp|headless|webdriver|puppeteer|playwright|scrapy|httpclient|curl\/|wget|python-requests|axios\/|node-fetch|bytespider|gptbot|claudebot|ccbot|semrush|ahrefs|dataforseo|petalbot|facebookexternalhit|preview/i;

const lastTouch = new Map<string, number>();
/** Last recorded path per session — SPA nav within TOUCH_GAP still counts a pageview. */
const lastPathById = new Map<string, string>();
const ipHits = new Map<string, { n: number; t: number }>();
/** Rate-limit presence/heartbeat only; pageviews on path change bypass this. */
const TOUCH_GAP_MS = 120_000;
const IP_WINDOW_MS = 60_000;
const IP_MAX = 20;
const OWNER_CACHE_MS = 20_000;

let ownerCache: { at: number; data: Record<string, unknown> } | null = null;
/**
 * getOwnerStats scans 14–30 days of analytics_events in D1, so its result is also shared across
 * isolates in this data centre for SHARED_STATS_SEC via the Cache API. The key sits under
 * /api/owner…, which the worker entry never serves from cache, so it can't leak publicly.
 * Online count and peak are still recomputed from KV on every owner poll.
 */
const SHARED_STATS_SEC = 300;
const SHARED_STATS_PATH = "/api/owner-stats-cache-v1";

type OwnerStatsResult = Awaited<ReturnType<typeof getOwnerStats>>;

async function sharedOwnerStats(origin: string): Promise<OwnerStatsResult> {
  let cache: Cache | null = null;
  try {
    cache = (caches as unknown as { default?: Cache }).default || null;
  } catch {
    cache = null;
  }
  const key = new Request(`${origin}${SHARED_STATS_PATH}`);
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) return (await hit.json()) as OwnerStatsResult;
    } catch {
      /* fall through to a fresh read */
    }
  }
  const stats = await getOwnerStats();
  if (cache) {
    try {
      await cache.put(
        key,
        new Response(JSON.stringify(stats), {
          headers: { "content-type": "application/json", "cache-control": `public, max-age=${SHARED_STATS_SEC}` },
        }),
      );
    } catch {
      /* cache optional */
    }
  }
  return stats;
}

/** Owner key: header x-online-key or JSON body `key` only — never the URL query string. */
function extractKey(request: Request, bodyKey?: string): string {
  return ownerKeyFrom(request, bodyKey);
}

function allowOrigin(request: Request): string {
  const origin = request.headers.get("origin") || "";
  const host = (request.headers.get("host") || "").toLowerCase();
  if (/koleksidrpinguin\.(com|site)$/i.test(host)) {
    if (!origin) return `https://${host.split(":")[0]}`;
  }
  try {
    const h = new URL(origin).hostname.toLowerCase();
    if (h === "koleksidrpinguin.com" || h === "www.koleksidrpinguin.com" || h === "koleksidrpinguin.site") {
      return origin;
    }
  } catch {
    /* ignore */
  }
  return "https://koleksidrpinguin.com";
}

function json(request: Request, data: unknown, status = 200, presence?: "d1" | "kv"): Response {
  const headers: Record<string, string> = {
    "cache-control": "no-store",
    "access-control-allow-origin": allowOrigin(request),
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-online-key",
    vary: "Origin",
  };
  // Where this heartbeat's presence went (diagnostic only): "d1" = no KV write, "kv" = KV online:<id>.
  if (presence) headers["x-presence"] = presence;
  return Response.json(data, { status, headers });
}

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function tooMany(ip: string): boolean {
  const now = Date.now();
  const cur = ipHits.get(ip);
  if (!cur || now - cur.t > IP_WINDOW_MS) {
    ipHits.set(ip, { n: 1, t: now });
    return false;
  }
  cur.n += 1;
  return cur.n > IP_MAX;
}

function shouldSkipBot(ua: string, owner: boolean): boolean {
  if (owner) return false;
  if (!ua || ua.length < 12) return true;
  if (BOT_UA.test(ua)) return true;
  return classifyDevice(ua) === "bot";
}

async function liveOwnerPayload(origin: string) {
  const now = Date.now();
  if (ownerCache && now - ownerCache.at < OWNER_CACHE_MS) return ownerCache.data;
  // Single source of truth: getOwnerStats builds days[] (Postgres events, or KV
  // daystats when DB is down) and derives today/yesterday/7d cards from it.
  const stats = await sharedOwnerStats(origin);
  const [kvN, roll] = await Promise.all([kvCountOnline(), kvReadRoll()]);
  const online = Math.max(Number(stats.online) || 0, Number(stats.count) || 0, kvN);
  const live = rollToStats(roll, online);
  const peakToday = Math.max(Number(stats.peakToday) || 0, online);
  const days = stats.days.length
    ? [{ ...stats.days[0], peak: Math.max(stats.days[0].peak, peakToday) }, ...stats.days.slice(1)]
    : stats.days;
  const data = {
    ...stats,
    online,
    count: online,
    peakToday,
    days,
    // Top lists: Postgres (today WIB) first; KV roll only as fallback.
    topPaths: stats.topPaths.length ? stats.topPaths : live.topPaths,
    topRefs: stats.topRefs.length ? stats.topRefs : live.topRefs,
    devices: stats.devices.length ? stats.devices : live.devices,
    presence: stats.presence === "memory" && kvN > 0 ? "kv" : stats.presence,
    // Surface real PG/KV persist status — do not hardcode healthy.
    persistOk: Boolean(stats.persistOk),
    analytics: stats.analytics || "operational",
    database: stats.database,
    hint: stats.hint,
  };
  ownerCache = { at: now, data };
  return data;
}

async function handlePost(request: Request): Promise<Response> {
  let id = "";
  let bodyKey = "";
  let path = "";
  let ref = "";
  let host = "";
  let eventId = "";
  try {
    const body = (await request.json()) as {
      id?: string;
      key?: string;
      path?: string;
      ref?: string;
      host?: string;
      eventId?: string;
    };
    id = typeof body?.id === "string" ? body.id.trim().slice(0, 64) : "";
    bodyKey = typeof body?.key === "string" ? body.key : "";
    path = typeof body?.path === "string" ? body.path : "";
    ref = typeof body?.ref === "string" ? body.ref : "";
    host = typeof body?.host === "string" ? body.host : "";
    eventId = typeof body?.eventId === "string" ? body.eventId : "";
  } catch {
    return json(request, { ok: true, skipped: "bad_json" });
  }
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return json(request, { ok: true, skipped: "bad_id" });
  }

  const owner = await isOwnerKey(extractKey(request, bodyKey));
  const ua = request.headers.get("user-agent") || "";
  if (shouldSkipBot(ua, owner)) {
    return json(request, { ok: true, skipped: "bot" });
  }
  if (!owner && tooMany(clientIp(request))) {
    return json(request, { ok: true, skipped: "rate" });
  }

  const now = Date.now();
  const prev = lastTouch.get(id) || 0;
  const fresh = now - prev >= TOUCH_GAP_MS;
  const normPath = path
    ? (path.startsWith("/") ? path : `/${path}`).split("?")[0].slice(0, 200) || "/"
    : "";
  const prevPath = lastPathById.get(id) || "";
  const pathChanged = Boolean(normPath) && normPath !== prevPath;
  // Presence/heartbeat: rate-limited. Pageview: still count on SPA path change.
  const shouldTouchPresence = fresh || owner;
  const shouldRecordView = Boolean(normPath) && (fresh || pathChanged || owner);

  if (fresh) lastTouch.set(id, now);
  if (normPath) lastPathById.set(id, normPath);

  let presence: "d1" | "kv" | undefined;
  if (shouldTouchPresence || shouldRecordView) {
    try {
      const device = classifyDevice(ua);
      const wroteKv = await kvTouchLive({
        id,
        path: normPath || undefined,
        ref: ref || undefined,
        device,
        recordView: shouldRecordView,
      });
      presence = wroteKv ? "kv" : "d1";
      if (shouldRecordView) {
        await recordHit({
          path: normPath,
          ref: ref || request.headers.get("referer") || "",
          ua,
          host: host || request.headers.get("host") || "",
          sessionId: id,
          visitorId: id,
          eventId,
          country: request.headers.get("cf-ipcountry") || "",
        });
      }
      // PG presence + peak for every presence touch and every pageview (SPA nav).
      // Awaited: Workers cancel un-awaited promises after the response is sent.
      // skipKv: kvTouchLive already wrote online:<id> this request (only when D1 is unavailable;
      // touchOnline writes it itself if a D1 call fails).
      if (shouldTouchPresence || shouldRecordView) {
        await touchOnline(id, { skipKv: wroteKv });
      }
    } catch {
      return json(request, { ok: true, skipped: "busy" });
    }
  }

  if (!owner) return json(request, { ok: true }, 200, presence);
  try {
    return json(request, { ok: true, owner: true, ...(await liveOwnerPayload(new URL(request.url).origin)) });
  } catch {
    return json(request, { ok: true, owner: true, online: 0 });
  }
}

async function handleGet(request: Request): Promise<Response> {
  const secret = ownerSecret();
  if (!secret) {
    return json(request, {
      ok: false,
      error: "not_configured",
      hint: "Set ONLINE_VIEW_SECRET di Cloudflare (domain .com) lalu redeploy.",
    });
  }
  if (!(await isOwnerKey(extractKey(request)))) {
    return json(request, { ok: false, error: "forbidden" }, 403);
  }
  try {
    return json(request, { ok: true, owner: true, ...(await liveOwnerPayload(new URL(request.url).origin)) });
  } catch {
    return json(request, { ok: true, owner: true, online: 0, hint: "Statistik sibuk, coba lagi." });
  }
}

async function safe(request: Request, fn: (request: Request) => Promise<Response>): Promise<Response> {
  try {
    return await fn(request);
  } catch {
    return json(request, { ok: true, skipped: "error" });
  }
}

export const Route = createFileRoute("/api/online")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": allowOrigin(request),
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-headers": "content-type, x-online-key",
          },
        }),
      GET: async ({ request }) => safe(request, handleGet),
      POST: async ({ request }) => safe(request, handlePost),
    },
  },
});
