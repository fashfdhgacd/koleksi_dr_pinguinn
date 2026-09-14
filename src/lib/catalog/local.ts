import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { findCategory } from "./categories";
import catalog from "./videos.json";

type RawItem = {
  id: string | number;
  title: string;
  embed: string;
  direct?: string;
  source?: string;
  category?: string;
};

const RULES: Array<[string, RegExp]> = [
  ["jilbab", /jilbab|hijab|ukhty|ukhti|tudung|berhijab/i],
  ["tante", /tante|janda|\bstw\b|milf|ibu ?tiri|\bemak\b/i],
  ["live", /\blive\b/i],
  ["chindo", /chindo/i],
  ["malaysia", /malay|malaysia/i],
  ["open-bo", /open ?bo|michat/i],
  ["percakapan", /percakapan/i],
  ["viral", /viral/i],
  ["gangbang", /gangbang|gilir|rame rame|threesome|foursome|bertiga/i],
  ["doggy", /doggy|nungging/i],
  ["colmek", /colmek|omek|coliin|dildo/i],
  ["kosan", /pacar|kosan|check ?in|hotel|\bkos\b|\bkost\b/i],
  ["istri", /istri|suami|selingkuh|hamil/i],
  ["amatir", /amatir|bokepindo|bokep indo|pasutri|pasangan/i],
  ["abg", /\babg\b|\bsma\b|mahasiswi|mahasiswa|pelajar/i],
];

function classify(title: string): string {
  for (const [slug, re] of RULES) {
    if (re.test(title)) return slug;
  }
  return "lainnya";
}

function cleanTitle(title: string): string {
  return title
    .replace(/^\u25b6\s*/, "")
    .replace(/Collection Dr\.?\s*Anjing Bokep[^,]*[,.]?\s*S\.\s*M\.\s*Sc\.?/gi, "")
    .replace(/koleksidrpinguin\.com/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\-|]+|[\-|]+$/g, "") || "Video";
}

const ITEMS: RawItem[] = (catalog as RawItem[]).slice().sort((a, b) => Number(b.id) - Number(a.id));

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
  const id = embedId(item.embed || "");
  const host = /indoav/i.test(item.embed) ? "indoav" : /userbokep/i.test(item.embed) ? "userbokep" : "";
  if (id && host) return `https://www.koleksidrpinguin.site/api/thumb?h=${host}&id=${encodeURIComponent(id)}`;
  return "/logo.svg";
}

function toCard(item: RawItem): VideoCard {
  const slug = classify(item.title || "");
  const label = findCategory(slug)?.label ?? "Lainnya";
  return {
    id: String(item.id),
    title: cleanTitle(item.title || ""),
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
  if (item.direct && item.direct !== item.embed) {
    qualities.push({ label: "Direct", url: item.direct, format: "direct" });
  }
  return {
    ...card,
    video_url: item.embed,
    qualities,
    subjects: [card.category],
    playable: Boolean(item.embed),
  };
}

function slugOf(item: RawItem): string {
  return classify(item.title || "");
}

export async function listLatest(page = 1, limit = DEFAULT_PAGE_SIZE): Promise<PagedVideos> {
  const { slice, total, hasMore } = pageOf(ITEMS, page, limit);
  return { page, limit, total, hasMore, items: slice.map(toCard) };
}

export async function listFeatured(page = 1, limit = 8): Promise<PagedVideos> {
  const featured = ITEMS.filter((x) => ["jilbab", "tante", "viral", "live"].includes(slugOf(x))).slice(0, 24);
  const source = featured.length ? featured : ITEMS;
  const { slice, total, hasMore } = pageOf(source, page, limit);
  return { page, limit, total, hasMore, items: slice.map(toCard) };
}

export async function listCategory(slug: string, page = 1, limit = DEFAULT_PAGE_SIZE): Promise<PagedVideos> {
  const items = ITEMS.filter((x) => slugOf(x) === slug);
  const { slice, total, hasMore } = pageOf(items, page, limit);
  return { page, limit, total, hasMore, items: slice.map(toCard) };
}

export async function listSearch(q: string, page = 1, limit = DEFAULT_PAGE_SIZE): Promise<PagedVideos> {
  const key = q.trim().toLowerCase();
  const items = ITEMS.filter((x) => `${x.title} ${x.source ?? ""}`.toLowerCase().includes(key));
  const { slice, total, hasMore } = pageOf(items, page, limit);
  return { page, limit, total, hasMore, items: slice.map(toCard) };
}

export async function getDetail(id: string): Promise<VideoDetail> {
  const item = ITEMS.find((x) => String(x.id) === id);
  if (!item) {
    throw Object.assign(new Error("Video tidak ditemukan."), { code: "not_found" as const });
  }
  return toDetail(item);
}

export async function listRelated(id: string, limit = 12): Promise<PagedVideos> {
  const current = ITEMS.find((x) => String(x.id) === id);
  const pool = current
    ? ITEMS.filter((x) => String(x.id) !== id && slugOf(x) === slugOf(current))
    : ITEMS.filter((x) => String(x.id) !== id);
  const items = (pool.length ? pool : ITEMS.filter((x) => String(x.id) !== id)).slice(0, limit).map(toCard);
  return { page: 1, limit, total: items.length, hasMore: false, items };
}
