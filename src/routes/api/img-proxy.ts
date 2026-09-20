import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy poster embedan.com dengan Referer IndoAV/UserBokep.
 * Tanpa ini, CDN sering kirim watermark "Please watch On Original Website".
 */

const ALLOW = /^(https?:\/\/)?([a-z0-9.-]*\.)?(embedan\.com)\//i;

export const Route = createFileRoute("/api/img-proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("u")?.trim() || "";
        let target = "";
        try {
          target = decodeURIComponent(raw);
        } catch {
          target = raw;
        }
        if (!target || !ALLOW.test(target)) {
          return new Response(null, {
            status: 302,
            headers: {
              location: "https://koleksidrpinguin.com/brand-poster.jpg",
              "cache-control": "public, max-age=3600",
            },
          });
        }

        try {
          const res = await fetch(target, {
            signal: AbortSignal.timeout(8000),
            headers: {
              accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
              referer: "https://tv1.indoav.app/",
              "user-agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            redirect: "follow",
          });
          if (!res.ok) {
            return new Response(null, {
              status: 302,
              headers: { location: "https://koleksidrpinguin.com/brand-poster.jpg" },
            });
          }
          const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
          if (!type.startsWith("image/")) {
            return new Response(null, {
              status: 302,
              headers: { location: "https://koleksidrpinguin.com/brand-poster.jpg" },
            });
          }
          const buf = await res.arrayBuffer();
          // File terlalu kecil / kosong → kemungkinan gagal
          if (!buf.byteLength || buf.byteLength < 800) {
            return new Response(null, {
              status: 302,
              headers: { location: "https://koleksidrpinguin.com/brand-poster.jpg" },
            });
          }
          return new Response(buf, {
            status: 200,
            headers: {
              "content-type": type,
              "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
              "x-proxy": "embedan",
            },
          });
        } catch {
          return new Response(null, {
            status: 302,
            headers: { location: "https://koleksidrpinguin.com/brand-poster.jpg" },
          });
        }
      },
    },
  },
});
