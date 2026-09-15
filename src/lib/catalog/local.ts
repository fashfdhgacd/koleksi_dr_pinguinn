import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { findCategory } from "./categories";
import localCatalog from "./videos.json";
import streamtapeBatch from "./streamtape.json";

const SITE_FEEDS = [
  // Chunk upload baru (kecil, < 1MB) — diprioritaskan
  "https://www.koleksidrpinguin.site/data/videos-latest.json",
  "https://www.koleksidrpinguin.site/data/putarin-latest.json",
  "https://www.koleksidrpinguin.site/data/campur-latest.json",
  // Arsip lama
  "https://www.koleksidrpinguin.site/data/videos.json",
  "https://www.koleksidrpinguin.site/data/campur.json",
  "https://www.koleksidrpinguin.site/data/putarin.json",
];
const POSTER_URLS = [
  "https://www.koleksidrpinguin.site/data/posters.json",
  "https://www.koleksidrpinguin.site/data/latest-posters.json",
];
const CACHE_MS = 10 * 60 * 1000;

type RawItem = {
  id: string;
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
  ["percakapan", /percakapan|vcs|ngobrol|telpon/i],
  ["viral", /viral/i],
  ["gangbang", /gangbang|gilir|rame rame|threesome|foursome|bertiga/i],
  ["doggy", /doggy|nungging/i],
  ["colmek", /colmek|omek|coliin|dildo/i],
  ["kosan", /pacar|kosan|check ?in|hotel|\bkos\b|\bkost\b/i],
  ["istri", /istri|suami|selingkuh|hamil/i],
  ["amatir", /amatir|bokepindo|bokep indo|pasutri|pasangan/i],
  ["abg", /\babg\b|\bsma\b|mahasiswi|mahasiswa|pelajar/i],
];

function classify(title = "") {
  const text = title.trim();
  for (const [slug, re] of RULES) {
    if (re.test(text)) return slug;
  }
  return "lainnya";
}

function cleanTitle(raw = "") {
  return String(raw)
    .replace(/^\u25b6\s*/, "")
    .replace(/koleksidrpinguin\.(com|site)/gi, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\-|]+|[\-|]+$/g, "") || "Video";
}

function embedId(url = "") {
  const m = String(url).match(/\/(?:e|v|d)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : "";
}

function normalize(raw: unknown): RawItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = String(o.id || embedId(String(o.embed || o.direct || "")) || "").trim();
  const embed = String(o.embed || o.direct || "").trim();
  if (!id || !embed) return null;
  return {
    id,
    title: String(o.title || "Video"),
    embed,
    direct: o.direct ? String(o.direct) : undefined,
    source: o.source ? String(o.source) : undefined,
    category: o.category ? String(o.category) : undefined,
  };
}

function merge(packs: unknown[]): RawItem[] {
  const map = new Map<string, RawItem>();
  for (const pack of packs) {
    const arr = Array.isArray(pack) ? pack : [];
    for (const raw of arr) {
      const item = normalize(raw);
      if (!item) continue;
      if (!map.has(item.id)) map.set(item.id, item);
    }
  }
  return [...map.values()];
}

let cache: { at: number; items: RawItem[]; posters: Record<string, string> } | null = null;

async function loadPosters(): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  await Promise.all(
    POSTER_URLS.map(async (url) => {
      try {
        const res = await fetch(url, { headers: { accept: "application/json" } });
        if (!res.ok) return;
        const data = await res.json();
        if (data && typeof data === "object" && !Array.isArray(data)) {
          Object.assign(map, data as Record<string, string>);
        }
      } catch {
        /* ignore */
      }
    }),
  );
  return map;
}

async function loadRemoteLists(): Promise<unknown[]> {
  const packs = await Promise.all(
    SITE_FEEDS.map(async (url) => {
      try {
        const res = await fetch(url, { headers: { accept: "application/json" } });
        if (!res.ok) return [];
        return await res.json();
      } catch {
        return [];
      }
    }),
  );
  return packs;
}

async function loadItems(): Promise<{ items: RawItem[]; posters: Record<string, string> }> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache;

  const [remote, posters] = await Promise.all([loadRemoteLists(), loadPosters()]);
  const items = merge([streamtapeBatch, ...remote, localCatalog]);
  cache = { at: now, items, posters };
  return cache;
}

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

function videyFile(item: RawItem): string {
  if (item.direct && /cdn\.videy\.co\//i.test(item.direct)) return item.direct;
  const id = embedId(item.embed) || embedId(item.direct || "");
  if (!id || !/videy/i.test(`${item.embed} ${item.direct || ""} ${item.source || ""}`)) return "";
  const ext = id.length === 9 && id.endsWith("2") ? ".mov" : ".mp4";
  return `https://cdn.videy.co/${id}${ext}`;
}

function thumbOf(item: RawItem, posters: Record<string, string>): string {
  const id = embedId(item.embed) || embedId(item.direct || "");
  if (id) {
    const hit = posters[id] || posters[id.toLowerCase()];
    if (hit) return hit;
  }
  if (id && /streamtape|strcloud/i.test(`${item.embed} ${item.direct || ""}`)) {
    return `https://www.koleksidrpinguin.site/api/tape-thumb?id=${encodeURIComponent(id)}`;
  }
  const videy = videyFile(item);
  if (videy) return videy;
  return "/logo.svg";
}

function toCard(item: RawItem, posters: Record<string, string>): VideoCard {
  const slug = classify(item.title || "");
  const label = findCategory(slug)?.label ?? "Lainnya";
  return {
    id: item.id,
    title: cleanTitle(item.title || ""),
    thumbnail: thumbOf(item, posters),
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

function toDetail(item: RawItem, posters: Record<string, string>): VideoDetail {
  const card = toCard(item, posters);
  const qualities = [{ label: item.source || "Embed", url: item.embed, format: "embed" }];
  if (item.direct && item.direct !== item.embed) {
    qualities.push({ label: "Direct", url: item.direct, format: "direct" });
  }
  const videy = videyFile(item);
  if (videy && !qualities.some((q) => q.url === videy)) {
    qualities.unshift({ label: "Videy", url: videy, format: "mp4" });
  }
  return {
    ...card,
    video_url: videy || item.embed,
    qualities,
    subjects: [card.category],
    playable: Boolean(videy || item.embed),
  };
}

function slugOf(item: RawItem): string {
  return classify(item.title || "");
}

export async function listLatest(page = 1, limit = DEFAULT_PAGE_SIZE): Promise<PagedVideos> {
  const { items, posters } = await loadItems();
  const { slice, total, hasMore } = pageOf(items, page, limit);
  return { page, limit, total, hasMore, items: slice.map((x) => toCard(x, posters)) };
}

export async function listFeatured(page = 1, limit = 8): Promise<PagedVideos> {
  const { items, posters } = await loadItems();
  const featured = items.filter((x) => ["jilbab", "tante", "viral", "live"].includes(slugOf(x))).slice(0, 24);
  const source = featured.length ? featured : items;
  const { slice, total, hasMore } = pageOf(source, page, limit);
  return { page, limit, total, hasMore, items: slice.map((x) => toCard(x, posters)) };
}

export async function listCategory(slug: string, page = 1, limit = DEFAULT_PAGE_SIZE): Promise<PagedVideos> {
  const { items, posters } = await loadItems();
  const filtered = items.filter((x) => slugOf(x) === slug);
  const { slice, total, hasMore } = pageOf(filtered, page, limit);
  return { page, limit, total, hasMore, items: slice.map((x) => toCard(x, posters)) };
}

export async function listSearch(q: string, page = 1, limit = DEFAULT_PAGE_SIZE): Promise<PagedVideos> {
  const key = q.trim().toLowerCase();
  const { items, posters } = await loadItems();
  const filtered = items.filter((x) => `${x.title} ${x.source ?? ""}`.toLowerCase().includes(key));
  const { slice, total, hasMore } = pageOf(filtered, page, limit);
  return { page, limit, total, hasMore, items: slice.map((x) => toCard(x, posters)) };
}

export async function getDetail(id: string): Promise<VideoDetail> {
  const { items, posters } = await loadItems();
  const item = items.find((x) => x.id === id);
  if (!item) {
    throw Object.assign(new Error("Video tidak ditemukan."), { code: "not_found" as const });
  }
  return toDetail(item, posters);
}
