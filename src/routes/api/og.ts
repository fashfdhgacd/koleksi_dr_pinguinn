import { createFileRoute } from "@tanstack/react-router";
import postersMap from "../../lib/catalog/posters.json";
import { queryCatalog } from "@/lib/catalog/service";

const EXTERNAL_IMAGE_ALLOW =
  /^(https?:\/\/)?([a-z0-9.-]*\.)?(embedan\.com|indoav\.app|userbokep\.com|streamtape\.com)\//i;
const SAME_ORIGIN_THUMB_PATHS = new Set([
  "/api/embed-thumb",
  "/api/puterin-thumb",
  "/api/tape-thumb",
  "/api/img-proxy",
]);
const POSTERS = postersMap as Record<string, string>;

function fail(): Response {
  return new Response(null, {
    status: 404,
    headers: { "cache-control": "public, max-age=60" },
  });
}

function allowedImageUrl(target: string, requestUrl: string): URL | null {
  if (!target) return null;

  if (EXTERNAL_IMAGE_ALLOW.test(target)) {
    try {
      const url = new URL(/^https?:\/\//i.test(target) ? target : `https://${target}`);
      return url.username || url.password ? null : url;
    } catch {
      return null;
    }
  }

  try {
    const requestOrigin = new URL(requestUrl).origin;
    const url = new URL(target, requestOrigin);
    if (url.origin !== requestOrigin || !SAME_ORIGIN_THUMB_PATHS.has(url.pathname)) return null;
    return url.username || url.password ? null : url;
  } catch {
    return null;
  }
}

async function fetchImage(target: string, requestUrl: string): Promise<Response | null> {
  const url = allowedImageUrl(target, requestUrl);
  if (!url) return null;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(7000),
      headers: {
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        referer: "https://tv1.indoav.app/",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;

    const finalUrl = new URL(res.url || url.toString());
    if (finalUrl.pathname === "/og.jpg") return null;

    const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!type.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 2000 || buf.byteLength > 10 * 1024 * 1024) return null;
    return new Response(buf, {
      status: 200,
      headers: {
        "content-type": type,
        "content-length": String(buf.byteLength),
        "cache-control": "public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000",
        "x-og": "1",
      },
    });
  } catch {
    return null;
  }
}

async function fallbackOg(requestUrl: string): Promise<Response> {
  try {
    const fallback = await fetch(new URL("/og.jpg", requestUrl), {
      signal: AbortSignal.timeout(4000),
    });
    if (fallback.ok) {
      const buf = await fallback.arrayBuffer();
      if (buf.byteLength > 2000) {
        return new Response(buf, {
          status: 200,
          headers: {
            "content-type": "image/jpeg",
            "content-length": String(buf.byteLength),
            "cache-control": "public, max-age=3600",
            "x-og": "fallback",
          },
        });
      }
    }
  } catch {
    /* keep 404 */
  }
  return fail();
}

export const Route = createFileRoute("/api/og")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id")?.trim() || "";
        if (!id) return fallbackOg(request.url);
        if (!/^[A-Za-z0-9_-]{3,64}$/.test(id)) return fail();

        const mapped = POSTERS[id];
        if (typeof mapped === "string") {
          const hit = await fetchImage(mapped, request.url);
          if (hit) return hit;
        }

        try {
          const res = await queryCatalog({ type: "detail", id });
          if (res.ok && res.type === "detail") {
            const hit = await fetchImage(String(res.item.thumbnail || ""), request.url);
            if (hit) return hit;
          }
        } catch {
          /* use fallback */
        }

        return fallbackOg(request.url);
      },
    },
  },
});
