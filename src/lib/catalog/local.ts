import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { CATEGORY_LIST, MIN_LISTED_CATEGORY_COUNT, findCategory } from "./categories";
import type { CategoryInfo } from "./types";
import {
  type RawItem,
  isIndoAv,
  isUserBokep,
  isPutarin,
  isStreamtape,
  isVidey,
  slugOf,
  thumbOf,
  toCard,
} from "./local-shared";
import { runtime } from "./local-shared";
import { popularIds, tagOptions, titleTags } from "./title-tags";
import { normalizeSearchText, parseSearchQuery, scoreSearch } from "./search-rank";
import { isPublicHidden, isVideyNoThumbHidden, loadItems, pageOf, sortByNewest } from "./local-cache";
import type { CatalogCache } from "./local-shared";

export { loadItems } from "./local-cache";

const SLOT_MS = 5 * 60 * 1000;

function slotIndex(salt = 0): number {
  return Math.floor(Date.now() / SLOT_MS) + salt;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleSlot<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  const rnd = mulberry32(seed >>> 0);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/**
 * First `k` items of a seeded Fisher-Yates shuffle, skipping `excludeId`. Stops after `k` picks, so a
 * related/featured list costs ~k random draws instead of shuffling (and filtering) the whole catalog
 * on every /watch render.
 */
function pickShuffled(arr: RawItem[], seed: number, k: number, excludeId = ""): RawItem[] {
  const out: RawItem[] = [];
  if (k <= 0 || !arr.length) return out;
  const pool = arr.slice();
  const rnd = mulberry32(seed >>> 0);
  const n = pool.length;
  for (let i = 0; i < n && out.length < k; i++) {
    const j = i + Math.floor(rnd() * (n - i));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
    if (pool[i]!.id !== excludeId) out.push(pool[i]!);
  }
  return out;
}

type MixPools = { indo: RawItem[]; user: RawItem[]; plain: RawItem[] };
/** Source pools per catalog build (the cache object changes only on a rebuild). */
const mixPoolsMemo = new WeakMap<object, MixPools>();
function mixPools(items: RawItem[]): MixPools {
  let pools = mixPoolsMemo.get(items);
  if (!pools) {
    pools = { indo: [], user: [], plain: [] };
    for (const x of items) {
      if (isIndoAv(x)) pools.indo.push(x);
      else if (isUserBokep(x)) pools.user.push(x);
      if (!isVidey(x) && !isPutarin(x) && !isStreamtape(x)) pools.plain.push(x);
    }
    mixPoolsMemo.set(items, pools);
  }
  return pools;
}

function mixIndoHeavy(items: RawItem[], excludeId: string, limit: number, seed: number): RawItem[] {
  const pools = mixPools(items);
  const hasIndo = pools.indo.some((x) => x.id !== excludeId);
  const hasUser = pools.user.some((x) => x.id !== excludeId);
  if (!hasIndo && !hasUser) return pickShuffled(pools.plain, seed + 31, limit, excludeId);
  const nUserWant = Math.max(0, Math.round(limit * 0.15));
  const user = pickShuffled(pools.user, seed + 17, limit, excludeId);
  const nUser = Math.min(user.length, nUserWant);
  const indo = pickShuffled(pools.indo, seed, Math.max(0, limit - nUser), excludeId);
  const nIndo = indo.length;
  const fillUser = Math.min(user.length, limit - nIndo);
  const picked = [...indo, ...user.slice(0, fillUser)];
  if (picked.length < limit) {
    const seen = new Set(picked.map((x) => x.id));
    for (const x of pickShuffled(pools.plain, seed + 53, limit * 3 + seen.size, excludeId)) {
      if (seen.has(x.id)) continue;
      picked.push(x);
      seen.add(x.id);
      if (picked.length >= limit) break;
    }
  }
  return shuffleSlot(picked, seed + 71).slice(0, limit);
}

export async function listLatest(page = 1, limit = DEFAULT_PAGE_SIZE, _signal?: AbortSignal): Promise<PagedVideos> {
  const { terbaruSorted, posters, videyNo } = await loadItems();
  return pageOf(terbaruSorted, page, limit, posters, videyNo);
}

/**
 * Every shown video, newest first, all sources (incl. Videy and Byse/Dood/Lulu, which are not in
 * Terbaru). Used by the Telegram share pool when no category is given.
 */
export async function listAllNewest(page = 1, limit = DEFAULT_PAGE_SIZE): Promise<PagedVideos> {
  const { mainSorted, posters, videyNo } = await loadItems();
  return pageOf(mainSorted, page, limit, posters, videyNo);
}

/** Featured pool per (catalog build, 5-min slot, size): same for every request in the slot. */
const featuredMemo = new WeakMap<object, Map<string, RawItem[]>>();

export async function listFeatured(page = 1, limit = 8, _signal?: AbortSignal): Promise<PagedVideos> {
  const { items, posters, videyNo } = await loadItems();
  const seed = slotIndex(0);
  const want = Math.max(limit * 6, 48);
  let perBuild = featuredMemo.get(items);
  if (!perBuild) featuredMemo.set(items, (perBuild = new Map()));
  const memoKey = `${seed}:${want}:${limit}`;
  let pool = perBuild.get(memoKey);
  if (!pool) {
    pool = mixIndoHeavy(items, "", want, seed);
    const withArt = pool.filter((x) => Boolean(thumbOf(x, posters)));
    if (withArt.length >= limit) pool = withArt;
    if (perBuild.size > 16) perBuild.clear();
    perBuild.set(memoKey, pool);
  }
  const start = Math.max(0, (Math.max(1, page) - 1) * limit);
  const slice = pool.slice(start, start + limit);
  return {
    page: Math.max(1, page),
    limit,
    total: pool.length,
    hasMore: start + limit < pool.length,
    items: slice.map((x) => toCard(x, posters, videyNo)),
  };
}

export async function listHome(limit = DEFAULT_PAGE_SIZE): Promise<{ featured: VideoCard[]; latest: PagedVideos }> {
  const latest = await listLatest(1, limit);
  const featured = (await listFeatured(1, 8)).items;
  return { featured, latest };
}

export async function listCategory(
  category: string,
  page = 1,
  limit = DEFAULT_PAGE_SIZE,
  _signal?: AbortSignal,
): Promise<PagedVideos> {
  const cache = await loadItems();
  const { posters, videyNo } = cache;
  return pageOf(categoryPool(cache, category), page, limit, posters, videyNo);
}

/**
 * The list a category page shows (same pool for the page and for its count on /kategori):
 * mixed order (listOrder: bokep with inserted IndoAV, jav interleave) when there is one, else the
 * plain category. All lists are built once per catalog build, so this is a Map lookup.
 */
function categoryPool(cache: CatalogCache, category: string): RawItem[] {
  const { items, bySlug, mainSorted, listOrder } = cache;
  const s = category.toLowerCase().trim();
  const mixed = listOrder?.get(s === "streamtape" ? "ai-plus" : s);
  if (mixed && mixed.length) return mixed;
  if (s === "jav") {
    const hit = bySlug.get("jav");
    return hit && hit.length ? hit : items.filter(isPutarin);
  }
  if (s === "ai-plus" || s === "streamtape") {
    const hit = bySlug.get("ai-plus");
    return hit && hit.length ? hit : items.filter(isStreamtape);
  }
  if (s === "videy") return bySlug.get("videy") || items.filter(isVidey);
  return bySlug.get(s) || mainSorted.filter((x) => slugOf(x) === s);
}

/**
 * Newest-first items with their normalized search text, built once per catalog build (was: re-sorted
 * and re-normalized, ~8k titles, on every search request).
 */
const searchMemo = new WeakMap<object, { item: RawItem; hay: string }[]>();
function searchIndex(cache: CatalogCache): { item: RawItem; hay: string }[] {
  let rows = searchMemo.get(cache);
  if (!rows) {
    rows = sortByNewest(cache.haystack.map((r) => r.item)).map((item) => ({
      item,
      hay: normalizeSearchText(`${item.title || ""} ${item.id || ""}`),
    }));
    searchMemo.set(cache, rows);
  }
  return rows;
}

export async function listSearch(
  q: string,
  page = 1,
  limit = DEFAULT_PAGE_SIZE,
  _signal?: AbortSignal,
): Promise<PagedVideos> {
  const sq = parseSearchQuery(q);
  if (!sq.tokens.length) return listLatest(page, limit, _signal);
  const cache = await loadItems();
  const { posters, videyNo } = cache;
  const scored: { item: RawItem; score: number }[] = [];
  for (const row of searchIndex(cache)) {
    const score = scoreSearch(row.hay, sq);
    if (score > 0) scored.push({ item: row.item, score });
  }
  // Stable sort: same score keeps newest-first order.
  scored.sort((a, b) => b.score - a.score);
  const matched = scored.map((x) => x.item);
  const lastPage = Math.max(1, Math.ceil(matched.length / Math.max(1, limit)));
  return pageOf(matched, Math.min(Math.max(1, page), lastPage), limit, posters, videyNo);
}

export async function getDetail(id: string, _signal?: AbortSignal): Promise<VideoDetail> {
  let bag = await loadItems();
  let item = bag.byId.get(id);
  if (!item && runtime.inflight) {
    bag = await runtime.inflight;
    item = bag.byId.get(id);
  }
  if (item && (await isPublicHidden(id))) item = undefined;
  if (!item) {
    throw Object.assign(new Error("Video tidak ditemukan"), { code: "not_found" as const });
  }
  const card = toCard(item, bag.posters, bag.videyNo);
  // Videy plays the cdn mp4 in our own player (VideyPlayer); others keep their embed.
  const embed = isVidey(item) ? String(item.direct || item.embed || "") : String(item.embed || item.direct || "");
  return {
    ...card,
    video_url: embed || null,
    qualities: embed ? [{ label: card.quality, url: embed, format: "embed" }] : [],
    subjects: [],
    playable: Boolean(embed),
    categories: videoCategories(bag, item),
    ...((await isVideyNoThumbHidden(item.id)) ? { noindex: true } : {}),
  };
}

/** Max category chips on a watch page. */
const MAX_WATCH_CATEGORIES = 10;

/** Listed category slugs (same rule as listListedCategories), once per catalog build. */
const listedMemo = new WeakMap<object, Set<string>>();
function listedSlugs(cache: CatalogCache): Set<string> {
  let set = listedMemo.get(cache);
  if (set) return set;
  set = new Set();
  for (const c of CATEGORY_LIST) {
    if (!cache.bySlug.get(c.slug)?.length) continue;
    const n = categoryPool(cache, c.slug).length;
    if (n >= MIN_LISTED_CATEGORY_COUNT || (c.slug === "videy" && n > 0)) set.add(c.slug);
  }
  listedMemo.set(cache, set);
  return set;
}

function videoCategories(cache: CatalogCache, item: RawItem): CategoryInfo[] {
  // Same tags that put the video into the category pages (buildIndexes), primary first.
  const listed = listedSlugs(cache);
  const out: CategoryInfo[] = [];
  for (const slug of titleTags(item.title, slugOf(item), tagOptions(item, popularIds(cache.items)))) {
    if (out.length >= MAX_WATCH_CATEGORIES) break;
    const cat = listed.has(slug) ? findCategory(slug) : undefined;
    if (cat) out.push({ slug: cat.slug, label: cat.label });
  }
  return out;
}

export async function listRelated(id: string, limit = 12, _signal?: AbortSignal): Promise<PagedVideos> {
  const { items, posters, videyNo } = await loadItems();
  const seed = slotIndex(hashId(id) % 997);
  const pool = mixIndoHeavy(items, id, limit, seed);
  return {
    page: 1,
    limit,
    total: pool.length,
    hasMore: false,
    items: pool.map((x) => toCard(x, posters, videyNo)),
  };
}

export async function listCategories(): Promise<{ slug: string; label: string; count: number }[]> {
  const { bySlug } = await loadItems();
  const out: { slug: string; label: string; count: number }[] = [];
  for (const [slug, list] of bySlug) {
    if (!list.length) continue;
    const cat = findCategory(slug);
    out.push({ slug, label: cat?.label || slug, count: list.length });
  }
  return out.sort((a, b) => b.count - a.count);
}

/**
 * Public category list with live counts; categories with fewer than
 * MIN_LISTED_CATEGORY_COUNT videos are left out (their pages still work).
 */
export async function listListedCategories(): Promise<CategoryInfo[]> {
  const cache = await loadItems();
  const out: CategoryInfo[] = [];
  for (const c of CATEGORY_LIST) {
    // Same pool as the category page (bokep counts its inserted IndoAV videos, like its page total).
    // Only known category slugs with videos: no fallback scan for empty ones.
    const count = cache.bySlug.get(c.slug)?.length ? categoryPool(cache, c.slug).length : 0;
    // Videy is listed from its first video; other categories need MIN_LISTED_CATEGORY_COUNT.
    if (count >= MIN_LISTED_CATEGORY_COUNT || (c.slug === "videy" && count > 0)) {
      out.push({ slug: c.slug, label: c.label, count });
    }
  }
  return out;
}
