import { createFileRoute } from "@tanstack/react-router";
import { getD1, type D1DatabaseLike } from "@/lib/analytics-d1";
import { isOwnerRequest } from "@/lib/owner-auth";

/**
 * Analytics untuk situs satelit videyy.icu.
 * POST { p } → catat pageview (public, fire-and-forget via sendBeacon).
 * GET        → owner-only: online 5 mnt, kunjungan hari ini, total.
 */

const SCHEMA = [
  `create table if not exists videy_hits (
     id integer primary key autoincrement,
     ts integer not null,
     path text not null default ''
   )`,
  `create index if not exists videy_hits_ts on videy_hits(ts)`,
  `create table if not exists videy_day (
     day text primary key,
     hits integer not null default 0
   )`,
];

const g = globalThis as typeof globalThis & { __videyHitSchema__?: Promise<void> };

async function db(): Promise<D1DatabaseLike | null> {
  const d1 = await getD1().catch(() => null);
  if (!d1) return null;
  g.__videyHitSchema__ ??= d1
    .batch(SCHEMA.map((s) => d1.prepare(s)))
    .then(() => undefined)
    .catch((err) => {
      g.__videyHitSchema__ = undefined;
      throw err;
    });
  await g.__videyHitSchema__;
  return d1;
}

const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "cache-control": "no-store", "access-control-allow-origin": "*" },
  });

// Tanggal kalender Asia/Jakarta (WIB) sebagai YYYY-MM-DD.
function wibDay(ts = Date.now()): string {
  return new Date(ts + 7 * 3600_000).toISOString().slice(0, 10);
}

function wibDayAgo(days: number): string {
  return wibDay(Date.now() - days * 86400_000);
}

export const Route = createFileRoute("/api/videy-hit")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, GET, OPTIONS", "access-control-allow-headers": "content-type, x-online-key" } }),
      POST: async ({ request }) => {
        let body: { p?: unknown } = {};
        try {
          body = ((await request.json()) as typeof body) || {};
        } catch {
          return json({ ok: false, error: "bad_json" }, 400);
        }
        const p = String(body.p || "/").replace(/[^a-zA-Z0-9/_\-?.=&%]/g, "").slice(0, 120) || "/";
        const now = Date.now();
        const d1 = await db().catch(() => null);
        if (!d1) return json({ ok: false, error: "db_unavailable" }, 503);
        const day = wibDay(now);
        await d1.batch([
          d1.prepare(`insert into videy_hits (ts, path) values (?, ?)`).bind(now, p),
          d1.prepare(
            `insert into videy_day (day, hits) values (?, 1)
             on conflict(day) do update set hits = hits + 1`,
          ).bind(day),
          // Pangkas hit mentah lebih tua dari 3 hari — counter harian tetap utuh.
          d1.prepare(`delete from videy_hits where ts < ?`).bind(now - 3 * 86400_000),
        ]).catch(() => null);
        return json({ ok: true });
      },
      GET: async ({ request }) => {
        if (!(await isOwnerRequest(request))) return json({ ok: false, error: "forbidden" }, 403);
        const d1 = await db().catch(() => null);
        if (!d1) return json({ ok: false, error: "db_unavailable" }, 503);
        const now = Date.now();
        const [online, today, yday, total, top] = await Promise.all([
          d1.prepare(`select count(*) as n from videy_hits where ts > ?`).bind(now - 5 * 60_000).first<{ n: number }>(),
          d1.prepare(`select hits from videy_day where day = ?`).bind(wibDay(now)).first<{ hits: number }>(),
          d1.prepare(`select hits from videy_day where day = ?`).bind(wibDayAgo(1)).first<{ hits: number }>(),
          d1.prepare(`select coalesce(sum(hits),0) as n from videy_day`).first<{ n: number }>(),
          d1
            .prepare(`select path, count(*) as n from videy_hits where ts > ? group by path order by n desc limit 8`)
            .bind(now - 86400_000)
            .all<{ path: string; n: number }>()
            .catch(() => ({ results: [] as { path: string; n: number }[] })),
        ]);
        return json({
          ok: true,
          online: online?.n || 0,
          today: today?.hits || 0,
          yesterday: yday?.hits || 0,
          total: total?.n || 0,
          top: top.results || [],
        });
      },
    },
  },
});
