import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { findCategory } from "./categories";
import catalog from "./data.json";

type RawItem = {
  id: string;
  title: string;
  embed: string;
  source?: string;
  c: string;
};

const ITEMS = catalog as RawItem[];

function pageOf<T>(items: T[], page = 1, limit = DEFAULT_PAGE_SIZE) {
  const p = Math.max(1, page);
  const l = Math.max(1, limit);
  const start = (p - 1) * l;
  return {
    slice: items.slice(start, start + l),
    total: items.length,
    hasMore: start + l < items.length,
  };
}

function embedId(embed: string): string {
  const m = embed.match(/\/[ed]\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : "";
}

function thumbOf(item: RawItem): string {
  const id = embedId(item.embed);
  const host = /indoav/i.test(item.embed) ? "indoav" : /userbokep/i.test(item.embed) ? "userbokep" : "";
  if (id && host) return `https://www.koleksidrpinguin.site/api/thumb?h=${host}&id=${encodeURIComponent(id)}`;
  return "/logo.svg";
}

function directOf(embed: string): string {
  return embed.replace("/e/", "/d/");
}

function toCard(item: RawItem): VideoCard {
  const cat = findCategory(item.c);
  const label = cat?.label ?? "Lainnya";
  return {
    id: item.id,
    title: item.title,
    thumbnail: thumbOf(item),
    description: `${label} · ${item.source || "embed"}`,
    category: label,
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
  const qualities = [{ label: item.source || "Embed", url: item.embed, format: "embed" }];
  const direct = directOf(item.embed);
  if (direct !== item.embed) qualities.push({ label: "Direct", url: direct, format: "direct" });
  return {
    ...card,
    video_url: item.embed,
    qualities,
    subjects: [card.category],
    playable: Boolean(item.embed),
  };
}

export async function listLatest(page = 1, limit = DEFAULT_PAGE_SIZE): Promise<PagedVideos> {
  const { slice, total, hasMore } = pageOf(ITEMS, page, limit);
  return { page, limit, total, hasMore, items: slice.map(toCard) };
}

export async function listFeatured(page = 1, limit = 8): Promise<PagedVideos> {
  const featured = ITEMS.filter((x) => ["jilbab", "tante", "viral", "live"].includes(x.c)).slice(0, 24);
  const source = featured.length ? featured : ITEMS;
  const { slice, total, hasMore } = pageOf(source, page, limit);
  return { page, limit, total, hasMore, items: slice.map(toCard) };
}

export async function listCategory(slug: string, page = 1, limit = DEFAULT_PAGE_SIZE): Promise<PagedVideos> {
  const items = ITEMS.filter((x) => x.c === slug);
  const { slice, total, hasMore } = pageOf(items, page, limit);
  return { page, limit, total, hasMore, items: slice.map(toCard) };
}

export async function listSearch(q: string, page = 1, limit = DEFAULT_PAGE_SIZE): Promise<PagedVideos> {
  const key = q.trim().toLowerCase();
  const items = ITEMS.filter((x) => `${x.title} ${x.c} ${x.source ?? ""}`.toLowerCase().includes(key));
  const { slice, total, hasMore } = pageOf(items, page, limit);
  return { page, limit, total, hasMore, items: slice.map(toCard) };
}

export async function getDetail(id: string): Promise<VideoDetail> {
  const item = ITEMS.find((x) => x.id === id);
  if (!item) {
    throw Object.assign(new Error("Video tidak ditemukan."), { code: "not_found" as const });
  }
  return toDetail(item);
}

export async function listRelated(id: string, limit = 12): Promise<PagedVideos> {
  const current = ITEMS.find((x) => x.id === id);
  const pool = current ? ITEMS.filter((x) => x.id !== id && x.c === current.c) : ITEMS.filter((x) => x.id !== id);
  const items = (pool.length ? pool : ITEMS.filter((x) => x.id !== id)).slice(0, limit).map(toCard);
  return { page: 1, limit, total: items.length, hasMore: false, items };
}
