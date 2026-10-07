import { createFileRoute } from "@tanstack/react-router";
import { resolveAnalyticsKV } from "@/lib/analytics-kv";
/**
 * Our own likes, stored in Cloudflare KV (ANALYTICS_KV binding) under `likes:v1:<id>`.
 * Kept separate from src/lib/catalog/video-stats.json (source stats refreshed by the
 * GitHub workflow), so the workflow can never overwrite these counts.
 */

const COUNT_PREFIX = "likes:v1:";
const GUARD_PREFIX = "likes:g1:";
/** Per IP+video guard: one like per visitor per video for a day. */
const GUARD_TTL_SEC = 24 * 3600;

function validLikeId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(id);
}

/**
 * KV is eventually consistent (a guard written a moment ago may not be readable yet),
 * so keep a per-isolate memory of recent guards and latest counts as well.
 */
const memGuard = new Map<string, { v: string; exp: number }>();
const memCount = new Map<string, number>();

function memGet(key: string): string | null {
  const hit = memGuard.get(key);
  if (!hit) return null;
  if (hit.exp < Date.now()) {
    memGuard.delete(key);
    return null;
  }
  return hit.v;
}

function memSet(key: string, v: string, ttlSec: number) {
  if (memGuard.size > 5000) memGuard.clear();
  memGuard.set(key, { v, exp: Date.now() + ttlSec * 1000 });
}

async function ipHash(ip: string, id: string): Promise<string> {
  const data = new TextEncoder().encode(`${ip}|${id}|kdp-like`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf).slice(0, 12))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function readLikes(id: string): Promise<number> {
  const h = await resolveAnalyticsKV().catch(() => null);
  if (!h) return 0;
  const raw = await h.kv.get(COUNT_PREFIX + id).catch(() => null);
  const n = Number(raw || 0);
  const kvN = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  return Math.max(kvN, memCount.get(id) ?? 0);
}

async function applyLike(
  id: string,
  ip: string,
  action: "like" | "unlike",
): Promise<{ count: number; liked: boolean; changed: boolean; storage: boolean }> {
  const h = await resolveAnalyticsKV().catch(() => null);
  if (!h) return { count: 0, liked: action === "like", changed: false, storage: false };
  const guardKey = GUARD_PREFIX + (await ipHash(ip || "0", id));
  const [rawCount, guard] = await Promise.all([
    h.kv.get(COUNT_PREFIX + id).catch(() => null),
    h.kv.get(guardKey).catch(() => null),
  ]);
  let count = Number(rawCount || 0);
  if (!Number.isFinite(count) || count < 0) count = 0;
  if (memCount.has(id)) count = memCount.get(id) as number;
  const mem = memGet(guardKey);
  const already = mem != null ? mem === "1" : guard === "1";
  if (action === "like") {
    if (already) return { count, liked: true, changed: false, storage: true };
    count += 1;
    memSet(guardKey, "1", GUARD_TTL_SEC);
    memCount.set(id, count);
    await h.kv.put(COUNT_PREFIX + id, String(count));
    await h.kv.put(guardKey, "1", { expirationTtl: GUARD_TTL_SEC });
    return { count, liked: true, changed: true, storage: true };
  }
  if (!already) return { count, liked: false, changed: false, storage: true };
  count = Math.max(0, count - 1);
  memSet(guardKey, "0", GUARD_TTL_SEC);
  memCount.set(id, count);
  await h.kv.put(COUNT_PREFIX + id, String(count));
  await h.kv.put(guardKey, "0", { expirationTtl: GUARD_TTL_SEC });
  return { count, liked: false, changed: true, storage: true };
}

const BOT_UA = /bot|crawl|spider|slurp|headless|curl\/|wget|python-requests|preview/i;

function clientIp(request: Request): string {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "0";
  // IPv6 phones rotate privacy addresses inside their /64 — guard on the /64 prefix.
  if (ip.includes(":")) return ip.split(":").slice(0, 4).join(":") + "::/64";
  return ip;
}

export const Route = createFileRoute("/api/like")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id");
        if (!validLikeId(id)) return Response.json({ ok: false, error: "bad id" }, { status: 400 });
        const count = await readLikes(id);
        return Response.json(
          { ok: true, id, count },
          { headers: { "cache-control": "public, max-age=15, s-maxage=15" } },
        );
      },
      POST: async ({ request }) => {
        let body: { id?: unknown; action?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }
        const id = body.id;
        if (!validLikeId(id)) return Response.json({ ok: false, error: "bad id" }, { status: 400 });
        const ua = request.headers.get("user-agent") || "";
        if (BOT_UA.test(ua) && !/Mozilla/.test(ua)) {
          return Response.json({ ok: false, error: "bot" }, { status: 403 });
        }
        const action = body.action === "unlike" ? "unlike" : "like";
        const res = await applyLike(id, clientIp(request), action);
        return Response.json({ ok: res.storage, id, ...res }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
