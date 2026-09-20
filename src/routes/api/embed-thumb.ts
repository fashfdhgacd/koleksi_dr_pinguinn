import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy poster IndoAV / UserBokep.
 * Browser tidak hit embedan.com langsung (AdBlock / hotlink sering ganti jadi
 * gambar "Please watch www.indoav.com" atau gagal load).
 */

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

function hostsFor(src: string): string[] {
  if (src === "userbokep") return ["https://tv1.userbokep.com", "https://tv1.indoav.app"];
  if (src === "indoav") return ["https://tv1.indoav.app", "https://tv1.userbokep.com"];
  return ["https://tv1.indoav.app", "https://tv1.userbokep.com"];
}

async function fetchEmbedPoster(
  code: string,
  src: string,
): Promise<{ url: string; referer: string } | null> {
  for (const host of hostsFor(src)) {
    try {
      const embedUrl = `${host}/e/${encodeURIComponent(code)}`;
      const page = await fetch(embedUrl, {
        headers: {
          accept: "text/html",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(5000),
        redirect: "follow",
      });
      if (!page.ok) continue;
      const html = await page.text();
      const m =
        html.match(/poster=["'](https?:\/\/[^"']+)["']/i) ||
        html.match(/property=["']og:image["']\s+content=["'](https?:\/\/[^"']+)["']/i) ||
        html.match(/content=["'](https?:\/\/[^"']+)["']\s+property=["']og:image["']/i);
      const url = m?.[1]?.replace(/&amp;/g, "&").trim();
      if (url && url.startsWith("http") && !/indoav\.com|please.?watch/i.test(url)) {
        return { url, referer: embedUrl };
      }
    } catch {
      /* coba host berikutnya */
    }
  }
  return null;
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
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "image/webp").split(";")[0].trim();
    if (!type.startsWith("image/")) return null;
    const body = await res.arrayBuffer();
    if (body.byteLength < 800) return null;
    return { body, type };
  } catch {
    return null;
  }
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
            headers: {
              "content-type": "image/gif",
              "cache-control": "private, no-store",
            },
          });
        }

        const found = await fetchEmbedPoster(id, src);
        if (found) {
          const img = await fetchPosterBytes(found.url, found.referer);
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
          status: 200,
          headers: {
            "content-type": "image/gif",
            "cache-control": "public, max-age=300, stale-while-revalidate=3600",
          },
        });
      },
    },
  },
});
