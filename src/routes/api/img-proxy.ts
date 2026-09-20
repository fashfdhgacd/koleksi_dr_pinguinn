import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy poster embedan.com dengan Referer IndoAV.
 * Gagal = 404 pendek, JANGAN 302 ke brand-poster (itu ter-cache sebagai poster).
 */

const ALLOW = /^(https?:\/\/)?([a-z0-9.-]*\.)?(embedan\.com)\//i;

function fail(): Response {
  return new Response(null, {
    status: 404,
    headers: { "cache-control": "public, max-age=30" },
  });
}

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
        if (!target || !ALLOW.test(target)) return fail();
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
          if (!res.ok) return fail();
          const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
          if (!type.startsWith("image/")) return fail();
          const buf = await res.arrayBuffer();
          if (!buf.byteLength || buf.byteLength < 2000) return fail();
          return new Response(buf, {
            status: 200,
            headers: {
              "content-type": type,
              "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
              "x-proxy": "embedan",
            },
          });
        } catch {
          return fail();
        }
      },
    },
  },
});
