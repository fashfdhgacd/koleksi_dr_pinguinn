import { createFileRoute } from "@tanstack/react-router";
import posters from "@/lib/catalog/posters.json";
import javPosters from "@/lib/catalog/jav-posters.json";
import latestPosters from "../../data/latest-posters.json";
import folderBatch20261007 from "@/lib/catalog/folder-batch-20261007.json";
import itemOverrides from "@/lib/catalog/overrides.json";
import { resolvePostersBucket } from "@/lib/poster-r2";
import brandPosterDataUrl from "../../public/brand-poster.jpg?inline";

function sourceFor(id: string): string {
  const maps = [posters, javPosters, latestPosters] as Array<Record<string, string>>;
  for (const map of maps) {
    const url = map?.[id];
    if (typeof url === "string" && url.startsWith("http")) return url;
  }
  const ov = (itemOverrides as Record<string, { poster?: string }>)[id];
  if (ov && typeof ov.poster === "string" && ov.poster.startsWith("http")) return ov.poster;
  // Folder-ingest batches carry their poster on the item itself.
  for (const it of folderBatch20261007 as Array<{ id?: string; poster?: string }>) {
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
      "cache-control": "public, max-age=86400",
    },
  });
}

/**
 * No stored/remote poster (or the host is dead): serve the site's own brand poster
 * (public/brand-poster.jpg, inlined at build time) instead of a 404, so Google's video
 * indexing never sees an unreachable thumbnail. A Worker can't reliably fetch its own
 * hostname, hence the inline copy. Short cache + not saved to R2, so a real poster
 * added later still takes over.
 */
let fallbackBytes: Uint8Array | null = null;
function fallbackImage(): Uint8Array {
  if (!fallbackBytes) {
    const b64 = String(brandPosterDataUrl).split(",")[1] || "";
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    fallbackBytes = out;
  }
  return fallbackBytes;
}

async function fallback(_request: Request): Promise<Response> {
  try {
    const bytes = fallbackImage();
    if (bytes.byteLength > 800) {
      return new Response(bytes, {
        headers: {
          "content-type": "image/jpeg",
          "cache-control": "public, max-age=3600",
          "x-thumb-fallback": "1",
        },
      });
    }
  } catch {
    /* fall through */
  }
  return new Response(null, { status: 404 });
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
          if (!source) return fallback(request);
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
