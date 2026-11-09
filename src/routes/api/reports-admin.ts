import { createFileRoute } from "@tanstack/react-router";
import { getD1, type D1DatabaseLike } from "@/lib/analytics-d1";
import { isOwnerRequest } from "@/lib/owner-auth";
import { setOwnerHidden } from "@/lib/catalog/owner-hide-store";

/**
 * Owner-only moderation for visitor content reports (/pemilik → "Laporan konten"):
 *  - GET  ?status=pending|actioned|rejected|all&limit=N -> list reports (+ strike count
 *         per reporter: how many of their reports were rejected)
 *  - POST {action: hide|reject|reopen, id, key?} -> review one report
 *    "hide"    = video disembunyikan lewat owner-hide store (bisa dibuka lagi) + status
 *                'actioned' — ini satu-satunya aksi yang menyentuh video
 *    "reject"  = laporan ditolak (video tidak diapa-apakan)
 *    "reopen"  = kembalikan ke pending
 * Auth is the same x-online-key owner secret as every other owner API — never in the URL.
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

export const Route = createFileRoute("/api/reports-admin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isOwnerRequest(request))) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const url = new URL(request.url);
        const status = url.searchParams.get("status") || "pending";
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 100));
        const db = await reportsDb().catch(() => null);
        if (!db) return Response.json({ ok: false, error: "storage" }, { status: 503 });
        try {
          const where = status === "all" ? "" : "where status = ?";
          const stmt = db.prepare(
            `select id, video_id, video_title, reason, detail, contact, reporter, status, created_at, reviewed_at
             from content_reports ${where} order by created_at desc, id desc limit ?`,
          );
          const bound = status === "all" ? stmt.bind(limit) : stmt.bind(status, limit);
          const rows = await bound.all<{
            id: number;
            video_id: string;
            video_title: string;
            reason: string;
            detail: string;
            contact: string;
            reporter: string;
            status: string;
            created_at: number;
            reviewed_at: number | null;
          }>();
          // Strike count per reporter: rejected reports only (repeat false reporters stand out).
          const strikesRows = await db
            .prepare(
              `select reporter, count(*) as n from content_reports
               where status = 'rejected' and reporter != '' group by reporter`,
            )
            .all<{ reporter: string; n: number }>()
            .catch(() => ({ results: [] as { reporter: string; n: number }[] }));
          const strikes = new Map((strikesRows.results || []).map((r) => [r.reporter, Number(r.n) || 0]));
          const pendingRow = await db
            .prepare("select count(*) as n from content_reports where status = 'pending'")
            .first<{ n: number }>()
            .catch(() => null);
          const items = (rows.results || []).map((r) => ({
            ...r,
            strikes: strikes.get(r.reporter) || 0,
          }));
          return Response.json(
            { ok: true, reports: items, pending: Number(pendingRow?.n) || 0 },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (err) {
          console.error("reports-admin get failed:", err instanceof Error ? err.message.slice(0, 200) : "d1 error");
          return Response.json({ ok: false, error: "storage" }, { status: 503 });
        }
      },
      POST: async ({ request }) => {
        let body: { action?: unknown; id?: unknown; key?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }
        if (!(await isOwnerRequest(request, body.key))) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const id = Number(body.id);
        if (!Number.isInteger(id) || id <= 0) {
          return Response.json({ ok: false, error: "bad id" }, { status: 400 });
        }
        const action = typeof body.action === "string" ? body.action : "";
        const db = await reportsDb().catch(() => null);
        if (!db) return Response.json({ ok: false, error: "storage" }, { status: 503 });
        try {
          const row = await db
            .prepare("select video_id, status from content_reports where id = ?")
            .bind(id)
            .first<{ video_id: string; status: string }>();
          if (!row) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
          const now = Date.now();
          if (action === "hide") {
            // The ONLY action that touches the video: reversible owner-hide (video leaves
            // listings/search/sitemap/watch until unhidden — nothing is deleted).
            await setOwnerHidden(row.video_id, true);
            await db
              .prepare("update content_reports set status = 'actioned', reviewed_at = ? where id = ?")
              .bind(now, id)
              .run();
          } else if (action === "reject") {
            await db
              .prepare("update content_reports set status = 'rejected', reviewed_at = ? where id = ?")
              .bind(now, id)
              .run();
          } else if (action === "reopen") {
            await db
              .prepare("update content_reports set status = 'pending', reviewed_at = null where id = ?")
              .bind(id)
              .run();
          } else {
            return Response.json({ ok: false, error: "bad action" }, { status: 400 });
          }
          return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
        } catch (err) {
          console.error("reports-admin post failed:", err instanceof Error ? err.message.slice(0, 200) : "d1 error");
          return Response.json({ ok: false, error: "storage" }, { status: 503 });
        }
      },
    },
  },
});
