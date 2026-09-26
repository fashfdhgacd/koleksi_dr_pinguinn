const KEY = "kdp:last-catalog";

function isSafeCatalogPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("://") || path.includes("\\")) return false;
  if (path.startsWith("/watch") || path.startsWith("/api") || path.startsWith("/pemilik")) return false;
  return path === "/" || path.startsWith("/?") || path.startsWith("/kategori/");
}

export function rememberCatalog(href?: string): void {
  if (typeof window === "undefined") return;
  const path = href || `${window.location.pathname}${window.location.search}`;
  if (!isSafeCatalogPath(path)) return;
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
    if (isSafeCatalogPath(raw)) return raw;
  } catch {
    /* ignore */
  }
  return fallback.startsWith("/") ? fallback : "/";
}
