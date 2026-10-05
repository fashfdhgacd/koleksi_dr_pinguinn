import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos } from "./types";
import { buildMainSorted } from "./feed-order";
import {
  type RawItem,
  type CatalogCache,
  CACHE_MS,
  STALE_MS,
  BOT_FEEDS,
  asList,
  asPosterMap,
  fetchJson,
  withIds,
  isIndoAv,
  isUserBokep,
  isPutarin,
  isUsable,
  isVidey,
  mainCatalog,
  slugOf,
  toCard,
} from "./local-shared";
import localCatalog from "./videos.json";
import streamtapeBatch from "./streamtape.json";
import streamtapeBatchSep25 from "./streamtape-batch-20260925.json";
import putarinBatch from "./putarin.json";
import postersMap from "./posters.json";
import javPosters from "./jav-posters.json";
import latestVideos from "../../../data/videos-latest.json";
import latestPosters from "../../../data/latest-posters.json";

// Re-bind mutable cache/inflight via shared module namespace
import { runtime } from "./local-shared";

function sourcePriority(item: RawItem): number {
  // Kategori/pencarian: IndoAV di atas Userbokep, lalu sumber lain
  if (isIndoAv(item)) return 100;
  if (isUserBokep(item)) return 50;
  return 0;
}

export function sortByNewest(items: RawItem[]): RawItem[] {
  return [...items].sort((a, b) => {
    const pd = sourcePriority(b) - sourcePriority(a);
    if (pd !== 0) return pd;
    return Number(b.createdAt || b.date || 0) - Number(a.createdAt || a.date || 0);
  });
}

export function uniqById(items: RawItem[]): RawItem[] {
  const seen = new Set<string>();
  const out: RawItem[] = [];
  for (const it of items) {
    if (!it?.id || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

export function buildVideyNo(items: RawItem[]): Map<string, number> {
  const m = new Map<string, number>();
  let n = 0;
  for (const it of items) {
    if (isVidey(it) && !m.has(it.id)) m.set(it.id, ++n);
  }
  return m;
}

export function buildIndexes(
  items: RawItem[],
  posters: Record<string, string>,
  videyNo: Map<string, number>,
  at: number,
): CatalogCache {
  const byId = new Map<string, RawItem>();
  const bySlug = new Map<string, RawItem[]>();
  const haystack: { item: RawItem; hay: string }[] = [];
  for (const it of items) {
    byId.set(it.id, it);
    const slug = slugOf(it);
    const bucket = bySlug.get(slug);
    if (bucket) bucket.push(it);
    else bySlug.set(slug, [it]);
    haystack.push({
      item: it,
      hay: `${(it.title || "").toLowerCase()} ${it.id.toLowerCase()}`,
    });
  }
  const core = mainCatalog(items);
  const mainSorted = buildMainSorted(
    core.filter((x) => isIndoAv(x)),
    core.filter((x) => isUserBokep(x) && !isIndoAv(x)),
    DEFAULT_PAGE_SIZE,
    core,
  );
  for (const [slug, list] of bySlug) {
    bySlug.set(slug, sortByNewest(list));
  }
  return { at, items, posters, videyNo, byId, bySlug, mainSorted, haystack };
}

export function pageOf(pool: RawItem[], page: number, limit: number, posters: Record<string, string>, videyNo: Map<string, number>): PagedVideos {
  const p = Math.max(1, page);
  const start = (p - 1) * limit;
  const slice = pool.slice(start, start + limit);
  return {
    page: p,
    limit,
    total: pool.length,
    hasMore: start + limit < pool.length,
    items: slice.map((x) => toCard(x, posters, videyNo)),
  };
}

export function assembleLocal(): { items: RawItem[]; posters: Record<string, string> } {
  const local = withIds(asList(localCatalog)).filter(isUsable);
  const latest = withIds(asList(latestVideos)).filter(isUsable);
  const st = withIds(asList(streamtapeBatch)).filter(isUsable);
  const st2 = withIds(asList(streamtapeBatchSep25)).filter(isUsable);
  const pu = withIds(asList(putarinBatch)).filter(isUsable);
  const posters: Record<string, string> = {
    ...(postersMap as Record<string, string>),
    ...asPosterMap(javPosters),
    ...asPosterMap(latestPosters),
  };
  return { items: uniqById([...latest, ...st, ...st2, ...pu, ...local]), posters };
}

export async function refreshRemote(base: { items: RawItem[]; posters: Record<string, string> }): Promise<CatalogCache> {
  const posters = { ...base.posters };
  const remote: RawItem[] = [];
  const botResults = await Promise.all(BOT_FEEDS.map((url) => fetchJson(url)));
  for (const data of botResults) {
    remote.push(...withIds(asList(data)).filter(isUsable));
    Object.assign(posters, asPosterMap(data));
  }
  const items = uniqById([...remote, ...base.items]);
  const videyNo = buildVideyNo(items);
  return buildIndexes(items, posters, videyNo, Date.now());
}

export function seedLocalCache(): CatalogCache {
  const local = assembleLocal();
  return buildIndexes(local.items, local.posters, buildVideyNo(local.items), Date.now());
}

export function kickRemoteRefresh(base: { items: RawItem[]; posters: Record<string, string> }): void {
  if (runtime.inflight) return;
  runtime.inflight = refreshRemote(base)
    .then((next) => {
      runtime.cache = next;
      return next;
    })
    .catch(() => runtime.cache as CatalogCache)
    .finally(() => {
      runtime.inflight = null;
    });
}

export async function loadItems(): Promise<CatalogCache> {
  const now = Date.now();
  if (runtime.cache && now - runtime.cache.at < CACHE_MS) return runtime.cache;
  if (runtime.cache && now - runtime.cache.at < STALE_MS) {
    kickRemoteRefresh({ items: runtime.cache.items, posters: runtime.cache.posters });
    return runtime.cache;
  }
  if (!runtime.cache) runtime.cache = seedLocalCache();
  const putarinN = runtime.cache.items.filter(isPutarin).length;
  if (putarinN < 200) {
    try {
      if (runtime.inflight) runtime.cache = await runtime.inflight;
      else runtime.cache = await refreshRemote({ items: runtime.cache.items, posters: runtime.cache.posters });
    } catch {
      kickRemoteRefresh({ items: runtime.cache.items, posters: runtime.cache.posters });
    }
    return runtime.cache;
  }
  kickRemoteRefresh({ items: runtime.cache.items, posters: runtime.cache.posters });
  return runtime.cache;
}
