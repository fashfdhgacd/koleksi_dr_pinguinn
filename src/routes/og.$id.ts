import { createFileRoute } from "@tanstack/react-router";
import { resolvePostersBucket } from "@/lib/poster-r2";
import { isJpegBytes, toJpeg } from "@/lib/to-jpeg";
import { cleanPosterId, loadPosterBuffer, ogJpegKey } from "./thumb.$id";

const JPEG_CACHE = "public, max-age=2592000, stale-while-revalidate=604800";
const FALLBACK_CACHE = "public, max-age=300";

function jpegResponse(body: BodyInit, cache = JPEG_CACHE, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "image/jpeg", "cache-control": cache, ...extra },
  });
}

/** Brand JPEG as a 200 (not a redirect) so card crawlers always get an image. */
async function brandJpeg(request: Request): Promise<Response> {
  try {
    const mod = (await import("cloudflare:workers")) as { env?: { ASSETS?: { fetch: (r: Request | string) => Promise<Response> } } };
    const assets = mod.env?.ASSETS;
    if (assets) {
      for (const path of ["/og-v2.jpg", "/brand-poster-6x5.jpg", "/og.jpg"]) {
        const res = await assets.fetch(new Request(new URL(path, request.url).toString()));
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        if (!isJpegBytes(buf)) continue;
        return jpegResponse(buf, FALLBACK_CACHE, { "x-og-fallback": "1" });
      }
    }
  } catch {
    /* use redirect */
  }
  return new Response(null, {
    status: 302,
    headers: { location: new URL("/og-v2.jpg?v=14", request.url).toString(), "cache-control": FALLBACK_CACHE, "x-og-fallback": "1" },
  });
}

export const Route = createFileRoute("/og/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const id = cleanPosterId(params.id || "");
          if (!id || !/^[A-Za-z0-9_-]{3,64}$/.test(id)) return brandJpeg(request);
          let hit: Response | null = null;
          try {
            hit = (await caches.default.match(request)) || null;
          } catch {
            hit = null;
          }
          if (hit) {
            const type = (hit.headers.get("content-type") || "").toLowerCase();
            if (hit.status === 200 && type.includes("jpeg")) return hit;
          }

          const key = ogJpegKey(id);
          const bucket = key ? await resolvePostersBucket().catch(() => null) : null;
          if (bucket && key) {
            const saved = await bucket.get(key).catch(() => null);
            if (saved) {
              const buf = await saved.arrayBuffer();
              if (isJpegBytes(buf)) {
                const res = jpegResponse(buf);
                try {
                  await caches.default.put(request, res.clone());
                } catch {
                  /* cache optional */
                }
                return res;
              }
            }
          }

          const loaded = await loadPosterBuffer(id, request);
          const jpeg = loaded ? await toJpeg(loaded.buf) : null;
          if (!jpeg) return brandJpeg(request);
          if (bucket && key) {
            await bucket.put(key, jpeg, { httpMetadata: { contentType: "image/jpeg" } }).catch(() => undefined);
          }
          const res = jpegResponse(jpeg);
          try {
            await caches.default.put(request, res.clone());
          } catch {
            /* cache optional */
          }
          return res;
        } catch {
          return brandJpeg(request);
        }
      },
    },
  },
});
