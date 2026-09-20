import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { findCategory } from "./categories";
import localCatalog from "./videos.json";
import streamtapeBatch from "./streamtape.json";
import putarinBatch from "./putarin.json";
import postersMap from "./posters.json";

const CACHE_MS = 10 * 60 * 1000;
const STALE_MS = 30 * 60 * 1000;

function feedUrl(path: string): string {
  const t = Math.floor(Date.now() / 600_000);
  return `${path}${path.includes("?") ? "&" : "?"}t=${t}`;
}

const BOT_FEEDS = [
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/videos-latest.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/latest-posters.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/putarin-latest.json",
];

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

type CatalogCache = {
  at: number;
  items: RawItem[];
  posters: Record<string, string>;
  videyNo: Map<string, number>;
  byId: Map<string, RawItem>;
  bySlug: Map<string, RawItem[]>;
  mainSorted: RawItem[];
  haystack: { item: RawItem; hay: string }[];
};

let cache: CatalogCache | null = null;
let inflight: Promise<CatalogCache> | null = null;

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
    const r = await fetch(feedUrl(url), {
      signal: AbortSignal.timeout(4000),
      headers: { accept: "application/json", "user-agent": "kdp-catalog/1.1" },
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
  return /indoav/i.test(`${item.embed || ""} ${item.source || ""} ${item.direct || ""}`);
}
function isUserBokep(item: RawItem): boolean {
  return /userbokep/i.test(`${item.embed || ""} ${item.source || ""} ${item.direct || ""}`);
}
function isPutarin(item: RawItem): boolean {
  return /putarin|puterin/i.test(`${item.embed || ""} ${item.source || ""} ${item.direct || ""}`);
}
function isStreamtape(item: RawItem): boolean {
  return /streamtape|strcloud/i.test(`${item.embed || ""} ${item.source || ""} ${item.direct || ""}`);
}
function isVidey(item: RawItem): boolean {
  return /videy/i.test(`${item.embed || ""} ${item.source || ""} ${item.direct || ""}`);
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
  if (/jilbab|hijab|tudung/.test(t)) return "jilbab";
  if (/tante|milf/.test(t)) return "tante";
  if (/istri|suami|selingkuh/.test(t)) return "istri";
  if (/kosan|kontrakan|indekos/.test(t)) return "kosan";
  if (/amatir|reallife|real ?couple/.test(t)) return "amatir";
  if (/viral/.test(t)) return "viral";
  if (/\blive\b|bokep live/.test(t)) return "live";
  if (/abg|\bsma\b|\bsmk\b|mahasisw/.test(t)) return "abg";
  if (/colmek|\bcoli\b/.test(t)) return "colmek";
  if (/doggy/.test(t)) return "doggy";
  if (/open\s*bo|openbo/.test(t)) return "open-bo";
  if (/malaysia|\bmalay\b/.test(t)) return "malaysia";
  if (/chindo|cina indo/.test(t)) return "chindo";
  if (/gangbang|threesome|\bgroup\b/.test(t)) return "gangbang";
  if (/percakapan|obrolan/.test(t)) return "percakapan";
  return "lainnya";
}
function slugOf(item: RawItem): string {
  if (isVidey(item)) return "videy";
  if (isPutarin(item)) return "jav";
  if (isStreamtape(item)) return "ai-plus";
  const raw = (item.category || "").toLowerCase().trim();
  const mapped = raw && raw !== "lainnya" ? findCategory(raw) : undefined;
  if (mapped && mapped.slug !== "lainnya") return mapped.slug;
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

const PLACEHOLDER_IMAGE_RE =
  /placeholder|1x1|transparent|data:image\/gif|please.?watch|original.?website/i;

function videyFile(item: RawItem): string {
  if (!item.id || !isVidey(item)) return "";
  const direct = String(item.direct || item.embed || "");
  if (/cdn\.videy\.co/i.test(direct)) return direct;
  return "";
}

function proxiedPoster(url: string): string {
  if (!url.startsWith("http")) return "";
  if (PLACEHOLDER_IMAGE_RE.test(url)) return "";
  if (/embedan\.com/i.test(url)) return `/api/img-proxy?u=${encodeURIComponent(url)}`;
  return url;
}

function thumbOf(item: RawItem, posters: Record<string, string>): string {
  const id = item.id;
  if (isVidey(item)) {
    const videy = videyFile(item);
    if (videy) return videy;
  }
  const fromPoster =
    posters[id] ||
    posters[embedKey(item.embed || "")] ||
    String(item.poster || "") ||
    String(item.thumbnail || "");
  const proxied = proxiedPoster(fromPoster);
  if (proxied) return proxied;
  const eid = embedId(item.embed || item.direct || "") || id;
  if (isIndoAv(item) && eid) return `/api/embed-thumb?id=${encodeURIComponent(eid)}&src=indoav`;
  if (isUserBokep(item) && eid) return `/api/embed-thumb?id=${encodeURIComponent(eid)}&src=userbokep`;
  if (isStreamtape(item) && eid) return `/api/tape-thumb?id=${encodeURIComponent(eid)}`;
  if (isPutarin(item) && eid) return `/api/puterin-thumb?id=${encodeURIComponent(eid)}`;
  return "";
}

function videyDisplayTitle(_item: RawItem, index: number): string {
  return `Videy koleksidrpinguin.com ${index}`;
}

function isUsable(item: RawItem): boolean {
  if (!item?.id || typeof item.id !== "string") return false;
  if (item.id.length < 3) return false;
  const play = String(item.embed || item.direct || "").trim();
  if (!play) return false;
  if (/^https?:\/\//i.test(play) || play.startsWith("/")) return true;
  return play.length >= 6;
}

function toCard(item: RawItem, posters: Record<string, string>, videyNo?: Map<string, number>): VideoCard {
  const id = item.id;
  const title = isVidey(item)
    ? videyDisplayTitle(item, videyNo?.get(id) || 1)
    : cleanTitle(item.title || "Video");
  let quality = "HD";
  if (isStreamtape(item)) quality = "Streamtape";
  else if (isPutarin(item)) quality = "Puterin";
  return {
    id,
    title,
    thumbnail: thumbOf(item, posters),
    description: "",
    category: slugOf(item),
    duration: typeof item.duration === "number" ? item.duration : null,
    durationLabel: "\u2014",
    quality,
    year: null,
    creator: sourceLabel(item),
    views: null,
  };
}

function sortByNewest(items: RawItem[]): RawItem[] {
  return [...items].sort((a, b) => Number(b.createdAt || b.date || 0) - Number(a.createdAt || a.date || 0));
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

function buildIndexes(
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
  const mainSorted = sortByNewest(mainCatalog(items));
  for (const [slug, list] of bySlug) {
    bySlug.set(slug, sortByNewest(list));
  }
  return { at, items, posters, videyNo, byId, bySlug, mainSorted, haystack };
}

function pageOf(pool: RawItem[], page: number, limit: number, posters: Record<string, string>, videyNo: Map<string, number>): PagedVideos {
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

function assembleLocal(): { items: RawItem[]; posters: Record<string, string> } {
  const local = asList(localCatalog).filter(isUsable);
  const st = asList(streamtapeBatch).filter(isUsable);
  const pu = asList(putarinBatch).filter(isUsable);
  const posters: Record<string, string> = { ...(postersMap as Record<string, string>) };
  return { items: uniqById([...st, ...pu, ...local]), posters };
}

async function refreshRemote(base: { items: RawItem[]; posters: Record<string, string> }): Promise<CatalogCache> {
  const posters = { ...base.posters };
  const remote: RawItem[] = [];
  const botResults = await Promise.all(BOT_FEEDS.map((url) => fetchJson(url)));
  for (const data of botResults) {
    remote.push(...asList(data).filter(isUsable));
    Object.assign(posters, asPosterMap(data));
  }
  const items = uniqById([...remote, ...base.items]);
  const videyNo = buildVideyNo(items);
  return buildIndexes(items, posters, videyNo, Date.now());
}

function seedLocalCache(): CatalogCache {
  const local = assembleLocal();
  return buildIndexes(local.items, local.posters, buildVideyNo(local.items), Date.now());
}

function kickRemoteRefresh(base: { items: RawItem[]; posters: Record<string, string> }): void {
  if (inflight) return;
  inflight = refreshRemote(base)
    .then((next) => {
      cache = next;
      return next;
    })
    .catch(() => cache as CatalogCache)
    .finally(() => {
      inflight = null;
    });
}

export async function loadItems(): Promise<CatalogCache> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache;
  if (cache && now - cache.at < STALE_MS) {
    kickRemoteRefresh({ items: cache.items, posters: cache.posters });
    return cache;
  }
  if (!cache) cache = seedLocalCache();
  kickRemoteRefresh({ items: cache.items, posters: cache.posters });
  return cache;
}

export async function listLatest(page = 1, limit = DEFAULT_PAGE_SIZE, _signal?: AbortSignal): Promise<PagedVideos> {
  const { mainSorted, posters, videyNo } = await loadItems();
  return pageOf(mainSorted, page, limit, posters, videyNo);
}

export async function listFeatured(page = 1, limit = 8, _signal?: AbortSignal): Promise<PagedVideos> {
  const { mainSorted, posters, videyNo } = await loadItems();
  const withArt = mainSorted.filter((x) => Boolean(thumbOf(x, posters)));
  const pool = withArt.length >= limit ? withArt : mainSorted;
  return pageOf(pool, page, limit, posters, videyNo);
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
  if (s === "jav") pool = bySlug.get("jav") || items.filter(isPutarin);
  else if (s === "ai-plus" || s === "streamtape") pool = bySlug.get("ai-plus") || items.filter(isStreamtape);
  else if (s === "videy") pool = bySlug.get("videy") || items.filter(isVidey);
  else pool = bySlug.get(s) || mainSorted.filter((x) => slugOf(x) === s);
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
    if (tokens.every((t) => row.hay.includes(t))) matched.push(row.item);
  }
  return pageOf(sortByNewest(matched), page, limit, posters, videyNo);
}

export async function getDetail(id: string, _signal?: AbortSignal): Promise<VideoDetail> {
  const { byId, posters, videyNo } = await loadItems();
  const item = byId.get(id);
  if (!item) {
    throw Object.assign(new Error("Video tidak ditemukan"), { code: "not_found" as const });
  }
  const card = toCard(item, posters, videyNo);
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
  const { items, posters, videyNo, bySlug, mainSorted } = await loadItems();
  const current = items.find((x) => x.id === id) || null;
  if (!current) {
    return pageOf(mainSorted.filter((x) => x.id !== id), 1, limit, posters, videyNo);
  }
  const slug = slugOf(current);
  let pool = (bySlug.get(slug) || []).filter((x) => x.id !== id);
  if (pool.length < limit) {
    const extra = mainSorted.filter((x) => x.id !== id && slugOf(x) !== slug);
    const seen = new Set(pool.map((x) => x.id));
    for (const x of extra) {
      if (seen.has(x.id)) continue;
      pool.push(x);
      if (pool.length >= limit * 2) break;
    }
  }
  pool = pool.slice(0, limit);
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
    const cat = findCategory(slug);
    out.push({ slug, label: cat?.label || slug, count: list.length });
  }
  return out.sort((a, b) => b.count - a.count);
}
