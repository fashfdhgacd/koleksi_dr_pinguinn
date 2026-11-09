import { createFileRoute } from "@tanstack/react-router";
import { getD1, type D1DatabaseLike } from "@/lib/analytics-d1";
import { getDetail } from "@/lib/catalog/local";

/**
 * Visitor reports of prohibited content on watch pages, stored in Cloudflare D1
 * (binding ANALYTICS_DB, same database as comments/analytics — no new service).
 *
 *  - content_reports: one row per report; always lands as status 'pending' —
 *    nothing happens to the video until the owner reviews it in /pemilik
 *    (api/reports-admin.ts). A report NEVER hides a video by itself.
 *  - report_guard: unique (visitor, day) row counting reports per visitor per
 *    WIB day — the rate limit (REPORT_MAX_PER_DAY).
 *
 * The reporter never sees the outcome (no GET for reporters, response is a
 * fixed "received" message). Spam layers mirror comments: bot user-agents
 * rejected, per-visitor daily cap, pending-only visibility, optional Turnstile.
 * Storage errors are never echoed to the client.
 */

const SCHEMA = [
  `create table if not exists content_reports (
     id integer primary key autoincrement,
     video_id text not null,
     video_title text not null default '',
     reason text not null,
     detail text not null default '',
     contact text not null default '',
     reporter text not null default '',
     status text not null default 'pending',
     created_at integer not null,
     reviewed_at integer
   )`,
  `create index if not exists content_reports_status on content_reports (status, created_at)`,
  `create index if not exists content_reports_video on content_reports (video_id, status)`,
  `create table if not exists report_guard (
     visitor text not null,
     day text not null,
     n integer not null default 0,
     created_at integer not null,
     primary key (visitor, day)
   )`,
];

const BOT_UA = /bot|crawl|spider|slurp|headless|curl\/|wget|python-requests|preview/i;
const REPORT_MAX_PER_DAY = 5;
const DETAIL_MAX = 1000;
const CONTACT_MAX = 120;
const REASONS = new Set(["minor", "illegal", "other"]);

const g = globalThis as typeof globalThis & { __reportsSchema__?: Promise<void> };

async function reportsDb(): Promise<D1DatabaseLike | null> {
  const db = await getD1().catch(() => null);
  if (!db) return null;
  g.__reportsSchema__ ??= db
    .batch(SCHEMA.map((s) => db.prepare(s)))
    .then(() => undefined)
    .catch((err) => {
      g.__reportsSchema__ = undefined;
      throw err;
    });
  await g.__reportsSchema__;
  return db;
}

function validVideoId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{3,64}$/.test(id);
}

function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .split("")
    .map((ch) => (ch < " " || ch === "" ? " " : ch))
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
  const data = new TextEncoder().encode(`${ip}|kdp-report`);
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

export const Route = createFileRoute("/api/reports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { id?: unknown; reason?: unknown; detail?: unknown; contact?: unknown; turnstile?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }
        const id = body.id;
        if (!validVideoId(id)) {
          return Response.json({ ok: false, error: "bad id" }, { status: 400 });
        }
        const reason = typeof body.reason === "string" ? body.reason : "";
        if (!REASONS.has(reason)) {
          return Response.json({ ok: false, error: "bad reason" }, { status: 400 });
        }
        const ua = request.headers.get("user-agent") || "";
        if (BOT_UA.test(ua) && !/Mozilla/.test(ua)) {
          return Response.json({ ok: false, error: "bot" }, { status: 403 });
        }
        const detail = cleanText(body.detail, DETAIL_MAX);
        const contact = cleanText(body.contact, CONTACT_MAX);
        const ip = clientIp(request);
        if (!(await verifyTurnstile(body.turnstile, ip))) {
          return Response.json({ ok: false, error: "captcha" }, { status: 403 });
        }
        let title = "";
        try {
          const d = await getDetail(id);
          title = cleanText(d?.title, 200);
        } catch {
          return Response.json({ ok: false, error: "not_found" }, { status: 404 });
        }
        const db = await reportsDb().catch(() => null);
        if (!db) {
          return Response.json({ ok: false, error: "storage" }, { status: 503 });
        }
        try {
          const visitor = await visitorHash(ip);
          const day = wibDay();
          const now = Date.now();
          const guard = await db
            .prepare(
              `insert into report_guard (visitor, day, n, created_at) values (?, ?, 1, ?)
               on conflict (visitor, day) do update set n = report_guard.n + 1
               where report_guard.n < ?`,
            )
            .bind(visitor, day, now, REPORT_MAX_PER_DAY)
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
              `insert into content_reports (video_id, video_title, reason, detail, contact, reporter, status, created_at)
               values (?, ?, ?, ?, ?, ?, 'pending', ?)`,
            )
            .bind(id, title, reason, detail, contact, visitor, now)
            .run();
          // Fixed response: the reporter never learns the outcome.
          return Response.json(
            { ok: true, pending: true },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (err) {
          console.error("report post failed:", err instanceof Error ? err.message.slice(0, 200) : "d1 error");
          return Response.json(
            { ok: false, error: "storage" },
            { status: 503, headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
