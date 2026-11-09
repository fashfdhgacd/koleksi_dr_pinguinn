import { createFileRoute } from "@tanstack/react-router";
import { getD1, type D1DatabaseLike } from "@/lib/analytics-d1";
import { isOwnerRequest } from "@/lib/owner-auth";

/**
 * Owner-only comment moderation for /pemilik ("Komentar masuk"):
 *  - GET  ?status=pending|approved|hidden|all&limit=N  -> list comments
 *  - POST {action: approve|hide|delete|restore, id, key?} -> change one comment
 * Auth is the same x-online-key owner secret as every other owner API —
 * never in the URL. Approved comments are the only ones /api/comments shows.
 */

const g = globalThis as typeof globalThis & { __commentsSchema__?: Promise<void> };

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
];

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

const STATUSES = new Set(["pending", "approved", "hidden"]);
const ACTIONS: Record<string, string> = {
  approve: "approved",
  hide: "hidden",
  restore: "pending",
};

export const Route = createFileRoute("/api/comments-admin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isOwnerRequest(request))) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        const url = new URL(request.url);
        const status = url.searchParams.get("status") || "pending";
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 100));
        const db = await commentsDb().catch(() => null);
        if (!db) return Response.json({ ok: false, error: "storage" }, { status: 503 });
        try {
          const where = status === "all" ? "" : "where status = ?";
          const stmt = db.prepare(
            `select id, video_id, video_title, author, body, status, created_at
             from comments ${where} order by created_at desc, id desc limit ?`,
          );
          const bound = status === "all" ? stmt.bind(limit) : stmt.bind(status, limit);
          const rows = await bound.all<{
            id: number;
            video_id: string;
            video_title: string;
            author: string;
            body: string;
            status: string;
            created_at: number;
          }>();
          return Response.json({ ok: true, comments: rows.results || [] }, { headers: { "cache-control": "no-store" } });
        } catch (err) {
          console.error("comments-admin get failed:", err instanceof Error ? err.message.slice(0, 200) : "d1 error");
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
        const db = await commentsDb().catch(() => null);
        if (!db) return Response.json({ ok: false, error: "storage" }, { status: 503 });
        try {
          if (action === "delete") {
            await db.prepare("delete from comments where id = ?").bind(id).run();
          } else if (ACTIONS[action] && STATUSES.has(ACTIONS[action])) {
            await db.prepare("update comments set status = ? where id = ?").bind(ACTIONS[action], id).run();
          } else {
            return Response.json({ ok: false, error: "bad action" }, { status: 400 });
          }
          return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
        } catch (err) {
          console.error("comments-admin post failed:", err instanceof Error ? err.message.slice(0, 200) : "d1 error");
          return Response.json({ ok: false, error: "storage" }, { status: 503 });
        }
      },
    },
  },
});
