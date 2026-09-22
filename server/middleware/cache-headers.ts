/**
 * Cache-Control + CDN-Cache-Control.
 * Browser/CDN yang patuh tidak nembak Worker lagi.
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

function withCache(res: Response, value: string): Response {
  const headers = new Headers(res.headers);
  headers.set("cache-control", value);
  headers.set("cdn-cache-control", value);
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
    return withCache(result, "public, max-age=31536000, immutable");
  }
  if (isStaticMedia(path)) {
    return withCache(
      result,
      "public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000",
    );
  }
  if (type.includes("text/html") && !result.headers.get("cache-control")) {
    return withCache(result, "public, max-age=60, s-maxage=120, stale-while-revalidate=600");
  }
  return result;
}
