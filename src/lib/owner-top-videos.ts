/**
 * "Video terpopuler hari ini" for the owner panel: /watch/<id> paths only,
 * enriched with titles from the in-memory catalog (no extra DB query).
 */
import type { TopVideo } from "@/lib/owner-analytics-shared";

const WATCH_PREFIX = "/watch/";
const TITLE_LOOKUP_TIMEOUT_MS = 1500;

/** Video id from a /watch/<id> path, or "" when the path is not a video page. */
export function watchIdFromPath(path: string): string {
  const p = (path || "").split("?")[0] || "";
  if (!p.startsWith(WATCH_PREFIX)) return "";
  const raw = p.slice(WATCH_PREFIX.length).replace(/\/+$/, "");
  if (!raw || raw.includes("/")) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Keep only /watch/<id> rows, merge duplicates (e.g. trailing slash), sort by views desc. */
export function toTopVideos(
  rows: { path: string; views: number; uniq?: number }[],
  limit = 20,
): TopVideo[] {
  const byId = new Map<string, TopVideo>();
  for (const r of rows) {
    const id = watchIdFromPath(r.path);
    if (!id) continue;
    const views = Math.max(0, Number(r.views) || 0);
    const unique = Math.max(0, Number(r.uniq) || 0);
    const cur = byId.get(id);
    if (cur) {
      cur.views += views;
      cur.unique = (cur.unique || 0) + unique;
    } else {
      byId.set(id, { id, path: `${WATCH_PREFIX}${encodeURIComponent(id)}`, views, unique: unique || undefined });
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.views - a.views || (b.unique || 0) - (a.unique || 0))
    .slice(0, limit);
}

/** Attach catalog titles (best effort; falls back to the id/slug). */
export async function withVideoTitles(videos: TopVideo[]): Promise<TopVideo[]> {
  if (!videos.length) return videos;
  try {
    const [{ runtime, toCard }, { loadItems }] = await Promise.all([
      import("@/lib/catalog/local-shared"),
      import("@/lib/catalog/local-cache"),
    ]);
    const bag =
      runtime.cache ??
      (await Promise.race([
        loadItems(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), TITLE_LOOKUP_TIMEOUT_MS)),
      ]));
    if (!bag) return videos;
    return videos.map((v) => {
      const item = bag.byId.get(v.id);
      if (!item) return v;
      try {
        const card = toCard(item, bag.posters, bag.videyNo);
        return { ...v, title: card.title || undefined, category: card.category || undefined };
      } catch {
        return v;
      }
    });
  } catch {
    return videos;
  }
}
