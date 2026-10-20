const KEY = "kdp:last-catalog";
/** Scroll position + router history index of that grid at the card click (sessionStorage). */
const POS_KEY = "kdp:last-catalog-pos";
/** Set by the "Kembali ke katalog" link right before a full load of the grid: scroll to restore. */
const RESTORE_KEY = "kdp:catalog-restore";

type Pos = { path: string; y: number; idx: number | null };

function historyIndex(): number | null {
  try {
    const n = Number((window.history.state as { __TSR_index?: unknown } | null)?.__TSR_index);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function readPos(key: string): Pos | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(key) || "null") as Pos | null;
    return p && isSafeCatalogPath(p.path) && Number.isFinite(p.y) ? p : null;
  } catch {
    return null;
  }
}

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
    // A click on the grid itself: also keep where the visitor was on it.
    if (typeof href !== "string" || !href) {
      const pos: Pos = { path, y: Math.round(window.scrollY || 0), idx: historyIndex() };
      sessionStorage.setItem(POS_KEY, JSON.stringify(pos));
    }
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

/**
 * "Kembali ke katalog": when the grid is the previous history entry of this tab (watch page opened
 * straight from it), go back so the router restores the exact page and scroll. Otherwise the caller
 * loads `href`, and the grid scrolls to the saved position once it renders (restoreCatalogScroll).
 * Returns true when it went back.
 */
export function backToCatalog(href: string): boolean {
  if (typeof window === "undefined") return false;
  const pos = readPos(POS_KEY);
  if (!pos || pos.path !== href) return false;
  const idx = historyIndex();
  if (pos.idx != null && idx != null && idx === pos.idx + 1) {
    window.history.back();
    return true;
  }
  try {
    sessionStorage.setItem(RESTORE_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
  return false;
}

/** Called by the catalog grid after it renders: scrolls to the position "Kembali" asked for, once. */
export function restoreCatalogScroll(): void {
  if (typeof window === "undefined") return;
  const pos = readPos(RESTORE_KEY);
  if (!pos) return;
  try {
    sessionStorage.removeItem(RESTORE_KEY);
  } catch {
    /* ignore */
  }
  if (pos.path !== `${window.location.pathname}${window.location.search}`) return;
  requestAnimationFrame(() => window.scrollTo(0, pos.y));
}
