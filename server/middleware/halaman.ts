/**
 * Legacy ?page=N on the home, a category, or a /cari landing → /halaman/N (301).
 * /halaman/1 collapses to the bare URL. Site search (?q=) is left alone.
 */
import { legacyPageRedirect } from "../../src/lib/catalog/halaman";

interface HalamanEvent {
  url: URL;
  req: { method: string };
}

export default function halamanMiddleware(
  event: HalamanEvent,
  next: () => unknown | Promise<unknown>,
): unknown | Promise<unknown> {
  const method = (event.req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return next();
  const target = legacyPageRedirect(event.url.pathname, event.url.search);
  if (!target || target === `${event.url.pathname}${event.url.search}`) return next();
  return new Response(null, {
    status: 301,
    headers: {
      location: `https://koleksidrpinguin.com${target}`,
      "cache-control": "public, max-age=3600",
    },
  });
}
