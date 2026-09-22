/**
 * Cache-Control untuk aset statis + HTML.
 * Browser yang patuh tidak nembak Worker lagi — itu yang hemat kuota.
 * Cache API di dalam Worker TETAP dihitung request.
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

export default async function cacheHeadersMiddleware(
  event: CacheEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const result = await next();
  if (!(result instanceof Response)) return result;

  const path = event.url.pathname;
  const type = result.headers.get("content-type") || "";
  const headers = new Headers(result.headers);

  if (isHashedAsset(path)) {
    headers.set("cache-control", "public, max-age=31536000, immutable");
  } else if (isStaticMedia(path)) {
    headers.set("cache-control", "public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000");
  } else if (type.includes("text/html") && !headers.get("cache-control")) {
    headers.set("cache-control", "public, max-age=60, s-maxage=120, stale-while-revalidate=600");
  } else {
    return result;
  }

  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers,
  });
}
