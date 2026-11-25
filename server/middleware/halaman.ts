/**
 * Legacy ?page=N on the home, a category, or a /cari landing → /halaman/N (301).
 * /halaman/1 collapses to the bare URL. Site search (?q=) is left alone.
 */
import { categoryHref, legacyPageRedirect } from "../../src/lib/catalog/halaman.ts";
import { findCategory } from "../../src/lib/catalog/categories.ts";
import { localizedPath, type PublicLanguage } from "../../src/lib/public-locale.ts";

interface HalamanEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

export default function halamanMiddleware(
  event: HalamanEvent,
  next: () => unknown | Promise<unknown>,
): unknown | Promise<unknown> {
  const method = (event.req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return next();
  // Legacy category results still receive search traffic. Resolve the category before
  // the generic ?page handler can turn page 2 into page 2 of the entire catalog.
  const { pathname, searchParams } = event.url;
  if (["/", "/id", "/ms", "/en/home"].includes(pathname) && !searchParams.get("q")) {
    const category = findCategory(searchParams.get("category"));
    const page = searchParams.get("page");
    if (category && (!page || /^[1-9]\d{0,4}$/.test(page))) {
      const bare = pathname === "/";
      let language: PublicLanguage = pathname === "/id" ? "id" : pathname === "/en/home" ? "en" : "ms";
      if (bare) {
        const pref = /(?:^|;\s*)dp_lang=(id|en|ms)(?:;|$)/.exec(event.req.headers.get("cookie") || "")?.[1];
        if (pref === "id" || pref === "en") language = pref;
      }
      const query = new URLSearchParams(searchParams);
      query.delete("category");
      query.delete("page");
      const location = localizedPath(categoryHref(category.slug, Number(page) || 1), language);
      return new Response(null, {
        status: bare ? 302 : 301,
        headers: {
          location: location + (query.size ? "?" + query : ""),
          "cache-control": bare ? "private, no-store" : "public, max-age=3600",
          ...(bare ? { vary: "Cookie" } : {}),
        },
      });
    }
  }
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
