import { createFileRoute } from "@tanstack/react-router";
import { isOwnerRequest } from "@/lib/owner-auth";

/**
 * Owner-only push subscriber stats for /pemilik (header x-online-key; key never stored).
 * GET -> { total, last24h, last7d, lastSend } from D1 push_subs / push_log. Read-only, loaded once
 * when the card mounts (no polling), so it costs 3 small D1 reads per /pemilik open.
 */
function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

export const Route = createFileRoute("/api/owner-push")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isOwnerRequest(request))) return json({ ok: false, error: "forbidden" }, 403);
        try {
          const { pushDb } = await import("@/lib/web-push");
          const db = await pushDb();
          if (!db) return json({ ok: false, error: "D1 tidak tersedia" }, 503);
          const now = Date.now();
          const [counts, last] = await Promise.all([
            db
              .prepare(
                "select count(*) as total, sum(case when created_at >= ? then 1 else 0 end) as d1, sum(case when created_at >= ? then 1 else 0 end) as d7 from push_subs",
              )
              .bind(now - 86_400_000, now - 7 * 86_400_000)
              .first<{ total: number; d1: number | null; d7: number | null }>(),
            db
              .prepare("select sent_at, subs from push_log order by sent_at desc limit 1")
              .first<{ sent_at: number; subs: number }>(),
          ]);
          return json({
            ok: true,
            total: Number(counts?.total) || 0,
            last24h: Number(counts?.d1) || 0,
            last7d: Number(counts?.d7) || 0,
            lastSend: last ? { at: Number(last.sent_at), subs: Number(last.subs) || 0 } : null,
          });
        } catch (err) {
          return json({ ok: false, error: String((err as Error)?.message || err).slice(0, 120) }, 500);
        }
      },
    },
  },
});
