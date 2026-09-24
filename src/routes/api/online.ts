import { createFileRoute } from "@tanstack/react-router";
import {
  classifyDevice,
  getOwnerStats,
  maybeTelegramAlert,
  recordHit,
  touchOnline,
} from "@/lib/owner-analytics";

const BOT_UA =
  /bot|crawl|spider|slurp|headless|webdriver|puppeteer|playwright|scrapy|httpclient|curl\/|wget|python-requests|axios\/|node-fetch|bytespider|gptbot|claudebot|ccbot|semrush|ahrefs|dataforseo|petalbot|facebookexternalhit|preview/i;

const lastTouch = new Map<string, number>();
const ipHits = new Map<string, { n: number; t: number }>();
const TOUCH_GAP_MS = 20_000;
const IP_WINDOW_MS = 60_000;
const IP_MAX = 30;

function viewSecret(): string {
  const a = (process.env.ONLINE_VIEW_SECRET || "").trim();
  if (a) return a;
  return (process.env.OWNER_SECRET || process.env.PEMILIK_SECRET || "").trim();
}

function isOwnerKey(key: string | null | undefined): boolean {
  const secret = viewSecret();
  if (!secret || !key) return false;
  return key.trim() === secret;
}

function extractKey(request: Request, bodyKey?: string): string {
  const header = request.headers.get("x-online-key") || "";
  if (header) return header;
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("key") || url.searchParams.get("k") || "";
    if (q) return q;
  } catch {
    /* ignore */
  }
  return bodyKey || "";
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

function json(request: Request, data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "access-control-allow-origin": allowOrigin(request),
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, x-online-key",
      vary: "Origin",
    },
  });
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
    return json(request, { ok: false, error: "bad_json" }, 400);
  }
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return json(request, { ok: false, error: "bad_id" }, 400);
  }

  const owner = isOwnerKey(extractKey(request, bodyKey));
  const ua = request.headers.get("user-agent") || "";
  if (shouldSkipBot(ua, owner)) {
    return json(request, { ok: true, skipped: "bot" });
  }
  if (!owner && tooMany(clientIp(request))) {
    return json(request, { ok: true, skipped: "rate" }, 429);
  }

  const now = Date.now();
  const prev = lastTouch.get(id) || 0;
  const fresh = now - prev >= TOUCH_GAP_MS;
  if (fresh) lastTouch.set(id, now);

  let count = 0;
  if (fresh || owner) {
    count = await touchOnline(id);
    if (path) {
      await recordHit({
        path,
        ref: ref || request.headers.get("referer") || "",
        ua,
        host: host || request.headers.get("host") || "",
        sessionId: id,
        visitorId: id,
        eventId,
      });
    }
    void maybeTelegramAlert(count);
  }

  if (!owner) return json(request, { ok: true });
  return json(request, { ok: true, owner: true, ...(await getOwnerStats()) });
}

async function handleGet(request: Request): Promise<Response> {
  const secret = viewSecret();
  if (!secret) {
    return json(
      request,
      {
        ok: false,
        error: "not_configured",
        hint: "Set ONLINE_VIEW_SECRET di Cloudflare (domain .com) lalu redeploy.",
      },
      503,
    );
  }
  if (!isOwnerKey(extractKey(request))) {
    return json(request, { ok: false, error: "forbidden" }, 403);
  }
  return json(request, { ok: true, owner: true, ...(await getOwnerStats()) });
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
      GET: async ({ request }) => handleGet(request),
      POST: async ({ request }) => handlePost(request),
    },
  },
});
