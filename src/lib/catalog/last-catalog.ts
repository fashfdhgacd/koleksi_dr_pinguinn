const KEY = "kdp:last-catalog";

function isSafeCatalogPath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("://") || path.includes("\\")) return false;
  if (path.startsWith("/watch") || path.startsWith("/api") || path.startsWith("/pemilik")) return false;
  return path === "/" || path.startsWith("/?") || path.startsWith("/kategori/");
}

export function rememberCatalog(href?: unknown): void {
  if (typeof window === "undefined") return;
  const path = (typeof href === "string" && href) || `${window.location.pathname}${window.location.search}`;
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
  return typeof fallback === "string" && fallback.startsWith("/") ? fallback : "/";
}
