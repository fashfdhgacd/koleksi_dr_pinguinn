import { createFileRoute } from "@tanstack/react-router";
import { getD1, type D1DatabaseLike } from "@/lib/analytics-d1";
import { isOwnerRequest } from "@/lib/owner-auth";

/**
 * Videy pre-roll counters (videy-player.tsx), stored next to the player error counters.
 *
 * POST (visitor, navigator.sendBeacon): {id, event}, at most 200 bytes, same-site Origin/Referer
 *  only, per-IP limit per isolate. The browser sends each event at most once per page view.
 *  Storage: D1 player_errors daily counters, host "VideyAd" (no IP, user agent or visitor id).
 *  Events: vast_empty (no ad in the answer), vast_timeout (no answer within 7 s), vast_error
 *  (request failed or blocked), ad_play, ad_muted (only allowed without sound), ad_error,
 *  ad_skip, ad_complete.
 *
 * GET (owner, header x-online-key): totals per event for today and the last 7 days.
 */

const SCHEMA = [
  `create table if not exists player_errors (
     day text not null,
     host text not null,
     id text not null,
     event text not null,
     n integer not null default 0,
     primary key (day, id, event)
   )`,
  `create index if not exists player_errors_day on player_errors (day)`,
];

const HOST = "VideyAd";
const EVENTS = new Set([
  "vast_empty",
  "vast_timeout",
  "vast_error",
  "ad_play",
  "ad_muted",
  "ad_error",
  "ad_skip",
  "ad_complete",
]);
const ID_RE = /^[A-Za-z0-9_-]{3,64}$/;
const MAX_BODY = 200;
const ALLOWED_ORIGINS = new Set(["https://koleksidrpinguin.com", "https://www.koleksidrpinguin.com"]);

const g = globalThis as typeof globalThis & { __adLogSchema__?: Promise<void> };

async function logDb(): Promise<D1DatabaseLike | null> {
  const db = await getD1().catch(() => null);
  if (!db) return null;
  g.__adLogSchema__ ??= db
    .batch(SCHEMA.map((s) => db.prepare(s)))
    .then(() => undefined)
    .catch((err) => {
      g.__adLogSchema__ = undefined;
      throw err;
    });
  await g.__adLogSchema__;
  return db;
}

function wibDay(ts = Date.now()): string {
  return new Date(ts + 7 * 3600_000).toISOString().slice(0, 10);
}

function noStore(status: number, data?: unknown): Response {
  if (data === undefined) return new Response(null, { status, headers: { "cache-control": "no-store" } });
  return Response.json(data, { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

function originOk(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) return ALLOWED_ORIGINS.has(origin);
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return ALLOWED_ORIGINS.has(new URL(referer).origin);
  } catch {
    return false;
  }
}

const rate = new Map<string, { n: number; reset: number }>();
function rateLimited(request: Request): boolean {
  const ip = request.headers.get("cf-connecting-ip") || "0";
  const now = Date.now();
  if (rate.size > 10_000) rate.clear();
  const cur = rate.get(ip);
  if (!cur || now > cur.reset) {
    rate.set(ip, { n: 1, reset: now + 10 * 60_000 });
    return false;
  }
  cur.n += 1;
  return cur.n > 120;
}

async function handleBeacon(request: Request): Promise<Response> {
  if (!originOk(request)) return noStore(403);
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BODY) return noStore(text ? 413 : 400);
  let body: { id?: unknown; event?: unknown };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    return noStore(400);
  }
  const id = typeof body?.id === "string" ? body.id : "";
  const event = typeof body?.event === "string" ? body.event : "";
  if (!ID_RE.test(id) || !EVENTS.has(event)) return noStore(400);
  if (rateLimited(request)) return noStore(429);
  const db = await logDb().catch(() => null);
  if (!db) return noStore(503);
  try {
    await db
      .prepare(
        `insert into player_errors (day, host, id, event, n) values (?, ?, ?, ?, 1)
         on conflict (day, id, event) do update set n = player_errors.n + 1, host = excluded.host`,
      )
      .bind(wibDay(), HOST, id, `ad:${event}`)
      .run();
  } catch (err) {
    console.error("ad-log failed:", err instanceof Error ? err.message.slice(0, 160) : "d1 error");
    return noStore(503);
  }
  return noStore(204);
}

async function handleOwner(request: Request): Promise<Response> {
  if (!(await isOwnerRequest(request))) return noStore(403, { ok: false, error: "forbidden" });
  const db = await logDb().catch(() => null);
  if (!db) return noStore(503, { ok: false, error: "d1_unavailable" });
  const today = wibDay();
  const since = wibDay(Date.now() - 6 * 86_400_000);
  const rows = await db
    .prepare(
      `select event, sum(case when day = ? then n else 0 end) as today, sum(n) as week
       from player_errors where host = ? and day >= ? group by event`,
    )
    .bind(today, HOST, since)
    .all<{ event: string; today: number; week: number }>();
  const out: Record<string, { today: number; week: number }> = {};
  for (const e of EVENTS) out[e] = { today: 0, week: 0 };
  for (const r of rows.results || []) {
    const e = String(r.event || "").replace(/^ad:/, "");
    if (out[e]) out[e] = { today: Number(r.today) || 0, week: Number(r.week) || 0 };
  }
  return noStore(200, { ok: true, events: out });
}

export const Route = createFileRoute("/api/ad-log")({
  server: {
    handlers: {
      POST: async ({ request }) => handleBeacon(request),
      GET: async ({ request }) => handleOwner(request),
    },
  },
});
