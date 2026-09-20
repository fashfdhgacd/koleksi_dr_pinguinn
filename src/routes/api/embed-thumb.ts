import { createFileRoute } from "@tanstack/react-router";
import postersMap from "../../lib/catalog/posters.json";

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const POSTERS = postersMap as Record<string, string>;

function hostsFor(src: string): string[] {
  if (src === "userbokep") return ["https://tv1.userbokep.com", "https://tv1.indoav.app"];
  return ["https://tv1.indoav.app", "https://tv1.userbokep.com"];
}

async function fetchPosterBytes(url: string, referer: string): Promise<{ body: ArrayBuffer; type: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        referer,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(7000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "image/webp").split(";")[0].trim();
    if (!type.startsWith("image/")) return null;
    const body = await res.arrayBuffer();
    if (body.byteLength < 2000) return null;
    return { body, type };
  } catch {
    return null;
  }
}

async function scrapePosterUrl(code: string, src: string): Promise<{ url: string; referer: string } | null> {
  for (const host of hostsFor(src)) {
    try {
      const embedUrl = `${host}/e/${encodeURIComponent(code)}`;
      const page = await fetch(embedUrl, {
        headers: {
          accept: "text/html",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(4000),
        redirect: "follow",
      });
      if (!page.ok) continue;
      const html = await page.text();
      const m =
        html.match(/poster=["'](https?:\/\/[^"']*embedan[^"']+)["']/i) ||
        html.match(/poster=["'](https?:\/\/[^"']+\.(?:webp|jpg|jpeg|png)[^"']*)["']/i);
      const url = m?.[1]?.replace(/&/g, "&").trim();
      if (url?.startsWith("http") && !/please.?watch|indoav\.com\//i.test(url)) {
        return { url, referer: embedUrl };
      }
    } catch {
      /* next host */
    }
  }
  return null;
}

function mappedUrl(id: string): string {
  const v = POSTERS[id];
  return typeof v === "string" && v.startsWith("http") ? v : "";
}

export const Route = createFileRoute("/api/embed-thumb")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const id = u.searchParams.get("id")?.trim() || "";
        const src = (u.searchParams.get("src") || "").trim().toLowerCase();
        if (!id || !/^[A-Za-z0-9_-]{4,64}$/.test(id)) {
          return new Response(TRANSPARENT_GIF, {
            status: 400,
            headers: { "content-type": "image/gif", "cache-control": "private, no-store" },
          });
        }

        const referer =
          src === "userbokep"
            ? `https://tv1.userbokep.com/e/${encodeURIComponent(id)}`
            : `https://tv1.indoav.app/e/${encodeURIComponent(id)}`;

        const direct = mappedUrl(id);
        if (direct) {
          const img = await fetchPosterBytes(direct, referer);
          if (img) {
            return new Response(img.body, {
              status: 200,
              headers: {
                "content-type": img.type,
                "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
              },
            });
          }
        }

        const scraped = await scrapePosterUrl(id, src);
        if (scraped) {
          const img = await fetchPosterBytes(scraped.url, scraped.referer);
          if (img) {
            return new Response(img.body, {
              status: 200,
              headers: {
                "content-type": img.type,
                "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
              },
            });
          }
        }

        return new Response(TRANSPARENT_GIF, {
          status: 404,
          headers: {
            "content-type": "image/gif",
            "cache-control": "public, max-age=30",
          },
        });
      },
    },
  },
});
