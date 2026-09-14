import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { findCategory } from "./categories";
import catalog from "./data.json";

type RawItem = {
  id: string;
  title: string;
  embed: string;
  direct?: string;
  source?: string;
  categorySlug: string;
  category: string;
  thumbnail: string;
};

const ITEMS = catalog as RawItem[];

function pageOf<T>(items: T[], page = 1, limit = DEFAULT_PAGE_SIZE): { slice: T[]; total: number; hasMore: boolean } {
  const p = Math.max(1, page);
  const l = Math.max(1, limit);
  const start = (p - 1) * l;
  const slice = items.slice(start, start + l);
  return { slice, total: items.length, hasMore: start + l < items.length };
}

function toCard(item: RawItem): VideoCard {
  return {
    id: item.id,
    title: item.title,
    thumbnail: item.thumbnail,
    description: `${item.category} · ${item.source || "embed"}`,
    category: item.category,
    duration: null,
    durationLabel: "—",
    quality: item.source || "HD",
    year: null,
    creator: item.source || null,
    views: null,
  };
}

function toDetail(item: RawItem): VideoDetail {
  const card = toCard(item);
  const qualities = [
    { label: item.source || "Embed", url: item.embed, format: "embed" },
  ];
  if (item.direct && item.direct !== item.embed) {
    qualities.push({ label: "Direct", url: item.direct, format: "direct" });
  }
  return {
    ...card,
    video_url: item.embed,
    qualities,
    subjects: [item.category],
    playable: Boolean(item.embed),
  };
}

export async function listLatest(page = 1, limit = DEFAULT_PAGE_SIZE, _signal?: AbortSignal): Promise<PagedVideos> {
  const { slice, total, hasMore } = pageOf(ITEMS, page, limit);
  return { page, limit, total, hasMore, items: slice.map(toCard) };
}

export async function listFeatured(page = 1, limit = 8, _signal?: AbortSignal): Promise<PagedVideos> {
  const featured = ITEMS.filter((x) => ["jilbab", "tante", "viral", "live"].includes(x.categorySlug)).slice(0, 24);
  const source = featured.length ? featured : ITEMS;
  const { slice, total, hasMore } = pageOf(source, page, limit);
  return { page, limit, total, hasMore, items: slice.map(toCard) };
}

export async function listCategory(slug: string, page = 1, limit = DEFAULT_PAGE_SIZE, _signal?: AbortSignal): Promise<PagedVideos> {
  const cat = findCategory(slug);
  const items = ITEMS.filter((x) => x.categorySlug === slug);
  const { slice, total, hasMore } = pageOf(items, page, limit);
  return { page, limit, total, hasMore, items: slice.map(toCard) };
}

export async function listSearch(q: string, page = 1, limit = DEFAULT_PAGE_SIZE, _signal?: AbortSignal): Promise<PagedVideos> {
  const key = q.trim().toLowerCase();
  const items = ITEMS.filter((x) => `${x.title} ${x.category} ${x.source}`.toLowerCase().includes(key));
  const { slice, total, hasMore } = pageOf(items, page, limit);
  return { page, limit, total, hasMore, items: slice.map(toCard) };
}

export async function getDetail(id: string, _signal?: AbortSignal): Promise<VideoDetail> {
  const item = ITEMS.find((x) => x.id === id);
  if (!item) {
    throw Object.assign(new Error("Video tidak ditemukan."), { code: "not_found" as const });
  }
  return toDetail(item);
}

export async function listRelated(id: string, limit = 12, _signal?: AbortSignal): Promise<PagedVideos> {
  const current = ITEMS.find((x) => x.id === id);
  const pool = current
    ? ITEMS.filter((x) => x.id !== id && x.categorySlug === current.categorySlug)
    : ITEMS.filter((x) => x.id !== id);
  const items = (pool.length ? pool : ITEMS.filter((x) => x.id !== id)).slice(0, limit).map(toCard);
  return { page: 1, limit, total: items.length, hasMore: false, items };
}
