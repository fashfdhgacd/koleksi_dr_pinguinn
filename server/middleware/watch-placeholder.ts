/**
 * URL template /watch/$id (atau /watch/:id, /watch/{id}) yang sempat terindeks → 404 + noindex.
 */
interface WatchPlaceholderEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

const PLACEHOLDER_RE = /^\/(watch|v)\/(\$id|%24id|:id|\{id\}|%7bid%7d)\/?$/i;

export default function watchPlaceholderMiddleware(
  event: WatchPlaceholderEvent,
  next: () => unknown | Promise<unknown>,
): unknown {
  if (!PLACEHOLDER_RE.test(event.url.pathname)) return next();
  return new Response("Not Found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-robots-tag": "noindex, nofollow",
      "cache-control": "public, max-age=86400",
    },
  });
}
