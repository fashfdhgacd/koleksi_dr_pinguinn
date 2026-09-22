import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy poster Puterin/Putarin tanpa PUTARIN_API_KEY.
 * Dekripsi config player, ambil JPEG, kirim byte — jangan 302 ke anipop
 * (hotlink/CF 403 di browser).
 */

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function decodeEntities(s: string): string {
  return s
    .replace(/\u0026amp;/g, "\u0026")
    .replace(/\u0026#039;/g, "'")
    .replace(/\u0026quot;/g, '"')
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
        headers: { accept: "text/html", "user-agent": UA },
        signal: AbortSignal.timeout(5000),
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
          headers: { "user-agent": UA, referer: embedUrl },
          signal: AbortSignal.timeout(4000),
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

async function fetchPosterBytes(poster: string, referer: string): Promise<{ buf: ArrayBuffer; type: string } | null> {
  try {
    const res = await fetch(poster, {
      headers: {
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        referer,
        "user-agent": UA,
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!type.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    if (!buf.byteLength || buf.byteLength < 2000) return null;
    return { buf, type };
  } catch {
    return null;
  }
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
          const img =
            (await fetchPosterBytes(poster, "https://puterin.biz/")) ||
            (await fetchPosterBytes(poster, "https://panel.putarin.com/"));
          if (img) {
            return new Response(img.buf, {
              status: 200,
              headers: {
                "content-type": img.type,
                "content-length": String(img.buf.byteLength),
                "cache-control":
                  "public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000",
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
