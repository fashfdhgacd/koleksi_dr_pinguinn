/**
 * URL template /watch/$id (atau /watch/:id, /watch/{id}) yang sempat terindeks → 404 + noindex.
 * Hidden ids (minor/school-themed content, see src/lib/catalog/hidden-ids.js) → real 404 + noindex.
 */
import { isPublicHidden } from "../../src/lib/catalog/local-cache";

interface WatchPlaceholderEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

const PLACEHOLDER_RE = /^\/(watch|v)\/(\$id|%24id|:id|\{id\}|%7bid%7d)\/?$/i;
const WATCH_ID_RE = /^\/(?:watch|v)\/([A-Za-z0-9_-]{3,64})\/?$/;

function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
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
  if (PLACEHOLDER_RE.test(event.url.pathname)) return notFound();
  const m = event.url.pathname.match(WATCH_ID_RE);
  if (m) {
    try {
      if (await isPublicHidden(m[1])) return notFound();
    } catch {
      /* catalog unavailable: let the page decide */
    }
  }
  return next();
}
