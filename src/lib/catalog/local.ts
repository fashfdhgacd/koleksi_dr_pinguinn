import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { findCategory } from "./categories";
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
import * as shared from "./local-shared";
import { loadItems, pageOf, sortByNewest } from "./local-cache";

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

function mixIndoHeavy(items: RawItem[], excludeId: string, limit: number, seed: number): RawItem[] {
  const indo = shuffleSlot(
    items.filter((x) => isIndoAv(x) && x.id !== excludeId),
    seed,
  );
  const user = shuffleSlot(
    items.filter((x) => isUserBokep(x) && x.id !== excludeId),
    seed + 17,
  );
  if (!indo.length && !user.length) {
    return shuffleSlot(
      items.filter((x) => x.id !== excludeId && !isVidey(x) && !isPutarin(x) && !isStreamtape(x)),
      seed + 31,
    ).slice(0, limit);
  }
  const nUser = Math.min(user.length, Math.max(0, Math.round(limit * 0.15)));
  const nIndo = Math.min(indo.length, Math.max(0, limit - nUser));
  const fillUser = Math.min(user.length, limit - nIndo);
  const picked = [...indo.slice(0, nIndo), ...user.slice(0, fillUser)];
  if (picked.length < limit) {
    const seen = new Set(picked.map((x) => x.id));
    for (const x of shuffleSlot(items, seed + 53)) {
      if (x.id === excludeId || seen.has(x.id)) continue;
      if (isVidey(x) || isPutarin(x) || isStreamtape(x)) continue;
      picked.push(x);
      seen.add(x.id);
      if (picked.length >= limit) break;
    }
  }
  return shuffleSlot(picked, seed + 71).slice(0, limit);
}

export async function listLatest(page = 1, limit = DEFAULT_PAGE_SIZE, _signal?: AbortSignal): Promise<PagedVideos> {
  const { mainSorted, posters, videyNo } = await loadItems();
  return pageOf(mainSorted, page, limit, posters, videyNo);
}

export async function listFeatured(page = 1, limit = 8, _signal?: AbortSignal): Promise<PagedVideos> {
  const { items, posters, videyNo } = await loadItems();
  const seed = slotIndex(0);
  let pool = mixIndoHeavy(items, "", Math.max(limit * 6, 48), seed);
  const withArt = pool.filter((x) => Boolean(thumbOf(x, posters)));
  if (withArt.length >= limit) pool = withArt;
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
  const { items, posters, videyNo, bySlug, mainSorted } = await loadItems();
  const s = category.toLowerCase().trim();
  let pool: RawItem[];
  if (s === "jav") {
    const hit = bySlug.get("jav");
    pool = hit && hit.length ? hit : items.filter(isPutarin);
  } else if (s === "ai-plus" || s === "streamtape") {
    const hit = bySlug.get("ai-plus");
    pool = hit && hit.length ? hit : items.filter(isStreamtape);
  } else if (s === "videy") {
    return pageOf([], page, limit, posters, videyNo);
  } else pool = bySlug.get(s) || mainSorted.filter((x) => slugOf(x) === s);
  pool = pool.filter((x) => !isVidey(x));
  return pageOf(pool, page, limit, posters, videyNo);
}

export async function listSearch(
  q: string,
  page = 1,
  limit = DEFAULT_PAGE_SIZE,
  _signal?: AbortSignal,
): Promise<PagedVideos> {
  const key = q.trim().toLowerCase();
  if (!key) return listLatest(page, limit, _signal);
  const { haystack, posters, videyNo } = await loadItems();
  const tokens = key.split(/\s+/).filter(Boolean);
  const matched: RawItem[] = [];
  for (const row of haystack) {
    if (isVidey(row.item)) continue;
    if (tokens.every((t) => row.hay.includes(t))) matched.push(row.item);
  }
  return pageOf(sortByNewest(matched), page, limit, posters, videyNo);
}

export async function getDetail(id: string, _signal?: AbortSignal): Promise<VideoDetail> {
  let bag = await loadItems();
  let item = bag.byId.get(id);
  if (!item && shared.inflight) {
    bag = await shared.inflight;
    item = bag.byId.get(id);
  }
  if (!item || isVidey(item)) {
    throw Object.assign(new Error("Video tidak ditemukan"), { code: "not_found" as const });
  }
  const card = toCard(item, bag.posters, bag.videyNo);
  const embed = String(item.embed || item.direct || "");
  return {
    ...card,
    video_url: embed || null,
    qualities: embed ? [{ label: card.quality, url: embed, format: "embed" }] : [],
    subjects: [],
    playable: Boolean(embed),
  };
}

export async function listRelated(id: string, limit = 12, _signal?: AbortSignal): Promise<PagedVideos> {
  const { items, posters, videyNo } = await loadItems();
  const seed = slotIndex(hashId(id) % 997);
  const pool = mixIndoHeavy(items, id, limit, seed).filter((x) => !isVidey(x));
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
    if (slug === "videy") continue;
    const nonVidey = list.filter((x) => !isVidey(x));
    if (!nonVidey.length) continue;
    const cat = findCategory(slug);
    out.push({ slug, label: cat?.label || slug, count: nonVidey.length });
  }
  return out.sort((a, b) => b.count - a.count);
}
