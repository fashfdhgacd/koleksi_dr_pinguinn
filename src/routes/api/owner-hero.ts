import { createFileRoute } from "@tanstack/react-router";
import { isOwnerRequest } from "@/lib/owner-auth";

/**
 * Owner-only home hero control for /pemilik (header x-online-key; the key is never stored).
 * GET  -> manual picks, the effective list (picks or top 5 rolling 24 h), live video, next switch.
 * POST {ids: string[]} -> saves up to 5 picks in owner order (one KV write per save); [] clears.
 */
function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

function slim(v: { id: string; title?: string; thumbnail?: string | null; category?: string } | null) {
  return v ? { id: v.id, title: v.title || v.id, thumbnail: v.thumbnail || null, category: v.category || null } : null;
}

async function status() {
  const { heroList, heroSlot, readHeroPicks, HERO_SLOT_MIN } = await import("@/lib/catalog/hero-pick");
  const now = Date.now();
  const [picks, eff] = await Promise.all([readHeroPicks(), heroList(now)]);
  const { slot, endsAt } = heroSlot(now);
  const current = eff.list.length ? eff.list[slot % eff.list.length] : null;
  return {
    ok: true,
    picks: picks.ids,
    savedAt: picks.at || null,
    source: eff.source,
    list: eff.list.map(slim),
    slot,
    slotMinutes: HERO_SLOT_MIN,
    current: slim(current),
    nextSwitchAt: endsAt,
    note: "Beranda bisa butuh hingga ~10 menit (cache) untuk ikut berubah.",
  };
}

export const Route = createFileRoute("/api/owner-hero")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isOwnerRequest(request))) return json({ ok: false, error: "forbidden" }, 403);
        try {
          return json(await status());
        } catch (err) {
          return json({ ok: false, error: String((err as Error)?.message || err).slice(0, 120) }, 500);
        }
      },
      POST: async ({ request }) => {
        if (!(await isOwnerRequest(request))) return json({ ok: false, error: "forbidden" }, 403);
        let body: { ids?: unknown } = {};
        try {
          body = (await request.json()) as { ids?: unknown };
        } catch {
          return json({ ok: false, error: "bad_json" }, 400);
        }
        try {
          const { writeHeroPicks } = await import("@/lib/catalog/hero-pick");
          await writeHeroPicks(Array.isArray(body.ids) ? body.ids : []);
          return json(await status());
        } catch (err) {
          const msg = String((err as Error)?.message || err);
          return json({ ok: false, error: msg === "kv_unavailable" ? "Penyimpanan KV tidak tersedia." : msg.slice(0, 120) }, 503);
        }
      },
    },
  },
});
