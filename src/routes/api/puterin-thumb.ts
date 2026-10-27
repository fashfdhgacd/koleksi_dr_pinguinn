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

import { fetchPosterBytes, fetchPuterinPoster } from "@/lib/puterin-poster";

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
