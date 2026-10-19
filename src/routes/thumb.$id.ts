import { createFileRoute } from "@tanstack/react-router";
import posters from "@/lib/catalog/posters.json";
import javPosters from "@/lib/catalog/jav-posters.json";
import latestPosters from "../../data/latest-posters.json";
import folderBatch20261007 from "@/lib/catalog/folder-batch-20261007.json";
import drpBokepBatch from "../../data/drp-bokep.json";
import itemOverrides from "@/lib/catalog/overrides.json";
import { resolvePostersBucket } from "@/lib/poster-r2";

function sourceFor(id: string): string {
  const maps = [posters, javPosters, latestPosters] as Array<Record<string, string>>;
  for (const map of maps) {
    const url = map?.[id];
    if (typeof url === "string" && url.startsWith("http")) return url;
  }
  const ov = (itemOverrides as Record<string, { poster?: string }>)[id];
  if (ov && typeof ov.poster === "string" && ov.poster.startsWith("http")) return ov.poster;
  // Folder-ingest batches (and the /kategori/bokep import) carry their poster on the item itself.
  for (const it of [
    ...(folderBatch20261007 as Array<{ id?: string; poster?: string }>),
    ...(drpBokepBatch as Array<{ id?: string; poster?: string }>),
  ]) {
    if (it?.id === id && typeof it.poster === "string" && it.poster.startsWith("http")) return it.poster;
  }
  return "";
}

function keyFor(id: string): string {
  return `posters/typed/${id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80)}`;
}

function sniffType(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf.slice(0, 16));
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return "image/webp";
  return "";
}

function imageResponse(body: BodyInit, type: string): Response {
  return new Response(body, {
    headers: {
      "content-type": type,
      // Saved in R2 once, never changes for an id: keep it for 30 days in browser and edge cache.
      "cache-control": "public, max-age=2592000, stale-while-revalidate=604800",
    },
  });
}

/**
 * No stored/remote poster (or the host is dead): redirect to the site's own brand poster
 * (public/brand-poster-6x5.jpg, a static asset served without the Worker) instead of a 404, so
 * Google's video indexing never sees an unreachable thumbnail. The card (thumb.tsx) sees the
 * redirected URL and draws the logo centered (object-contain) instead of cropping it as a photo.
 * Short cache + not saved to R2, so a real poster added later still takes over.
 */
async function fallback(request: Request): Promise<Response> {
  return new Response(null, {
    status: 302,
    headers: {
      location: new URL("/brand-poster-6x5.jpg", request.url).toString(),
      "cache-control": "public, max-age=300",
      "x-thumb-fallback": "1",
    },
  });
}

/**
 * Videy videos have no remote poster: their frame is a static file grabbed by the videy-thumbs
 * workflow (public/videy-thumbs/<id>.jpg). /thumb/<id> (e.g. /pemilik "Upload terbaru") serves
 * that file through the static assets binding instead of the brand placeholder.
 */
async function videyStatic(id: string, request: Request): Promise<Response | null> {
  if (!/^[A-Za-z0-9]{4,40}$/.test(id)) return null;
  try {
    const mod = (await import("cloudflare:workers")) as { env?: { ASSETS?: { fetch: (r: Request | string) => Promise<Response> } } };
    const assets = mod.env?.ASSETS;
    if (!assets) return null;
    const res = await assets.fetch(new Request(new URL(`/videy-thumbs/${id}.jpg`, request.url).toString()));
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 800 || sniffType(buf) !== "image/jpeg") return null;
    return imageResponse(buf, "image/jpeg");
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/thumb/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const id = String(params.id || "").replace(/\.(jpg|jpeg|webp|png)$/i, "");
          if (!id) return new Response(null, { status: 404 });
          let hit: Response | null = null;
          try {
            hit = (await caches.default.match(request)) || null;
          } catch {
            hit = null;
          }
          if (hit) return hit;

          const bucket = await resolvePostersBucket().catch(() => null);
          const key = keyFor(id);
          if (bucket) {
            const saved = await bucket.get(key).catch(() => null);
            if (saved) {
              const res = imageResponse(saved.body, saved.httpMetadata?.contentType || "image/jpeg");
              try {
                await caches.default.put(request, res.clone());
              } catch {
                /* cache optional */
              }
              return res;
            }
          }

          const source = sourceFor(id);
          if (!source) {
            const vy = await videyStatic(id, request);
            if (!vy) return fallback(request);
            try {
              await caches.default.put(request, vy.clone());
            } catch {
              /* cache optional */
            }
            return vy;
          }
          const remote = await fetch(source, {
            headers: { "user-agent": "kdp-poster/1" },
            signal: AbortSignal.timeout(8000),
          }).catch(() => null);
          if (!remote?.ok) return fallback(request);
          const buf = await remote.arrayBuffer().catch(() => null);
          const type = buf ? sniffType(buf) : "";
          if (!buf || !type || buf.byteLength < 800) return fallback(request);
          if (bucket) {
            await bucket.put(key, buf, { httpMetadata: { contentType: type } }).catch(() => undefined);
          }
          const res = imageResponse(buf, type);
          try {
            await caches.default.put(request, res.clone());
          } catch {
            /* cache optional */
          }
          return res;
        } catch {
          return fallback(request);
        }
      },
    },
  },
});
