/**
 * Cache-Control + CDN-Cache-Control + Referrer-Policy.
 * Browser/CDN yang patuh tidak nembak Worker lagi.
 * Referrer-Policy: origin → IndoAV/UserBokep selalu dapat origin domain kita.
 */

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

  if (isHashedAsset(path)) {
    return withHeaders(result, "public, max-age=31536000, immutable");
  }
  if (isStaticMedia(path)) {
    return withHeaders(
      result,
      "public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000",
    );
  }
  if (type.includes("text/html") && !result.headers.get("cache-control")) {
    return withHeaders(result, "public, max-age=60, s-maxage=120, stale-while-revalidate=600");
  }
  // Semua response lain tetap dapat Referrer-Policy
  return withHeaders(result);
}
