import { createFileRoute } from "@tanstack/react-router";
import { pushDb, validSubscription, VAPID_PUBLIC_KEY } from "@/lib/web-push";

/**
 * Langganan web push (lihat src/lib/web-push.ts).
 *  GET    → { ok, publicKey }
 *  POST   { endpoint, keys: { p256dh, auth } } → simpan sekali (insert or ignore) ke D1 push_subs
 *  DELETE { endpoint } → hapus langganan (saat pengunjung mematikan notifikasi)
 * Hanya dipanggil saat pengunjung tap tombol, tidak pernah per kunjungan.
 */
const BOT_UA = /bot|crawl|spider|slurp|headless|preview/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text().catch(() => "");
  if (!text || text.length > 4000) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/push")({
  server: {
    handlers: {
      GET: async () => json({ ok: true, publicKey: VAPID_PUBLIC_KEY }),
      POST: async ({ request }) => {
        if (BOT_UA.test(request.headers.get("user-agent") || "")) return json({ ok: false, error: "bot" }, 403);
        const sub = validSubscription(await readBody(request));
        if (!sub) return json({ ok: false, error: "langganan tidak valid" }, 400);
        try {
          const db = await pushDb();
          if (!db) return json({ ok: false, error: "penyimpanan tidak tersedia" }, 503);
          await db
            .prepare("insert or ignore into push_subs (endpoint, p256dh, auth, created_at) values (?, ?, ?, ?)")
            .bind(sub.endpoint, sub.p256dh, sub.auth, Date.now())
            .run();
          return json({ ok: true });
        } catch {
          return json({ ok: false, error: "gagal menyimpan" }, 500);
        }
      },
      DELETE: async ({ request }) => {
        const body = (await readBody(request)) as { endpoint?: unknown } | null;
        const endpoint = String(body?.endpoint || "").trim();
        if (!endpoint || endpoint.length > 1000) return json({ ok: false, error: "endpoint kosong" }, 400);
        try {
          const db = await pushDb();
          if (!db) return json({ ok: false, error: "penyimpanan tidak tersedia" }, 503);
          await db.prepare("delete from push_subs where endpoint = ?").bind(endpoint).run();
          return json({ ok: true });
        } catch {
          return json({ ok: false, error: "gagal menghapus" }, 500);
        }
      },
    },
  },
});
