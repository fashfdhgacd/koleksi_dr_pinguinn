import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { findCategory } from "./categories";
import localCatalog from "./videos.json";

const SITE_CATALOG = "https://www.koleksidrpinguin.site/data/videos.json";
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
  return (
    title
      .replace(/^\u25b6\s*/, "")
      .replace(/Collection Dr\.?\s*Anjing Bokep[^,]*[,.]?\s*S\.\s*M\.\s*Sc\.?/gi, "")
      .replace(/koleksidrpinguin\.(com|site)/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[\-|]+|[\-|]+$/g, "") || "Video"
  );
}

function embedId(embed: string): string {
  const m =
    embed.match(/[?&]id=([A-Za-z0-9_-]+)/i) ||
    embed.match(/\/(?:e|v|d)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : "";
}

function embedKey(embed: string): string {
  return embedId(embed).toLowerCase() || embed.toLowerCase();
}

function makeId(raw: Record<string, unknown>): string {
  if (raw.id != null && String(raw.id).trim()) return String(raw.id);
  const embed = String(raw.embed || raw.direct || "");
  const key = embedId(embed);
  return key || `t${Math.abs(hash(String(raw.title || embed)))}`;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function normalize(raw: Record<string, unknown>): RawItem | null {
  const embed = String(raw.embed || raw.direct || "").trim();
  if (!embed) return null;
  return {
    id: makeId(raw),
    title: String(raw.title || "Video"),
    embed,
    direct: raw.direct ? String(raw.direct) : undefined,
    source: raw.source ? String(raw.source) : undefined,
    category: raw.category ? String(raw.category) : undefined,
  };
}

function merge(lists: Array<unknown>): RawItem[] {
  const seen = new Set<string>();
  const out: RawItem[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const item = normalize(row as Record<string, unknown>);
      if (!item) continue;
      const key = embedKey(item.embed);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  out.sort((a, b) => Number(b.id) - Number(a.id) || b.id.localeCompare(a.id));
  return out;
}

let cache: { at: number; items: RawItem[]; posters: Record<string, string> } | null = null;

async function loadPosters(): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  await Promise.all(
    POSTER_URLS.map(async (url) => {
      try {
        const res = await fetch(url, { headers: { accept: "application/json" } });
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, unknown>;
        if (!data || Array.isArray(data)) return;
        for (const [key, value] of Object.entries(data)) {
          const src = String(value || "").trim();
          if (!key || !/^https?:\/\//i.test(src)) continue;
          map[key] = src;
          map[key.toLowerCase()] = src;
        }
      } catch {
        /* ignore */
      }
    }),
  );
  return map;
}

async function loadItems(): Promise<{ items: RawItem[]; posters: Record<string, string> }> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache;

  let remote: unknown = [];
  try {
    const res = await fetch(SITE_CATALOG, { headers: { accept: "application/json" } });
    if (res.ok) remote = await res.json();
  } catch {
    remote = [];
  }

  const [items, posters] = await Promise.all([Promise.resolve(merge([remote, localCatalog])), loadPosters()]);
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

export async function listRelated(id: string, limit = 12): Promise<PagedVideos> {
  const { items, posters } = await loadItems();
  const current = items.find((x) => x.id === id);
  const pool = current
    ? items.filter((x) => x.id !== id && slugOf(x) === slugOf(current))
    : items.filter((x) => x.id !== id);
  const picked = (pool.length ? pool : items.filter((x) => x.id !== id)).slice(0, limit);
  return { page: 1, limit, total: picked.length, hasMore: false, items: picked.map((x) => toCard(x, posters)) };
}
