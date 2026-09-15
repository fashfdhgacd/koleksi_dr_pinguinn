import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy poster Puterin/Putarin tanpa PUTARIN_API_KEY.
 * Dekripsi config player (AES-GCM) dari halaman embed, lalu redirect ke image.
 */

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

async function fetchPuterinPoster(code: string): Promise<string | null> {
  const embedUrls = [
    `https://puterin.biz/e/${encodeURIComponent(code)}`,
    `https://panel.putarin.com/e/${encodeURIComponent(code)}`,
  ];

  for (const embedUrl of embedUrls) {
    try {
      const page = await fetch(embedUrl, {
        headers: {
          accept: "text/html",
          "user-agent": "Mozilla/5.0 (compatible; kdp-thumb/1.0)",
        },
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });
      if (!page.ok) continue;
      const html = await page.text();
      const m = html.match(/window\.__PX=(\{.*?\});/);
      if (!m) continue;
      const px = JSON.parse(m[1]) as { n?: string; d?: string };
      if (!px.n || !px.d) continue;

      const pkRes = await fetch(
        new URL(`/api/pk?n=${encodeURIComponent(px.n)}`, embedUrl).toString(),
        {
          headers: {
            "user-agent": "Mozilla/5.0 (compatible; kdp-thumb/1.0)",
            referer: embedUrl,
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!pkRes.ok) continue;
      const keyHex = (await pkRes.text()).trim();
      if (keyHex.length < 64) continue;

      const raw = Buffer.from(px.d, "base64");
      const iv = raw.subarray(0, 12);
      const ct = raw.subarray(12);
      const key = Buffer.from(keyHex, "hex");

      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        key,
        { name: "AES-GCM" },
        false,
        ["decrypt"],
      );
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, ct);
      const player = JSON.parse(new TextDecoder().decode(plain)) as { image?: string };
      const image = String(player.image || "").trim();
      if (image.startsWith("http")) return decodeEntities(image);
    } catch {
      /* try next host */
    }
  }
  return null;
}

export const Route = createFileRoute("/api/puterin-thumb")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id")?.trim() || "";
        if (!id || !/^[A-Za-z0-9_-]{4,64}$/.test(id)) {
          return new Response(TRANSPARENT_GIF, {
            status: 400,
            headers: {
              "content-type": "image/gif",
              "cache-control": "private, no-store",
            },
          });
        }

        const poster = await fetchPuterinPoster(id);
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
            "cache-control": "public, max-age=300",
          },
        });
      },
    },
  },
});
