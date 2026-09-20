import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { findCategory } from "./categories";
import localCatalog from "./videos.json";
import streamtapeBatch from "./streamtape.json";
import putarinBatch from "./putarin.json";
import postersMap from "./posters.json";

const CACHE_MS = 90 * 1000;

function feedUrl(path: string): string {
  const t = Math.floor(Date.now() / 60_000);
  return `${path}${path.includes("?") ? "&" : "?"}t=${t}`;
}

const BOT_FEEDS = [
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/videos-latest.json",
  "https://cdn.jsdelivr.net/gh/fashfdhgacd/koleksi_dr_pinguinn@main/data/videos-latest.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/putarin-latest.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/putarin.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/campur-latest.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/latest-posters.json",
];

const SITE_FEEDS: string[] = [];
const POSTER_URLS: string[] = [];

type RawItem = {
  id: string;
  title?: string;
  embed?: string;
  direct?: string;
  category?: string;
  source?: string;
  poster?: string;
  thumbnail?: string;
  createdAt?: string | number;
  date?: string;
  duration?: number;
  [k: string]: unknown;
};

let cache: {
  at: number;
  items: RawItem[];
  posters: Record<string, string>;
  videyNo: Map<string, number>;
} | null = null;

function asList(data: unknown): RawItem[] {
  if (Array.isArray(data)) return data as RawItem[];
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as RawItem[];
    if (Array.isArray(o.videos)) return o.videos as RawItem[];
  }
  return [];
}

function asPosterMap(data: unknown): Record<string, string> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (typeof v === "string" && v.startsWith("http")) out[k] = v;
  }
  return out;
}

async function fetchJson(url: string): Promise<unknown> {
  try {
    const bust = feedUrl(url);
    const r = await fetch(bust, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/json", "user-agent": "kdp-catalog/1.0" },
      cache: "no-store",
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function embedId(embed = ""): string {
  const m =
    String(embed).match(/\/(?:e|v|d)\/([A-Za-z0-9_-]+)/i) ||
    String(embed).match(/[?&]id=([A-Za-z0-9_-]+)/i);
  return m ? m[1] : "";
}

function embedKey(embed = ""): string {
  return embedId(embed) || String(embed).slice(0, 64);
}

function isIndoAv(item: RawItem): boolean {
  const s = `${item.embed || ""} ${item.source || ""} ${item.direct || ""}`;
  return /indoav/i.test(s);
}

function isUserBokep(item: RawItem): boolean {
  const s = `${item.embed || ""} ${item.source || ""} ${item.direct || ""}`;
  return /userbokep/i.test(s);
}

function isPutarin(item: RawItem): boolean {
  const s = `${item.embed || ""} ${item.source || ""} ${item.direct || ""}`;
  return /putarin|puterin/i.test(s);
}

function isStreamtape(item: RawItem): boolean {
  const s = `${item.embed || ""} ${item.source || ""} ${item.direct || ""}`;
  return /streamtape|strcloud/i.test(s);
}

function isVidey(item: RawItem): boolean {
  const s = `${item.embed || ""} ${item.source || ""} ${item.direct || ""}`;
  return /videy/i.test(s);
}

function isSideSilo(item: RawItem): boolean {
  return isPutarin(item) || isStreamtape(item) || isVidey(item);
}

function mainCatalog(items: RawItem[]): RawItem[] {
  return items.filter((x) => !isSideSilo(x));
}

function cleanTitle(t: string): string {
  return t.replace(/\s+/g, " ").trim() || "Video";
}

function classify(title: string): string {
  const t = title.toLowerCase();
  if (/jilbab|hijab/.test(t)) return "jilbab";
  if (/tante/.test(t)) return "tante";
  if (/abg|sma|smk/.test(t)) return "abg";
  if (/viral/.test(t)) return "viral";
  if (/live/.test(t)) return "live";
  return "lainnya";
}

function slugOf(item: RawItem): string {
  if (isVidey(item)) return "videy";
  if (isPutarin(item)) return "jav";
  if (isStreamtape(item)) return "ai-plus";
  const raw = (item.category || "").toLowerCase().trim();
  const mapped = raw ? findCategory(raw) : undefined;
  if (mapped) return mapped.slug;
  return classify(item.title || "");
}

function sourceLabel(item: RawItem): string {
  if (isIndoAv(item)) return "IndoAV";
  if (isUserBokep(item)) return "UserBokep";
  if (isPutarin(item)) return "Putarin";
  if (isStreamtape(item)) return "Streamtape";
  if (isVidey(item)) return "Videy";
  return item.source || "Unknown";
}

const PLACEHOLDER_IMAGE_RE = /placeholder|1x1|transparent|data:image\/gif/i;

function videyFile(item: RawItem): string {
  const id = item.id;
  if (!id || !isVidey(item)) return "";
  const direct = String(item.direct || item.embed || "");
  if (/cdn\.videy\.co/i.test(direct)) return direct;
  return "";
}

function thumbOf(item: RawItem, posters: Record<string, string>): string {
  const id = item.id;
  if (isVidey(item)) {
    const videy = videyFile(item);
    if (videy) return videy;
  }
  // posters.json = sumber utama IndoAV / UserBokep
  const fromPoster = posters[id] || posters[embedKey(item.embed || "")] || "";
  if (fromPoster && !PLACEHOLDER_IMAGE_RE.test(fromPoster)) {
    return fromPoster;
  }
  const videy = videyFile(item);
  if (videy) return videy;
  const eid = embedId(item.embed || item.direct || "") || id;
  if (isStreamtape(item) && eid) return `/api/tape-thumb?id=${encodeURIComponent(eid)}`;
  if (isPutarin(item) && eid) return `/api/puterin-thumb?id=${encodeURIComponent(eid)}`;
  if (isIndoAv(item) && eid) return `/api/embed-thumb?id=${encodeURIComponent(eid)}&src=indoav`;
  if (isUserBokep(item) && eid) return `/api/embed-thumb?id=${encodeURIComponent(eid)}&src=userbokep`;
  return "";
}

function videyDisplayTitle(_item: RawItem, index: number): string {
  return `Videy koleksidrpinguin.com ${index}`;
}

function toCard(item: RawItem, posters: Record<string, string>, videyNo?: Map<string, number>): VideoCard {
  const id = item.id;
  const title = isVidey(item)
    ? videyDisplayTitle(item, videyNo?.get(id) || 1)
    : cleanTitle(item.title || "Video");
  let quality = "HD";
  if (isStreamtape(item)) quality = "Streamtape";
  else if (isPutarin(item)) quality = "Puterin";
  const thumb = thumbOf(item, posters);
  const embed = String(item.embed || item.direct || "");
  return {
    id,
    title,
    thumbnail: thumb,
    duration: typeof item.duration === "number" ? item.duration : null,
    durationLabel: "—",
    year: null,
    category: slugOf(item),
    quality,
    creator: sourceLabel(item),
    rating: null,
    href: `/watch/${id}`,
    description: null,
    video_url: embed || null,
    qualities: embed ? [{ label: quality, url: embed }] : [],
  } as VideoCard;
}

function sortByNewest(items: RawItem[]): RawItem[] {
  return [...items].sort((a, b) => {
    const ta = Number(a.createdAt || a.date || 0);
    const tb = Number(b.createdAt || b.date || 0);
    return tb - ta;
  });
}

function uniqById(items: RawItem[]): RawItem[] {
  const seen = new Set<string>();
  const out: RawItem[] = [];
  for (const it of items) {
    if (!it?.id || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

function buildVideyNo(items: RawItem[]): Map<string, number> {
  const m = new Map<string, number>();
  let n = 0;
  for (const it of items) {
    if (isVidey(it) && !m.has(it.id)) m.set(it.id, ++n);
  }
  return m;
}

export async function loadItems(): Promise<{
  items: RawItem[];
  posters: Record<string, string>;
  videyNo: Map<string, number>;
}> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;

  const local = asList(localCatalog);
  const st = asList(streamtapeBatch);
  const pu = asList(putarinBatch);
  let posters: Record<string, string> = { ...(postersMap as Record<string, string>) };

  const botResults = await Promise.all(BOT_FEEDS.map((url) => fetchJson(url)));
  const remote: RawItem[] = [];
  for (const data of botResults) {
    remote.push(...asList(data));
    Object.assign(posters, asPosterMap(data));
  }

  const items = uniqById([...remote, ...st, ...pu, ...local]);
  const videyNo = buildVideyNo(items);
  cache = { at: Date.now(), items, posters, videyNo };
  return cache;
}

function pageSlice(items: RawItem[], page: number, limit: number): PagedVideos {
  const start = (page - 1) * limit;
  const slice = items.slice(start, start + limit);
  return {
    page,
    limit,
    total: items.length,
    hasMore: start + limit < items.length,
    items: slice as unknown as VideoCard[],
  };
}

export async function listLatest(page = 1, limit = DEFAULT_PAGE_SIZE, _signal?: AbortSignal): Promise<PagedVideos> {
  const { items, posters, videyNo } = await loadItems();
  const main = sortByNewest(mainCatalog(items));
  const start = (page - 1) * limit;
  const slice = main.slice(start, start + limit);
  return {
    page,
    limit,
    total: main.length,
    hasMore: start + limit < main.length,
    items: slice.map((x) => toCard(x, posters, videyNo)),
  };
}

export async function listHome(limit = DEFAULT_PAGE_SIZE): Promise<{
  featured: VideoCard[];
  latest: PagedVideos;
}> {
  const { items, posters, videyNo } = await loadItems();
  const main = sortByNewest(mainCatalog(items));
  const featured = main.slice(0, 8).map((x) => toCard(x, posters, videyNo));
  const latest = await listLatest(1, limit);
  return { featured, latest };
}

export async function listCategory(
  category: string,
  page = 1,
  limit = DEFAULT_PAGE_SIZE,
  _signal?: AbortSignal,
): Promise<PagedVideos> {
  const { items, posters, videyNo } = await loadItems();
  const s = category.toLowerCase().trim();
  let pool: RawItem[];
  if (s === "jav") pool = items.filter(isPutarin);
  else if (s === "ai-plus" || s === "streamtape") pool = items.filter(isStreamtape);
  else if (s === "videy") pool = items.filter(isVidey);
  else pool = mainCatalog(items).filter((x) => slugOf(x) === s);
  pool = sortByNewest(pool);
  const start = (page - 1) * limit;
  const slice = pool.slice(start, start + limit);
  return {
    page,
    limit,
    total: pool.length,
    hasMore: start + limit < pool.length,
    items: slice.map((x) => toCard(x, posters, videyNo)),
  };
}

export async function listSearch(q: string, page = 1, limit = DEFAULT_PAGE_SIZE, _signal?: AbortSignal): Promise<PagedVideos> {
  const key = q.trim().toLowerCase();
  if (!key) return listLatest(page, limit, _signal);
  const { items, posters, videyNo } = await loadItems();
  const pool = sortByNewest(
    items.filter((x) => (x.title || "").toLowerCase().includes(key) || (x.id || "").toLowerCase().includes(key)),
  );
  const start = (page - 1) * limit;
  const slice = pool.slice(start, start + limit);
  return {
    page,
    limit,
    total: pool.length,
    hasMore: start + limit < pool.length,
    items: slice.map((x) => toCard(x, posters, videyNo)),
  };
}

export async function getDetail(id: string): Promise<VideoDetail | null> {
  const { items, posters, videyNo } = await loadItems();
  const item = items.find((x) => x.id === id);
  if (!item) return null;
  const card = toCard(item, posters, videyNo);
  return {
    ...card,
    playable: true,
    description: card.description,
  } as VideoDetail;
}

export async function listRelated(id: string, limit = 12): Promise<PagedVideos> {
  const { items, posters, videyNo } = await loadItems();
  const current = items.find((x) => x.id === id);
  if (!current) {
    return { page: 1, limit, total: 0, hasMore: false, items: [] };
  }
  let pool: RawItem[];
  if (isStreamtape(current)) pool = items.filter((x) => x.id !== id && isStreamtape(x));
  else if (isPutarin(current)) pool = items.filter((x) => x.id !== id && isPutarin(x));
  else if (isVidey(current)) pool = items.filter((x) => x.id !== id && isVidey(x));
  else {
    const slug = slugOf(current);
    pool = mainCatalog(items).filter((x) => x.id !== id && slugOf(x) === slug);
  }
  pool = sortByNewest(pool).slice(0, limit);
  return {
    page: 1,
    limit,
    total: pool.length,
    hasMore: false,
    items: pool.map((x) => toCard(x, posters, videyNo)),
  };
}

export async function listCategories(): Promise<{ slug: string; label: string; count: number }[]> {
  const { items } = await loadItems();
  const counts = new Map<string, number>();
  for (const it of items) {
    const s = slugOf(it);
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  const out: { slug: string; label: string; count: number }[] = [];
  for (const [slug, count] of counts) {
    const cat = findCategory(slug);
    out.push({ slug, label: cat?.label || slug, count });
  }
  return out.sort((a, b) => b.count - a.count);
}
