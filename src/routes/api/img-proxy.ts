import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy poster host yang diizinkan. Bukan open proxy.
 * Gagal = 404 pendek, jangan 302 ke brand-poster.
 */

const ALLOWED_HOSTS = new Set([
  "embedan.com",
  "a.embedan.com",
  "i.embedan.com",
  "tv1.indoav.app",
  "indoav.app",
  "tv1.userbokep.com",
  "userbokep.com",
  "streamtape.com",
  "koleksidrpinguin.com",
  "koleksi-dr-pinguinn.readmi559.workers.dev",
]);

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 400;
const hits = new Map<string, { n: number; t: number }>();

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cur = hits.get(ip);
  if (!cur || now - cur.t > RATE_WINDOW_MS) {
    hits.set(ip, { n: 1, t: now });
    if (hits.size > 4000) {
      for (const [k, v] of hits) {
        if (now - v.t > RATE_WINDOW_MS) hits.delete(k);
      }
    }
    return false;
  }
  cur.n += 1;
  return cur.n > RATE_MAX;
}

function hostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (ALLOWED_HOSTS.has(host)) return true;
  if (host.endsWith(".embedan.com")) return true;
  if (host.endsWith(".indoav.app")) return true;
  if (host.endsWith(".userbokep.com")) return true;
  if (host.endsWith(".streamtape.com")) return true;
  return false;
}

function fail(status = 404): Response {
  return new Response(null, {
    status,
    headers: { "cache-control": "public, max-age=30" },
  });
}

export const Route = createFileRoute("/api/img-proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (rateLimited(clientIp(request))) return fail(429);

        const raw = new URL(request.url).searchParams.get("u")?.trim() || "";
        let target = "";
        try {
          target = decodeURIComponent(raw);
        } catch {
          target = raw;
        }
        if (!target) return fail();
        if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

        let parsed: URL;
        try {
          parsed = new URL(target);
        } catch {
          return fail();
        }
        if (parsed.username || parsed.password) return fail();
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return fail();
        if (!hostAllowed(parsed.hostname)) return fail();

        try {
          const res = await fetch(parsed.toString(), {
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
          const finalHost = new URL(res.url || parsed.toString()).hostname;
          if (!hostAllowed(finalHost)) return fail();
          const type = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
          if (!type.startsWith("image/")) return fail();
          const buf = await res.arrayBuffer();
          if (!buf.byteLength || buf.byteLength < 2000) return fail();
          return new Response(buf, {
            status: 200,
            headers: {
              "content-type": type,
              "content-length": String(buf.byteLength),
              "cache-control": "public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000",
              "x-proxy": "allowlist",
            },
          });
        } catch {
          return fail();
        }
      },
    },
  },
});
