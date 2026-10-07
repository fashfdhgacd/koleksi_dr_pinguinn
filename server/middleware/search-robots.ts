/**
 * Halaman pencarian bukan konten.
 * Placeholder schema {search_term_string} diarahkan ke beranda.
 * Query sungguhan tetap jalan, tapi noindex.
 */
interface SearchEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

function isPlaceholder(q: string): boolean {
  const t = q.trim().toLowerCase();
  return (
    t === "{search_term_string}" ||
    t === "%7bsearch_term_string%7d" ||
    t === "search_term_string"
  );
}

export default function searchRobotsMiddleware(
  event: SearchEvent,
  next: () => unknown | Promise<unknown>,
): unknown | Promise<unknown> {
  if (event.url.pathname !== "/") return next();
  const q = event.url.searchParams.get("q");
  if (q == null || !q.trim()) return next();
  if (isPlaceholder(q)) {
    return new Response(null, {
      status: 301,
      headers: { location: "https://koleksidrpinguin.com/" },
    });
  }
  return Promise.resolve(next()).then((res) => {
    if (!(res instanceof Response)) return res;
    const headers = new Headers(res.headers);
    headers.set("x-robots-tag", "noindex, follow");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  });
}
