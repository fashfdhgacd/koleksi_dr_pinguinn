import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { CATEGORY_LIST, MIN_LISTED_CATEGORY_COUNT, NOINDEX_CATEGORY_SLUGS, SEO_MIN_COUNT, findCategory } from "./categories";
import deadSources from "./dead-sources.json";
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
import { parseSearchQuery, scoreSearch, searchHayText } from "./search-rank";
import { parseSeries, seriesIndex } from "./series";
import { isPublicHidden, isVideyNoThumbHidden, loadItems, multiServerOf, pageOf, sortByNewest } from "./local-cache";
import { serverHostOf } from "./multi-server";
import { aiPlusFrontOrder } from "./ai-plus-order";
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
  if (mixed && mixed.length) return s === "ai-plus" || s === "streamtape" ? aiPlusFrontOrder(mixed) : mixed;
  if (s === "jav") {
    const hit = bySlug.get("jav");
    return hit && hit.length ? hit : items.filter(isPutarin);
  }
  if (s === "ai-plus" || s === "streamtape") {
    const hit = bySlug.get("ai-plus");
    // Indonesian/other AI titles ahead of Chinese dramas on the first pages (ordering only).
    return aiPlusFrontOrder(hit && hit.length ? hit : items.filter(isStreamtape));
  }
  if (s === "videy") return bySlug.get("videy") || items.filter(isVidey);
  return bySlug.get(s) || mainSorted.filter((x) => slugOf(x) === s);
}

/**
 * Newest-first items with their normalized search text, built once per catalog build (was: re-sorted
 * and re-normalized, ~8k titles, on every search request).
 */
/** Main-category words so "jav" / "hentai" / "ai" find their category (teen/college excluded). */
const NO_SEARCH_CATEGORY = new Set(["teen-18", "college-18", "lainnya"]);
function searchCategoryWords(item: RawItem): string {
  const slug = slugOf(item);
  if (NO_SEARCH_CATEGORY.has(slug)) return "";
  const cat = findCategory(slug);
  return cat ? `${cat.label} ${cat.slug}` : slug;
}
const searchMemo = new WeakMap<object, { item: RawItem; hay: string }[]>();
function searchIndex(cache: CatalogCache): { item: RawItem; hay: string }[] {
  let rows = searchMemo.get(cache);
  if (!rows) {
    rows = sortByNewest(cache.haystack.map((r) => r.item)).map((item) => ({
      item,
      hay: searchHayText(item.title || "", `${item.id || ""} ${searchCategoryWords(item)}`),
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

/** Embed URL the player gets for one catalog item (Videy plays the cdn mp4 in VideyPlayer). */
function embedOf(item: RawItem): string {
  return isVidey(item) ? String(item.direct || item.embed || "") : String(item.embed || item.direct || "");
}

/**
 * Server buttons of a main page (multi-server.ts), hidden copies skipped. Merged-away copies live in
 * multi.away (out of byId and every list); they only play here. Undefined when fewer than 2 remain.
 */
async function serversOf(cache: CatalogCache, item: RawItem): Promise<VideoDetail["servers"]> {
  const multi = multiServerOf(cache);
  const ids = multi.servers.get(item.id);
  if (!ids || ids.length < 2) return undefined;
  const out: NonNullable<VideoDetail["servers"]> = [];
  for (const sid of ids) {
    const it = sid === item.id ? item : (multi.away.get(sid) as RawItem | undefined);
    if (!it) continue;
    if (sid !== item.id && (await isPublicHidden(sid))) continue;
    const url = embedOf(it);
    if (!url) continue;
    out.push({ id: sid, host: serverHostOf(it), url });
  }
  return out.length >= 2 ? out : undefined;
}

/**
 * Detail of one video. A copy merged into another page (multi-server.ts) answers with the main
 * page's detail, so the caller sees `item.id !== id` (watch route: redirect to the main page).
 */
export async function getDetail(requestedId: string, _signal?: AbortSignal): Promise<VideoDetail> {
  let bag = await loadItems();
  let id = multiServerOf(bag).mainOf.get(requestedId) || requestedId;
  let item = bag.byId.get(id);
  if (!item && runtime.inflight) {
    bag = await runtime.inflight;
    id = multiServerOf(bag).mainOf.get(requestedId) || requestedId;
    item = bag.byId.get(id);
  }
  if (item && (await isPublicHidden(id))) item = undefined;
  if (!item) {
    throw Object.assign(new Error("Video tidak ditemukan"), { code: "not_found" as const });
  }
  const card = toCard(item, bag.posters, bag.videyNo);
  // Videy plays the cdn mp4 in our own player (VideyPlayer); others keep their embed.
  const embed = embedOf(item);
  const servers = await serversOf(bag, item);
  return {
    ...card,
    video_url: embed || null,
    qualities: embed ? [{ label: card.quality, url: embed, format: "embed" }] : [],
    subjects: [],
    playable: Boolean(embed),
    categories: videoCategories(bag, item),
    sameCategory: await sameCategoryLinks(bag, item),
    ...(await seriesEpisodes(bag, item)),
    ...((await isVideyNoThumbHidden(item.id)) ? { noindex: true } : {}),
    ...(servers ? { servers } : {}),
  };
}

/** Text links on a watch page to other videos of its main category (internal linking for crawlers). */
const SAME_CATEGORY_LINKS = 6;

/**
 * Up to SAME_CATEGORY_LINKS videos next to this one in its category list (the pool is built once per
 * catalog build, so this is an in-memory slice: no KV/D1 read). Hidden videos are skipped.
 */
async function sameCategoryLinks(cache: CatalogCache, item: RawItem): Promise<Array<{ id: string; title: string }>> {
  const slug = slugOf(item);
  if (!slug || NOINDEX_CATEGORY_SLUGS.has(slug)) return [];
  const pool = categoryPool(cache, slug);
  if (pool.length < 2) return [];
  const at = Math.max(0, pool.findIndex((x) => x?.id === item.id));
  const out: Array<{ id: string; title: string }> = [];
  for (let step = 1; step < pool.length && step <= SAME_CATEGORY_LINKS * 4 && out.length < SAME_CATEGORY_LINKS; step++) {
    const next = pool[(at + step) % pool.length];
    const id = String(next?.id || "");
    const title = String(next?.title || "").trim();
    if (!id || !title || id === item.id || out.some((o) => o.id === id)) continue;
    if (await isPublicHidden(id)) continue;
    out.push({ id, title });
  }
  return out;
}

/** Max episode buttons in the watch-page episode strip. */
const MAX_EPISODES = 60;

/**
 * Episodes of this video's series (series.ts index, built once per catalog build: no KV/D1 read),
 * sorted by episode number, current one included. Empty object when the video is not in a series
 * or fewer than 2 public episodes remain after skipping hidden ones.
 */
async function seriesEpisodes(
  cache: CatalogCache,
  item: RawItem,
): Promise<{ episodes?: Array<{ id: string; ep: number }> }> {
  const key = seriesIndex(cache.items).byId.get(String(item.id));
  if (!key) return {};
  const ids = seriesIndex(cache.items).groups.get(key) || [];
  const out: Array<{ id: string; ep: number }> = [];
  const seen = new Set<number>();
  for (const id of ids) {
    if (out.length >= MAX_EPISODES) break;
    const ep = cache.byId.get(id);
    if (!ep) continue;
    const n = parseSeries(String(ep.title || ""))?.ep || 0;
    if (!n) continue;
    // Duplicate uploads of the same episode: keep the current video, else the first one.
    if (seen.has(n) && id !== item.id) continue;
    if (id !== item.id && (await isPublicHidden(id))) continue;
    if (seen.has(n)) {
      const i = out.findIndex((o) => o.ep === n);
      if (i >= 0) out[i] = { id, ep: n };
      continue;
    }
    seen.add(n);
    out.push({ id, ep: n });
  }
  return out.length >= 2 ? { episodes: out } : {};
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
    if (NOINDEX_CATEGORY_SLUGS.has(c.slug)) continue;
    if (!cache.bySlug.get(c.slug)?.length) continue;
    const n = categoryPool(cache, c.slug).length;
    const seoMin = SEO_MIN_COUNT[c.slug];
    if (seoMin ? n >= seoMin : n >= MIN_LISTED_CATEGORY_COUNT || (c.slug === "videy" && n > 0)) set.add(c.slug);
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

/** Same dead/suspect list as the ranking pages (ranking-list.ts): never used as a cover. */
const DEAD_COVER_IDS = new Set<string>([
  ...Object.keys(((deadSources as { gone?: Record<string, unknown> }).gone || {}) as Record<string, unknown>),
  ...Object.keys(((deadSources as { suspect?: Record<string, unknown> }).suspect || {}) as Record<string, unknown>),
]);

/** A /kategori card that is not a category: pre-ranked candidates, best first (ranking pages, Terbaru). */
export type SpecialCoverSource = { slug: string; list: RawItem[] };
type Cover = { cover: string; coverId: string };

/**
 * /kategori covers: each card gets the thumbnail of its best video and no video is used twice on the
 * page. The 3 special cards (Paling ditonton / Paling disukai / Terbaru) pick first, in order, from
 * their own ranking (same lists as those pages), so they show the true top items. Then categories,
 * fewest candidates first, each take their highest all-time-viewed unused video (same number as
 * "Paling ditonton"; ties: newest first). Dead/suspect and no-thumbnail items are skipped; hidden,
 * locked and frameless Videy items are already out of the pools. Memoized per catalog build and
 * special-list signature: no KV/D1 reads of its own.
 */
const coverMemo = new WeakMap<object, Map<string, Map<string, Cover>>>();
const coverOk = (cache: CatalogCache, it: RawItem | undefined): it is RawItem =>
  Boolean(it?.id && !DEAD_COVER_IDS.has(it.id) && cache.byId.has(it.id) && thumbOf(it, cache.posters));
function categoryCovers(cache: CatalogCache, slugs: string[], specials: SpecialCoverSource[] = []): Map<string, Cover> {
  // Enough of each special list to cover every possible collision.
  const head = slugs.length + specials.length + 1;
  const sig =
    slugs.join(",") +
    "|" +
    specials.map((s) => s.slug + ":" + s.list.filter((it) => coverOk(cache, it)).slice(0, head).map((it) => it.id).join(",")).join("|");
  let bySig = coverMemo.get(cache);
  const hit = bySig?.get(sig);
  if (hit) return hit;
  const used = new Set<string>();
  const memo = new Map<string, Cover>();
  const take = (slug: string, list: RawItem[]) => {
    const pick = list.find((it) => coverOk(cache, it) && !used.has(it.id));
    if (pick) used.add(pick.id);
    memo.set(slug, pick ? { cover: thumbOf(pick, cache.posters), coverId: pick.id } : { cover: "", coverId: "" });
  };
  for (const s of specials) take(s.slug, s.list);
  const ranked = slugs.map((slug) => {
    const pool = cache.bySlug.get(slug)?.length ? categoryPool(cache, slug) : [];
    const list = pool
      .map((it, i) => ({ it, i, v: typeof it.views === "number" ? it.views : 0 }))
      .filter(({ it }) => coverOk(cache, it));
    list.sort((a, b) => b.v - a.v || a.i - b.i);
    return { slug, list: list.map((x) => x.it) };
  });
  ranked.sort((a, b) => a.list.length - b.list.length || slugs.indexOf(a.slug) - slugs.indexOf(b.slug));
  for (const { slug, list } of ranked) take(slug, list);
  if (!bySig) coverMemo.set(cache, (bySig = new Map()));
  if (bySig.size > 8) bySig.clear();
  bySig.set(sig, memo);
  return memo;
}

/** Newest-first Terbaru list (same as the Terbaru page), for its /kategori cover. */
export async function terbaruCoverSource(): Promise<RawItem[]> {
  return (await loadItems()).terbaruSorted;
}

/**
 * Public category list with live counts; categories with fewer than
 * MIN_LISTED_CATEGORY_COUNT videos are left out (their pages still work). The 2026-10-26 SEO
 * categories (SEO_MIN_COUNT) are listed and in the sitemap from their own count, AI GAY is always on
 * /kategori but in the sitemap only from its count (below it every such page is noindex). Each entry carries its unique cover (categoryCovers).
 */
export async function listListedCategories(
  opts: { sitemap?: boolean; specials?: SpecialCoverSource[]; specialOut?: CategoryInfo[] } = {},
): Promise<CategoryInfo[]> {
  const cache = await loadItems();
  const out: CategoryInfo[] = [];
  for (const c of CATEGORY_LIST) {
    if (NOINDEX_CATEGORY_SLUGS.has(c.slug)) continue;
    // Same pool as the category page (bokep counts its inserted IndoAV videos, like its page total).
    // Only known category slugs with videos: no fallback scan for empty ones.
    const count = cache.bySlug.get(c.slug)?.length ? categoryPool(cache, c.slug).length : 0;
    // Videy is listed from its first video; other categories need MIN_LISTED_CATEGORY_COUNT.
    const seoMin = SEO_MIN_COUNT[c.slug];
    const listed = seoMin
      ? count >= seoMin || (c.slug === "ai-gay" && !opts.sitemap)
      : count >= MIN_LISTED_CATEGORY_COUNT || (c.slug === "videy" && count > 0);
    if (listed) {
      out.push({ slug: c.slug, label: c.label, count });
    }
  }
  if (opts.sitemap) return out;
  const covers = categoryCovers(cache, out.map((c) => c.slug), opts.specials);
  for (const sp of opts.specials || []) {
    opts.specialOut?.push({ slug: sp.slug, label: sp.slug, ...(covers.get(sp.slug) || { cover: "", coverId: "" }) });
  }
  return out.map((c) => ({ ...c, ...(covers.get(c.slug) || { cover: "", coverId: "" }) }));
}
