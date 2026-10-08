/**
 * Cache-Control + CDN-Cache-Control + Referrer-Policy + security headers.
 * Browser/CDN yang patuh tidak nembak Worker lagi.
 * Referrer-Policy: origin → IndoAV/UserBokep selalu dapat origin domain kita.
 *
 * Security headers (every Worker response):
 *  - Strict-Transport-Security: browsers stay on https for a year (no includeSubDomains/preload).
 *  - X-Content-Type-Options: nosniff.
 *  - X-Frame-Options: SAMEORIGIN + CSP frame-ancestors 'self': other sites cannot frame our pages
 *    (clickjacking on /pemilik). This does NOT affect the video embeds/ads WE frame.
 *  - CSP `object-src 'none'; base-uri 'self'; frame-ancestors 'self'` only: no script-src/frame-src
 *    restrictions, so embeds, ads and analytics keep working.
 * 404 HTML: short cache + noindex (an id that appears a minute later must not stay 404 for an hour).
 */

const SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
};
const BASE_CSP = "object-src 'none'; base-uri 'self'; frame-ancestors 'self'";

interface CacheEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

function isStaticMedia(path: string): boolean {
  return /\.(?:jpe?g|png|webp|gif|ico|svg|woff2?)$/i.test(path);
}

function isHashedAsset(path: string): boolean {
  return path.startsWith("/assets/") && /\.(?:js|css|woff2?)$/i.test(path);
}

function withHeaders(res: Response, cacheValue?: string): Response {
  const headers = new Headers(res.headers);
  // Wajib: origin domain (koleksidrpinguin.com / .site) terdeteksi di host embed
  headers.set("referrer-policy", "origin");
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  if (!headers.has("content-security-policy")) headers.set("content-security-policy", BASE_CSP);
  if (cacheValue) {
    headers.set("cache-control", cacheValue);
    headers.set("cdn-cache-control", cacheValue);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export default async function cacheHeadersMiddleware(
  event: CacheEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const result = await next();
  if (!(result instanceof Response)) return result;

  const path = event.url.pathname;
  const type = result.headers.get("content-type") || "";

  // Owner dashboard + owner APIs: never cached (browser/CDN), never indexed. A cached /pemilik
  // HTML would keep pointing at the previous deploy's dashboard chunk.
  if (path === "/pemilik" || path.startsWith("/pemilik/") || path.startsWith("/api/owner")) {
    const res = withHeaders(result, "private, no-store, max-age=0");
    res.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
    return res;
  }
  if (isHashedAsset(path)) {
    return withHeaders(result, "public, max-age=31536000, immutable");
  }
  if (isStaticMedia(path)) {
    return withHeaders(
      result,
      "public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000",
    );
  }
  if (type.includes("text/html") && result.status === 404) {
    const res = withHeaders(result, "public, max-age=30, s-maxage=60");
    res.headers.set("x-robots-tag", "noindex, follow");
    return res;
  }
  if (
    type.includes("text/html") &&
    result.status === 200 &&
    (path.startsWith("/watch/") || path === "/kategori" || path.startsWith("/kategori/"))
  ) {
    return withHeaders(result, "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400");
  }
  if (type.includes("text/html") && !result.headers.get("cache-control")) {
    return withHeaders(result, "public, max-age=60, s-maxage=120, stale-while-revalidate=600");
  }
  // Semua response lain tetap dapat Referrer-Policy
  return withHeaders(result);
}
