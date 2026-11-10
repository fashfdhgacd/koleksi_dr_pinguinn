import { createFileRoute } from "@tanstack/react-router";
import { resolveAnalyticsKV } from "@/lib/analytics-kv";
import { isOwnerRequest } from "@/lib/owner-auth";
import { loadItemsRaw } from "@/lib/catalog/local-cache";
import { readOwnerEditState } from "@/lib/catalog/owner-edit-store";
import type { RawItem } from "@/lib/catalog/local-shared";

/**
 * Video unggulan hero videyy.icu, diatur owner dari /pemilik → tab Videyy.
 * GET  → publik (CORS *) supaya homepage statis videyy.icu bisa fetch langsung.
 * POST → owner-only { id, title? } atau { id: null } untuk reset ke default.
 * Disimpan di KV ANALYTICS_KV key "videy:featured".
 */

const KEY = "videy:featured";
const ID_RE = /^[A-Za-z0-9_-]{6,24}$/;

const CORS = { "access-control-allow-origin": "*" };

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store", ...CORS, ...extra },
  });
}

async function readFeatured(): Promise<{ id: string; title: string } | null> {
  const r = await resolveAnalyticsKV().catch(() => null);
  if (!r) return null;
  const raw = await r.kv.get(KEY).catch(() => null);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as { id?: unknown; title?: unknown };
    if (typeof d.id !== "string" || !ID_RE.test(d.id)) return null;
    return { id: d.id, title: typeof d.title === "string" ? d.title.slice(0, 200) : "" };
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/videy-featured")({
  server: {
    handlers: {
      GET: async () => {
        const f = await readFeatured();
        if (!f) return json({ ok: true, id: null, title: "" });
        // Judul kosong → resolve dari katalog (termasuk edit owner di KV).
        let title = f.title;
        if (!title) {
          try {
            const cache = (await loadItemsRaw()) as unknown as { items?: RawItem[]; raw?: RawItem[] };
            const items = cache.raw || cache.items || [];
            const it = items.find((i) => String(i.id) === f.id);
            const edits = await readOwnerEditState().catch(() => ({ ids: {} }));
            title = String(edits.ids[f.id]?.title || it?.title || "")
              .replace(/\s*-\s*(koleksidrpinguin\.com|videyy\.icu)\s*$/i, "")
              .trim()
              .slice(0, 200);
          } catch {
            /* judul opsional */
          }
        }
        return json({ ok: true, id: f.id, title });
      },
      POST: async ({ request }) => {
        let body: { id?: unknown; title?: unknown; key?: unknown } = {};
        try {
          body = ((await request.json()) as typeof body) || {};
        } catch {
          return json({ ok: false, error: "bad_json" }, 400);
        }
        if (!(await isOwnerRequest(request, typeof body.key === "string" ? body.key : undefined)))
          return json({ ok: false, error: "forbidden" }, 403);

        const r = await resolveAnalyticsKV().catch(() => null);
        if (!r) return json({ ok: false, error: "kv_unavailable" }, 503);

        const id = body.id === null ? null : typeof body.id === "string" ? body.id.trim() : "";
        if (id === null) {
          await r.kv.put(KEY, JSON.stringify({ id: null, at: Date.now() }));
          return json({ ok: true, id: null });
        }
        if (!id || !ID_RE.test(id)) return json({ ok: false, error: "ID video tidak valid." }, 400);
        const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim().slice(0, 200) : "";
        await r.kv.put(KEY, JSON.stringify({ id, title, at: Date.now() }));
        return json({ ok: true, id, title });
      },
    },
  },
});
