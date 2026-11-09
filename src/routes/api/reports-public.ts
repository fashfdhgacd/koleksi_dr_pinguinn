import { createFileRoute } from "@tanstack/react-router";
import { getD1, type D1DatabaseLike } from "@/lib/analytics-d1";

/**
 * Public transparency data for /laporan: resolved reports ONLY, stripped to
 * date + category + outcome. Never exposes video ids, reporter data, contact
 * info or report details — a transparency report shows that moderation happens,
 * not what was reported.
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
];

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

export const Route = createFileRoute("/api/reports-public")({
  server: {
    handlers: {
      GET: async () => {
        const db = await reportsDb().catch(() => null);
        if (!db) {
          return Response.json(
            { ok: false, totals: { actioned: 0, rejected: 0, removed: 0 }, categories: [], items: [] },
            { headers: { "cache-control": "no-store" } },
          );
        }
        try {
          const rows = await db
            .prepare(
              `select reason, status, reviewed_at from content_reports
               where status in ('actioned','rejected') and reviewed_at is not null
               order by reviewed_at desc limit 100`,
            )
            .all<{ reason: string; status: string; reviewed_at: number }>();
          const items = (rows.results || []).map((r) => ({
            date: new Date(r.reviewed_at).toISOString().slice(0, 10),
            reason: r.reason,
            outcome: r.status === "actioned" ? "actioned" : "rejected",
          }));
          const catRows = await db
            .prepare(
              `select reason,
                 sum(case when status = 'actioned' then 1 else 0 end) as actioned,
                 sum(case when status = 'rejected' then 1 else 0 end) as rejected,
                 count(distinct case when status = 'actioned' then video_id end) as removed
               from content_reports
               where status in ('actioned','rejected')
               group by reason`,
            )
            .all<{ reason: string; actioned: number; rejected: number; removed: number }>()
            .catch(() => ({ results: [] as { reason: string; actioned: number; rejected: number; removed: number }[] }));
          const categories = (catRows.results || []).map((c) => ({
            reason: c.reason,
            actioned: Number(c.actioned) || 0,
            rejected: Number(c.rejected) || 0,
            removed: Number(c.removed) || 0,
          }));
          const totals = { actioned: 0, rejected: 0, removed: 0 };
          for (const c of categories) {
            totals.actioned += c.actioned;
            totals.rejected += c.rejected;
            totals.removed += c.removed;
          }
          return Response.json(
            { ok: true, totals, categories, items },
            { headers: { "cache-control": "public, max-age=300, s-maxage=300" } },
          );
        } catch (err) {
          console.error("reports-public get failed:", err instanceof Error ? err.message.slice(0, 200) : "d1 error");
          return Response.json(
            { ok: false, totals: { actioned: 0, rejected: 0, removed: 0 }, categories: [], items: [] },
            { headers: { "cache-control": "no-store" } },
          );
        }
      },
    },
  },
});
