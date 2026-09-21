import { createFileRoute } from "@tanstack/react-router";
import postersMap from "../../lib/catalog/posters.json";
import { queryCatalog } from "@/lib/catalog/service";

const ALLOW = /^(https?:\/\/)?([a-z0-9.-]*\.)?(embedan\.com)\//i;
const POSTERS = postersMap as Record<string, string>;

function fail(): Response {
  return new Response(null, {
    status: 404,
    headers: { "cache-control": "public, max-age=60" },
  });
}

async function fetchImage(target: string): Promise<Response | null> {
  if (!target || !ALLOW.test(target)) return null;
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
  try {
    const res = await fetch(target, {
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
    const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!type.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    if (!buf.byteLength || buf.byteLength < 2000) return null;
    return new Response(buf, {
      status: 200,
      headers: {
        "content-type": type.startsWith("image/webp") ? "image/webp" : type,
        "content-length": String(buf.byteLength),
        "cache-control": "public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000",
        "x-og": "1",
      },
    });
  } catch {
    return null;
  }
}

async function fallbackOg(): Promise<Response> {
  try {
    const fallback = await fetch("https://koleksidrpinguin.com/og.jpg", {
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
        if (!id || !/^[A-Za-z0-9_-]{3,64}$/.test(id)) return fail();

        const mapped = POSTERS[id];
        if (typeof mapped === "string" && mapped.startsWith("http")) {
          const hit = await fetchImage(mapped);
          if (hit) return hit;
        }

        try {
          const res = await queryCatalog({ type: "detail", id });
          if (res.ok && res.type === "detail") {
            const thumb = String(res.item.thumbnail || "");
            const m = thumb.match(/[?&]u=([^&]+)/);
            if (m) {
              const raw = decodeURIComponent(m[1]);
              const hit = await fetchImage(raw);
              if (hit) return hit;
            }
          }
        } catch {
          /* next */
        }

        return fallbackOg();
      },
    },
  },
});
