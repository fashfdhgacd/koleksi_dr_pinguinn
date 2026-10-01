import { createFileRoute } from "@tanstack/react-router";
import posters from "@/lib/catalog/posters.json";
import javPosters from "@/lib/catalog/jav-posters.json";
import latestPosters from "../../data/latest-posters.json";
import { posterKey, resolvePostersBucket } from "@/lib/poster-r2";

function sourceFor(id: string): string {
  const maps = [posters, javPosters, latestPosters] as Array<Record<string, string>>;
  for (const map of maps) {
    const url = map?.[id];
    if (typeof url === "string" && url.startsWith("http")) return url;
  }
  return "";
}

function imageResponse(body: BodyInit, type = "image/jpeg"): Response {
  return new Response(body, {
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
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
        const key = posterKey(id);
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
        const remote = await fetch(source, {
          headers: { "user-agent": "kdp-poster/1", referer: "https://tv1.indoav.app/" },
          signal: AbortSignal.timeout(12000),
        }).catch(() => null);
        if (!remote?.ok) return new Response("gagal", { status: 404 });
        const type = remote.headers.get("content-type") || "image/jpeg";
        if (!type.startsWith("image/")) return new Response("bukan gambar", { status: 404 });
        const buf = await remote.arrayBuffer();
        if (buf.byteLength < 800) return new Response("kosong", { status: 404 });
        if (bucket) {
          await bucket.put(key, buf, { httpMetadata: { contentType: type } }).catch(() => undefined);
        }
        const res = imageResponse(buf, type);
        await cache.put(request, res.clone());
        return res;
      },
    },
  },
});
