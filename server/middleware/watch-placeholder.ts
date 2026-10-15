/**
 * URL template /watch/$id (atau /watch/:id, /watch/{id}) yang sempat terindeks → 404 + noindex.
 * Hidden ids (minor/school-themed content, see src/lib/catalog/hidden-ids.js) → 410 Gone + noindex
 * (video tidak dihapus, cuma disembunyikan; 410 bikin Google cepat buang URL-nya).
 * Template /kategori/$slug yang bocor dari manifest router → 410.
 * Trailing slash (mis. /kategori/) → satu kali 301 ke versi tanpa slash.
 */
import { isPublicHidden } from "../../src/lib/catalog/local-cache";

interface WatchPlaceholderEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

const PLACEHOLDER_RE = /^\/(watch|v)\/(\$id|%24id|:id|\{id\}|%7bid%7d)\/?$/i;
const CAT_PLACEHOLDER_RE = /^\/kategori\/(\$slug|%24slug|:slug|\{slug\}|%7bslug%7d)\/?$/i;
const WATCH_ID_RE = /^\/(?:watch|v)\/([A-Za-z0-9_-]{3,64})\/?$/;

function notFound(status = 404): Response {
  return new Response(status === 410 ? "Gone" : "Not Found", {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-robots-tag": "noindex, nofollow",
      "cache-control": "public, max-age=3600",
    },
  });
}

export default async function watchPlaceholderMiddleware(
  event: WatchPlaceholderEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  let malformed = false;
  try {
    decodeURIComponent(event.url.pathname);
  } catch {
    malformed = true;
  }
  if (malformed) {
    return new Response("Bad Request", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" },
    });
  }
  const path = event.url.pathname;
  if (PLACEHOLDER_RE.test(path)) return notFound();
  if (CAT_PLACEHOLDER_RE.test(path)) return notFound(410);
  if (
    path.length > 1 &&
    path.endsWith("/") &&
    !path.startsWith("/api/") &&
    (event.req.method === "GET" || event.req.method === "HEAD")
  ) {
    const clean = path.replace(/\/+$/, "") || "/";
    return new Response(null, {
      status: 301,
      headers: { location: `https://koleksidrpinguin.com${clean}${event.url.search}` },
    });
  }
  const m = event.url.pathname.match(WATCH_ID_RE);
  if (m) {
    try {
      if (await isPublicHidden(m[1])) return notFound(410);
    } catch {
      /* catalog unavailable: let the page decide */
    }
  }
  return next();
}
