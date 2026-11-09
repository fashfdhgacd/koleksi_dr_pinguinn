import { createFileRoute } from "@tanstack/react-router";
import { getD1, type D1DatabaseLike } from "@/lib/analytics-d1";
import { getDetail } from "@/lib/catalog/local";

/**
 * Visitor comments on watch pages, stored in Cloudflare D1 (binding ANALYTICS_DB,
 * same database as likes/analytics — no new service, no added cost).
 *
 *  - comments:        one row per comment; new posts always land as status
 *                     'pending' — nothing is public until the owner approves it
 *                     in /pemilik (api/comments-admin.ts), which matters a lot
 *                     on an adult site (spam/illegal content).
 *  - comment_guard:   unique (visitor, day) row counting posts per visitor per
 *                     WIB day — the rate limit (COMMENT_MAX_PER_DAY).
 *
 * Spam layers, cheapest first: bot user-agents rejected, per-visitor daily cap,
 * pending-only visibility, optional Cloudflare Turnstile verification when
 * TURNSTILE_SECRET_KEY is configured (unset = skipped; moderation still gates
 * everything). Storage errors are never echoed to the client.
 */

const SCHEMA = [
  `create table if not exists comments (
     id integer primary key autoincrement,
     video_id text not null,
     video_title text not null default '',
     author text not null,
     body text not null,
     status text not null default 'pending',
     visitor text not null,
     created_at integer not null
   )`,
  `create index if not exists comments_video on comments (video_id, status, created_at)`,
  `create index if not exists comments_status on comments (status, created_at)`,
  `create table if not exists comment_guard (
     visitor text not null,
     day text not null,
     n integer not null default 0,
     created_at integer not null,
     primary key (visitor, day)
   )`,
];

const BOT_UA = /bot|crawl|spider|slurp|headless|curl\/|wget|python-requests|preview/i;
const COMMENT_MAX_PER_DAY = 8;
const PAGE = 20;
const NAME_MAX = 40;
const BODY_MAX = 1000;

const g = globalThis as typeof globalThis & { __commentsSchema__?: Promise<void> };

async function commentsDb(): Promise<D1DatabaseLike | null> {
  const db = await getD1().catch(() => null);
  if (!db) return null;
  g.__commentsSchema__ ??= db
    .batch(SCHEMA.map((s) => db.prepare(s)))
    .then(() => undefined)
    .catch((err) => {
      g.__commentsSchema__ = undefined;
      throw err;
    });
  await g.__commentsSchema__;
  return db;
}

function validVideoId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(id);
}

function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .split("")
    .map((ch) => (ch < " " || ch === "\u007f" ? " " : ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function clientIp(request: Request): string {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "0";
  if (ip.includes(":")) return ip.split(":").slice(0, 4).join(":") + "::/64";
  return ip;
}

async function visitorHash(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`${ip}|kdp-comment`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf).slice(0, 12))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function wibDay(ts = Date.now()): string {
  return new Date(ts + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Turnstile check — only enforced when TURNSTILE_SECRET_KEY is configured. */
async function verifyTurnstile(token: unknown, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== "string" || !token) return false;
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const j = (await r.json()) as { success?: boolean };
    return j.success === true;
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/comments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id");
        if (!validVideoId(id)) {
          return Response.json({ ok: false, error: "bad id" }, { status: 400 });
        }
        const db = await commentsDb().catch(() => null);
        if (!db) {
          return Response.json(
            { ok: false, comments: [] },
            { headers: { "cache-control": "no-store" } },
          );
        }
        try {
          const rows = await db
            .prepare(
              `select id, author, body, created_at from comments
               where video_id = ? and status = 'approved'
               order by created_at desc, id desc limit ?`,
            )
            .bind(id, PAGE)
            .all<{ id: number; author: string; body: string; created_at: number }>();
          const comments = (rows.results || []).reverse();
          return Response.json(
            { ok: true, id, comments },
            { headers: { "cache-control": "public, max-age=30, s-maxage=30" } },
          );
        } catch (err) {
          console.error("comments get failed:", err instanceof Error ? err.message.slice(0, 200) : "d1 error");
          return Response.json({ ok: false, comments: [] }, { headers: { "cache-control": "no-store" } });
        }
      },
      POST: async ({ request }) => {
        let body: { id?: unknown; name?: unknown; body?: unknown; turnstile?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }
        const id = body.id;
        if (!validVideoId(id)) {
          return Response.json({ ok: false, error: "bad id" }, { status: 400 });
        }
        const ua = request.headers.get("user-agent") || "";
        if (BOT_UA.test(ua) && !/Mozilla/.test(ua)) {
          return Response.json({ ok: false, error: "bot" }, { status: 403 });
        }
        const author = cleanText(body.name, NAME_MAX);
        const text = cleanText(body.body, BODY_MAX);
        if (!author || !text) {
          return Response.json({ ok: false, error: "empty" }, { status: 400 });
        }
        const ip = clientIp(request);
        if (!(await verifyTurnstile(body.turnstile, ip))) {
          return Response.json({ ok: false, error: "captcha" }, { status: 403 });
        }
        let title = "";
        try {
          const detail = await getDetail(id);
          title = cleanText(detail?.title, 200);
        } catch {
          return Response.json({ ok: false, error: "not_found" }, { status: 404 });
        }
        const db = await commentsDb().catch(() => null);
        if (!db) {
          return Response.json({ ok: false, error: "storage" }, { status: 503 });
        }
        try {
          const visitor = await visitorHash(ip);
          const day = wibDay();
          const now = Date.now();
          const guard = await db
            .prepare(
              `insert into comment_guard (visitor, day, n, created_at) values (?, ?, 1, ?)
               on conflict (visitor, day) do update set n = comment_guard.n + 1
               where comment_guard.n < ?`,
            )
            .bind(visitor, day, now, COMMENT_MAX_PER_DAY)
            .run();
          const meta = (guard as { meta?: { changes?: number } } | null)?.meta;
          if (!Number(meta?.changes || 0)) {
            return Response.json(
              { ok: false, error: "limit" },
              { status: 429, headers: { "cache-control": "no-store" } },
            );
          }
          await db
            .prepare(
              `insert into comments (video_id, video_title, author, body, status, visitor, created_at)
               values (?, ?, ?, ?, 'pending', ?, ?)`,
            )
            .bind(id, title, author, text, visitor, now)
            .run();
          return Response.json(
            { ok: true, pending: true },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (err) {
          console.error("comment post failed:", err instanceof Error ? err.message.slice(0, 200) : "d1 error");
          return Response.json(
            { ok: false, error: "storage" },
            { status: 503, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
