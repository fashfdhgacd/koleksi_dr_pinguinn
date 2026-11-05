/**
 * Crawlable pagination paths (/halaman/2), the same shape as a genre-site pager.
 * Page 1 is the bare URL. Search results keep ?page= because those URLs are noindex.
 */

export function homeHref(page: number): string {
  return page > 1 ? `/halaman/${page}` : "/";
}

export function categoryHref(slug: string, page: number, periode?: string | null): string {
  const base = page > 1 ? `/kategori/${encodeURIComponent(slug)}/halaman/${page}` : `/kategori/${encodeURIComponent(slug)}`;
  return periode ? `${base}?periode=${encodeURIComponent(periode)}` : base;
}

export function cariHref(slug: string, page: number): string {
  return page > 1 ? `/cari/${encodeURIComponent(slug)}/halaman/${page}` : `/cari/${encodeURIComponent(slug)}`;
}

/** Path segment for /halaman/N. Page 1 is not a halaman URL. */
export function parseHalamanParam(raw: string | undefined | null): number | null {
  if (!/^[1-9]\d{0,4}$/.test(String(raw || ""))) return null;
  const n = Number(raw);
  return n >= 2 ? n : null;
}

/**
 * 301 target for legacy ?page= and for /halaman/1. Null means leave the request alone.
 * `q` (site search) is not rewritten.
 */
export function legacyPageRedirect(pathname: string, search = ""): string | null {
  const url = new URL(pathname + (search || ""), "https://koleksidrpinguin.com");
  const path = url.pathname.replace(/\/+$/, "") || "/";

  const homeHal = /^\/halaman\/([1-9]\d*)$/.exec(path);
  if (homeHal && Number(homeHal[1]) < 2) return "/";

  const nested = /^\/(kategori|cari)\/([^/]+)\/halaman\/([1-9]\d*)$/.exec(path);
  if (nested && Number(nested[3]) < 2) {
    url.searchParams.delete("page");
    const qs = url.searchParams.toString();
    return `/${nested[1]}/${nested[2]}${qs ? `?${qs}` : ""}`;
  }

  const pageRaw = url.searchParams.get("page");
  if (!pageRaw || url.searchParams.get("q")) return null;
  if (!/^[1-9]\d{0,4}$/.test(pageRaw)) return null;
  const n = Number(pageRaw);
  url.searchParams.delete("page");
  const qs = url.searchParams.toString();
  const tail = qs ? `?${qs}` : "";
  if (n === 1) return `${path}${tail}`;
  if (path === "/") return `/halaman/${n}${tail}`;
  const cat = /^\/kategori\/([^/]+)$/.exec(path);
  if (cat) return `/kategori/${cat[1]}/halaman/${n}${tail}`;
  const cari = /^\/cari\/([^/]+)$/.exec(path);
  if (cari) return `/cari/${cari[1]}/halaman/${n}${tail}`;
  return null;
}
