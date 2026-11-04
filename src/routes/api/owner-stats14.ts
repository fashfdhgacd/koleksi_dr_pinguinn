import { createFileRoute } from "@tanstack/react-router";
import { isOwnerKey, ownerKeyFrom, ownerSecret } from "@/lib/owner-auth";
import { readyD1 } from "@/lib/analytics-d1";
import { STATS14_TODAY_MS, readStats14 } from "@/lib/stats14-d1";
import type { Stats14 } from "@/lib/stats14";
import { wibDayKey } from "@/lib/traffic-valve";
import { toTopVideos, watchIdFromPath, withVideoTitles } from "@/lib/owner-top-videos";

/**
 * Owner-only "Statistik 14 hari" (/pemilik): visitors per day, devices, top pages, sources, countries
 * and browsers over 14 WIB days (+ the 14 days before, for the comparison). Read-only on the
 * existing analytics data (see stats14-d1.ts). The result is shared across isolates in this data
 * centre for CACHE_SEC via the Cache API under /api/owner…, which the worker entry never serves from
 * cache, so it can't leak publicly. Loaded only when the owner opens the section; no polling.
 */
const CACHE_SEC = Math.round(STATS14_TODAY_MS / 1000);
const CACHE_PATH = "/api/owner-stats14-cache-v2";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

function edgeCache(): Cache | null {
  try {
    return (caches as unknown as { default?: Cache }).default || null;
  } catch {
    return null;
  }
}

/** Video titles for /watch/<id> rows (in-memory catalog, no DB query). */
async function withPageTitles(data: Stats14): Promise<Stats14> {
  const vids = await withVideoTitles(toTopVideos(data.pages.map((p) => ({ path: p.key, views: p.views })), data.pages.length));
  const titles = new Map(vids.map((v) => [v.id, v.title || ""]));
  return {
    ...data,
    pages: data.pages.map((p) => {
      const id = watchIdFromPath(p.key);
      const title = id ? titles.get(id) : "";
      return title ? { ...p, label: title } : p;
    }),
  };
}

async function load(origin: string): Promise<Stats14 & { cached?: boolean }> {
  const cache = edgeCache();
  const key = new Request(`${origin}${CACHE_PATH}`);
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) return { ...((await hit.json()) as Stats14), cached: true };
    } catch {
      /* fall through */
    }
  }
  const db = await readyD1();
  if (!db) throw new Error("d1_not_bound");
  const data = await withPageTitles(await readStats14(db, wibDayKey(), Date.now()));
  if (cache) {
    try {
      await cache.put(
        key,
        new Response(JSON.stringify(data), {
          headers: { "content-type": "application/json", "cache-control": `public, max-age=${CACHE_SEC}` },
        }),
      );
    } catch {
      /* cache optional */
    }
  }
  return data;
}

export const Route = createFileRoute("/api/owner-stats14")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!ownerSecret()) return json({ ok: false, error: "not_configured" }, 503);
        if (!(await isOwnerKey(ownerKeyFrom(request)))) return json({ ok: false, error: "forbidden" }, 403);
        try {
          // The edge copy is at most CACHE_SEC old; reloading never bypasses it (cost).
          return json(await load(new URL(request.url).origin));
        } catch (err) {
          console.error("[stats14] failed", err);
          return json({ ok: false, error: "busy", hint: "Statistik sibuk, coba lagi sebentar." }, 503);
        }
      },
    },
  },
});
