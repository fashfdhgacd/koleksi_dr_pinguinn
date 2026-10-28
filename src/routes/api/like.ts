import { createFileRoute } from "@tanstack/react-router";
import { getD1, type D1DatabaseLike } from "@/lib/analytics-d1";
import { getDetail } from "@/lib/catalog/local";
import { publicIdBeforeBuild } from "@/lib/catalog/local-cache";

/**
 * Our own likes, stored in Cloudflare D1 (binding ANALYTICS_DB) for exact counts:
 *  - video_likes:       one row per video, atomic UPSERT n = n + 1
 *  - video_like_guard:  unique (id, visitor, day) row = one like per visitor per video per day
 *    (rows older than 32 days are deleted opportunistically, at most once per 6 h per isolate).
 *    The same rows double as the dated like log for the "Minggu ini" / "Bulan ini" tabs of
 *    /kategori/paling-disukai (sum(liked) per id since a day; see ranking-list.ts), so no extra writes.
 * Only ids of videos that are actually public in the catalog can be liked (no rows for made-up ids),
 * and storage errors are never echoed to the client.
 * Kept separate from src/lib/catalog/video-stats.json (source stats refreshed by the GitHub
 * workflow), so the workflow can never overwrite these counts.
 */

const SCHEMA = [
  `create table if not exists video_likes (
     id text primary key,
     n integer not null default 0,
     updated_at integer not null
   )`,
  `create table if not exists video_like_guard (
     id text not null,
     visitor text not null,
     day text not null,
     liked integer not null default 1,
     created_at integer not null,
     primary key (id, visitor, day)
   )`,
  `create index if not exists video_like_guard_created on video_like_guard (created_at)`,
  `create index if not exists video_like_guard_day on video_like_guard (day)`,
];

const BOT_UA = /bot|crawl|spider|slurp|headless|curl\/|wget|python-requests|preview/i;

const g = globalThis as typeof globalThis & { __likesSchema__?: Promise<void> };

async function likesDb(): Promise<D1DatabaseLike | null> {
  const db = await getD1().catch(() => null);
  if (!db) return null;
  g.__likesSchema__ ??= db
    .batch(SCHEMA.map((s) => db.prepare(s)))
    .then(() => undefined)
    .catch((err) => {
      g.__likesSchema__ = undefined;
      throw err;
    });
  await g.__likesSchema__;
  return db;
}

function validLikeId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(id);
}

/** Small per-isolate memo of catalog lookups (public video ids only). */
const knownIds = new Map<string, { ok: boolean; at: number }>();
const KNOWN_TTL_MS = 10 * 60_000;
const KNOWN_MAX = 5000;

/** True when the id is a public (not hidden) video in the catalog. */
async function isLikeableId(id: string): Promise<boolean> {
  const now = Date.now();
  const hit = knownIds.get(id);
  if (hit && now - hit.at < KNOWN_TTL_MS) return hit.ok;
  let ok = false;
  try {
    // Fresh isolate: check the one id without building the catalog (same answer as getDetail).
    const early = await publicIdBeforeBuild(id);
    if (early !== null) ok = early;
    else {
      await getDetail(id);
      ok = true;
    }
  } catch {
    ok = false;
  }
  if (knownIds.size >= KNOWN_MAX) knownIds.clear();
  knownIds.set(id, { ok, at: now });
  return ok;
}

const GUARD_KEEP_MS = 32 * 24 * 3600_000;
const CLEANUP_EVERY_MS = 6 * 3600_000;
let lastCleanup = 0;

/** Delete like-guard rows older than 32 days (kept that long for the week/month like rankings). */
async function cleanupGuard(db: D1DatabaseLike): Promise<void> {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_EVERY_MS) return;
  lastCleanup = now;
  try {
    await db.prepare("delete from video_like_guard where created_at < ?").bind(now - GUARD_KEEP_MS).run();
  } catch {
    /* best effort */
  }
}

function clientIp(request: Request): string {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "0";
  // IPv6 phones rotate privacy addresses inside their /64 — guard on the /64 prefix.
  if (ip.includes(":")) return ip.split(":").slice(0, 4).join(":") + "::/64";
  return ip;
}

async function visitorHash(ip: string, id: string): Promise<string> {
  const data = new TextEncoder().encode(`${ip}|${id}|kdp-like`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf).slice(0, 12))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function wibDay(ts = Date.now()): string {
  return new Date(ts + 7 * 3600_000).toISOString().slice(0, 10);
}

function changes(res: unknown): number {
  const meta = (res as { meta?: { changes?: number } } | null)?.meta;
  return Number(meta?.changes || 0);
}

async function readCount(db: D1DatabaseLike, id: string): Promise<number> {
  const row = await db.prepare("select n from video_likes where id = ?").bind(id).first<{ n: number }>();
  return Math.max(0, Number(row?.n || 0));
}

async function applyLike(
  db: D1DatabaseLike,
  id: string,
  visitor: string,
  action: "like" | "unlike",
): Promise<{ count: number; liked: boolean; changed: boolean }> {
  const now = Date.now();
  const day = wibDay(now);
  if (action === "like") {
    const guard = await db
      .prepare(
        `insert into video_like_guard (id, visitor, day, liked, created_at) values (?, ?, ?, 1, ?)
         on conflict (id, visitor, day) do update set liked = 1 where video_like_guard.liked = 0`,
      )
      .bind(id, visitor, day, now)
      .run();
    if (changes(guard) > 0) {
      const row = await db
        .prepare(
          `insert into video_likes (id, n, updated_at) values (?, 1, ?)
           on conflict (id) do update set n = video_likes.n + 1, updated_at = excluded.updated_at
           returning n`,
        )
        .bind(id, now)
        .first<{ n: number }>();
      return { count: Math.max(0, Number(row?.n || 0)), liked: true, changed: true };
    }
    return { count: await readCount(db, id), liked: true, changed: false };
  }
  const guard = await db
    .prepare("update video_like_guard set liked = 0 where id = ? and visitor = ? and day = ? and liked = 1")
    .bind(id, visitor, day)
    .run();
  if (changes(guard) > 0) {
    const row = await db
      .prepare(
        `update video_likes set n = max(n - 1, 0), updated_at = ? where id = ? returning n`,
      )
      .bind(now, id)
      .first<{ n: number }>();
    return { count: Math.max(0, Number(row?.n || 0)), liked: false, changed: true };
  }
  return { count: await readCount(db, id), liked: false, changed: false };
}

export const Route = createFileRoute("/api/like")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id");
        if (!validLikeId(id)) return Response.json({ ok: false, error: "bad id" }, { status: 400 });
        if (!(await isLikeableId(id))) {
          return Response.json(
            { ok: false, error: "not_found" },
            { status: 404, headers: { "cache-control": "public, max-age=300" } },
          );
        }
        const db = await likesDb().catch(() => null);
        const count = db ? await readCount(db, id).catch(() => 0) : 0;
        return Response.json(
          { ok: Boolean(db), id, count },
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
        if (!(await isLikeableId(id))) {
          return Response.json({ ok: false, error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } });
        }
        const db = await likesDb().catch(() => null);
        if (!db) return Response.json({ ok: false, error: "storage" }, { status: 503 });
        const action = body.action === "unlike" ? "unlike" : "like";
        try {
          const visitor = await visitorHash(clientIp(request), id);
          const res = await applyLike(db, id, visitor, action);
          await cleanupGuard(db);
          return Response.json({ ok: true, id, storage: "d1", ...res }, { headers: { "cache-control": "no-store" } });
        } catch (err) {
          console.error("like failed:", err instanceof Error ? err.message.slice(0, 200) : "d1 error");
          return Response.json(
            { ok: false, error: "storage" },
            { status: 503, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
