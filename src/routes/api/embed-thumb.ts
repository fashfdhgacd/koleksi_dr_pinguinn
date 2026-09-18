import { createFileRoute } from "@tanstack/react-router";

/**
 * Poster IndoAV / UserBokep dari atribut poster di halaman embed.
 * Video baru yang belum masuk posters.json tetap punya thumbnail.
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

async function fetchEmbedPoster(code: string, src: string): Promise<string | null> {
  for (const host of hostsFor(src)) {
    try {
      const embedUrl = `${host}/e/${encodeURIComponent(code)}`;
      const page = await fetch(embedUrl, {
        headers: {
          accept: "text/html",
          "user-agent": "Mozilla/5.0 (compatible; kdp-thumb/1.0)",
        },
        signal: AbortSignal.timeout(4000),
        redirect: "follow",
      });
      if (!page.ok) continue;
      const html = await page.text();
      const m =
        html.match(/poster=["'](https?:\/\/[^"']*embedan[^"']+)["']/i) ||
        html.match(/poster=["'](https?:\/\/[^"']+\.(?:webp|jpg|jpeg|png)[^"']*)["']/i) ||
        html.match(/property=["']og:image["']\s+content=["'](https?:\/\/[^"']+)["']/i) ||
        html.match(/content=["'](https?:\/\/[^"']+)["']\s+property=["']og:image["']/i);
      const url = m?.[1]?.replace(/&/g, "&").trim();
      if (url && url.startsWith("http")) return url;
    } catch {
      /* coba host berikutnya */
    }
  }
  return null;
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

        const poster = await fetchEmbedPoster(id, src);
        if (poster) {
          return new Response(null, {
            status: 302,
            headers: {
              location: poster,
              "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
            },
          });
        }

        return new Response(TRANSPARENT_GIF, {
          status: 200,
          headers: {
            "content-type": "image/gif",
            "cache-control": "public, max-age=1800, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
