/**
 * Pure routing decisions for /watch/<id>, /v/<id>, and leaked router templates.
 * Hidden, blocked, or rejected videos are never resurrected: visitors are sent
 * into the site (302 + noindex) instead of a bare "Gone" body. Live or merged
 * ids still 301 to the public /watch page.
 */
export const SITE_ORIGIN = "https://koleksidrpinguin.com";

const PLACEHOLDER_RE = /^\/(watch|v)\/(\$id|%24id|:id|\{id\}|%7bid%7d)\/?$/i;
const CAT_PLACEHOLDER_RE = /^\/kategori\/(\$slug|%24slug|:slug|\{slug\}|%7bslug%7d)\/?$/i;
export const WATCH_ID_RE = /^\/(?:watch|v)\/([A-Za-z0-9_-]{3,64})\/?$/;

const GONE_CACHE = "public, max-age=3600";
const NOINDEX = "noindex, nofollow";

export type WatchIdInfo = {
  /** True when the public target (merged main if any, else this id) is hidden or blocked. */
  targetHidden: boolean;
  /** Merged main id when this id is a copy; null if not merged or not looked up. */
  main: string | null;
};

export type Decision =
  | { type: "next" }
  | { type: "redirect"; status: 301 | 302; location: string; robots?: string; cacheControl?: string };

export function decideWatchPlaceholder(
  pathname: string,
  method: string,
  search = "",
  info?: WatchIdInfo | null,
): Decision {
  if (PLACEHOLDER_RE.test(pathname)) {
    return goneTo(`${SITE_ORIGIN}/`);
  }
  if (CAT_PLACEHOLDER_RE.test(pathname)) {
    return goneTo(`${SITE_ORIGIN}/kategori`);
  }
  if (
    pathname.length > 1 &&
    pathname.endsWith("/") &&
    !pathname.startsWith("/api/") &&
    (method === "GET" || method === "HEAD")
  ) {
    const clean = pathname.replace(/\/+$/, "") || "/";
    return { type: "redirect", status: 301, location: `${SITE_ORIGIN}${clean}${search}` };
  }
  const m = pathname.match(WATCH_ID_RE);
  if (m && info) {
    const id = m[1];
    const main = info.main && info.main !== id ? info.main : null;
    if (info.targetHidden) {
      return goneTo(`${SITE_ORIGIN}/`);
    }
    if (main) {
      return {
        type: "redirect",
        status: 301,
        location: `${SITE_ORIGIN}/watch/${encodeURIComponent(main)}`,
        cacheControl: GONE_CACHE,
      };
    }
  }
  return { type: "next" };
}

export function decisionResponse(decision: Decision): Response | null {
  if (decision.type !== "redirect") return null;
  const headers: Record<string, string> = { location: decision.location };
  if (decision.robots) headers["x-robots-tag"] = decision.robots;
  if (decision.cacheControl) headers["cache-control"] = decision.cacheControl;
  return new Response(null, { status: decision.status, headers });
}

function goneTo(location: string): Decision {
  return {
    type: "redirect",
    status: 302,
    location,
    robots: NOINDEX,
    cacheControl: GONE_CACHE,
  };
}
