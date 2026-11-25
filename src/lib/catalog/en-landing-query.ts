import { excludedFromOverview } from "./overview-exclusions";
/**
 * Build /en landing grids once per catalog object (WeakMap), then paginate.
 * In-memory only: no KV writes, no per-visit work beyond a memoized scan.
 */
import { isSeoBlockedId } from "./seo-block";
import { isMinorContentTitle } from "./minor-detector.js";
import { LANDING_INDEX_PAGES, LANDING_MIN_VIDEOS, LANDING_PAGE_SIZE, OWN_CATALOG_SOURCES, hasBannedWord } from "./landing";
import { EN_LANDINGS, findEnLanding } from "./en-landing";
import { loadItems } from "./local-cache";
import { slugOf, sourceLabel, toCard, type RawItem } from "./local-shared";
import { titleTags } from "./title-tags";
import type { CatalogResponse, VideoCard } from "./types";

const memo = new WeakMap<object, Map<string, VideoCard[]>>();

function haystack(item: RawItem): string {
  const title = String(item.title || "");
  const primary = slugOf(item);
  const slugs = titleTags(title, primary);
  return `${title} ${primary} ${slugs.join(" ")}`;
}

function cardsForAllEn(
  items: RawItem[],
  posters: Record<string, string>,
  videyNo: Map<string, number>,
): Map<string, VideoCard[]> {
  const hit = memo.get(items);
  if (hit) return hit;
  const buckets = new Map<string, Array<{ card: VideoCard; i: number }>>();
  for (const def of EN_LANDINGS) buckets.set(def.slug, []);
  let i = 0;
  for (const item of items) {
    const label = sourceLabel(item);
    if (!OWN_CATALOG_SOURCES.has(label)) {
      i++;
      continue;
    }
    if (isSeoBlockedId(String(item.id || ""))) {
      i++;
      continue;
    }
    const title = String(item.title || "");
    if (!title || hasBannedWord(title) || excludedFromOverview(item.id, title) || isMinorContentTitle(title)) {
      i++;
      continue;
    }
    const hay = haystack(item);
    const card = toCard(item, posters, videyNo);
    for (const def of EN_LANDINGS) {
      if (def.match.test(hay)) buckets.get(def.slug)!.push({ card, i });
    }
    i++;
  }
  const out = new Map<string, VideoCard[]>();
  for (const def of EN_LANDINGS) {
    const rows = buckets.get(def.slug) || [];
    rows.sort((a, b) => (b.card.views || 0) - (a.card.views || 0) || a.i - b.i);
    out.set(def.slug, rows.map((r) => r.card));
  }
  memo.set(items, out);
  return out;
}

const totals = new WeakMap<Map<string, VideoCard[]>, number>();

export async function enCollectionVideoCount() {
  const cache = await loadItems();
  const all = cardsForAllEn(cache.items, cache.posters, cache.videyNo);
  const cached = totals.get(all);
  if (cached !== undefined) return cached;
  const ids = new Set<string>();
  for (const cards of all.values()) {
    if (cards.length >= LANDING_MIN_VIDEOS) for (const card of cards) ids.add(card.id);
  }
  totals.set(all, ids.size);
  return ids.size;
}

export async function enLandingCounts(): Promise<Map<string, number>> {
  const cache = await loadItems();
  const all = cardsForAllEn(cache.items, cache.posters, cache.videyNo);
  const counts = new Map<string, number>();
  for (const def of EN_LANDINGS) counts.set(def.slug, (all.get(def.slug) || []).length);
  return counts;
}

export async function listEnLandingPage(slug: string, page = 1): Promise<CatalogResponse> {
  const def = findEnLanding(slug);
  if (!def) return { ok: false, error: "Page not found.", code: "not_found" };
  const cache = await loadItems();
  const all = cardsForAllEn(cache.items, cache.posters, cache.videyNo).get(def.slug) || [];
  const total = all.length;
  const limit = LANDING_PAGE_SIZE;
  const last = Math.max(1, Math.ceil(total / limit) || 1);
  const safePage = Math.min(Math.max(1, page), last);
  const start = (safePage - 1) * limit;
  const items = all.slice(start, start + limit);
  return {
    ok: true,
    type: "landing",
    items,
    total,
    page: safePage,
    limit,
    hasMore: start + items.length < total,
  };
}

export async function indexableEnLandings(): Promise<Array<{ slug: string; pages: number }>> {
  const counts = await enLandingCounts();
  const out: Array<{ slug: string; pages: number }> = [];
  for (const def of EN_LANDINGS) {
    const total = counts.get(def.slug) || 0;
    if (total < LANDING_MIN_VIDEOS) continue;
    const pages = Math.min(LANDING_INDEX_PAGES, Math.max(1, Math.ceil(total / LANDING_PAGE_SIZE)));
    out.push({ slug: def.slug, pages });
  }
  return out;
}

