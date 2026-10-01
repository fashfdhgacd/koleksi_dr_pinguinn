import { createFileRoute } from "@tanstack/react-router";
import posters from "@/lib/catalog/posters.json";
import javPosters from "@/lib/catalog/jav-posters.json";
import latestPosters from "../../data/latest-posters.json";
import { resolvePostersBucket } from "@/lib/poster-r2";

const MAX_BYTES = 80_000;

function sourceFor(id: string): string {
  const maps = [posters, javPosters, latestPosters] as Array<Record<string, string>>;
  for (const map of maps) {
    const url = map?.[id];
    if (typeof url === "string" && url.startsWith("http")) return url;
  }
  return "";
}

function keyFor(id: string): string {
  return `posters/w480/${id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80)}`;
}

function imageResponse(body: BodyInit, type = "image/jpeg"): Response {
  return new Response(body, {
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

async function fetchSmall(source: string): Promise<{ buf: ArrayBuffer; type: string } | null> {
  const attempts = [
    fetch(source, {
      headers: { "user-agent": "kdp-poster/1", referer: "https://tv1.indoav.app/" },
      signal: AbortSignal.timeout(12000),
      cf: { image: { width: 480, height: 270, fit: "cover", quality: 65, format: "jpeg" } },
    } as RequestInit),
    fetch(source, {
      headers: { "user-agent": "kdp-poster/1", referer: "https://tv1.indoav.app/" },
      signal: AbortSignal.timeout(12000),
    }),
  ];
  for (const pending of attempts) {
    const remote = await pending.catch(() => null);
    if (!remote?.ok) continue;
    const type = remote.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) continue;
    const buf = await remote.arrayBuffer();
    if (buf.byteLength < 800 || buf.byteLength > 1_500_000) continue;
    return { buf, type: type.includes("jpeg") ? "image/jpeg" : type };
  }
  return null;
}

export const Route = createFileRoute("/thumb/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const id = String(params.id || "").replace(/\.(jpg|jpeg|webp|png)$/i, "");
        if (!id) return new Response("kosong", { status: 404 });
        const cache = caches.default;
        const hit = await cache.match(request);
        if (hit) return hit;

        const bucket = await resolvePostersBucket();
        const key = keyFor(id);
        if (bucket) {
          const saved = await bucket.get(key);
          if (saved) {
            const res = imageResponse(saved.body, saved.httpMetadata?.contentType || "image/jpeg");
            await cache.put(request, res.clone());
            return res;
          }
        }

        const source = sourceFor(id);
        if (!source) return new Response("tidak ada", { status: 404 });
        const small = await fetchSmall(source);
        if (!small) return new Response("gagal", { status: 404 });
        if (bucket && small.buf.byteLength <= MAX_BYTES * 4) {
          await bucket.put(key, small.buf, { httpMetadata: { contentType: small.type } }).catch(() => undefined);
        }
        const res = imageResponse(small.buf, small.type);
        await cache.put(request, res.clone());
        return res;
      },
    },
  },
});
