const KEY = "kdp:last-catalog";

export function rememberCatalog(href?: string): void {
  if (typeof window === "undefined") return;
  const path = href || `${window.location.pathname}${window.location.search}`;
  if (!path.startsWith("/")) return;
  if (path.startsWith("/watch")) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* ignore quota / private mode */
  }
}

export function lastCatalogHref(fallback = "/"): string {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(KEY) || "";
    if (raw.startsWith("/kategori/")) return raw;
    if (raw === "/" || raw.startsWith("/?")) return raw;
  } catch {
    /* ignore */
  }
  return fallback;
}
