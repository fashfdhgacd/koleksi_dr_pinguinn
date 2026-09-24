import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { findCategory } from "./categories";
import localCatalog from "./videos.json";
import streamtapeBatch from "./streamtape.json";
import streamtapeBatchSep25 from "./streamtape-batch-20260925.json";
import putarinBatch from "./putarin.json";
import postersMap from "./posters.json";
import latestVideos from "../../../data/videos-latest.json";
import latestPosters from "../../../data/latest-posters.json";

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
  // Arsip Putarin penuh (~563) dari repo lama
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguin/main/data/putarin.json",
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
      signal: AbortSignal.timeout(12000),
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

/** Arsip Putarin lama sering tanpa `id` — ambil dari /e/ atau /v/ di URL. */
function withIds(items: RawItem[]): RawItem[] {
  const out: RawItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    let id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id || id.length < 3) {
      id = embedId(String(item.embed || "")) || embedId(String(item.direct || ""));
    }
    if (!id || id.length < 3) continue;
    out.push(id === item.id ? item : { ...item, id });
  }
  return out;
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
  if (/jilbab|hijab|tudung|kerudung/.test(t)) return "jilbab";
  if (/tante|milf|janda/.test(t)) return "tante";
  if (/istri|suami|selingkuh/.test(t)) return "istri";
  if (/kosan|kontrakan|indekos/.test(t)) return "kosan";
  if (/viral/.test(t)) return "viral";
  if (/\blive\b|bokep live/.test(t)) return "live";
  if (/abg|\bsma\b|\bsmk\b|mahasisw|tocil|remaja/.test(t)) return "abg";
  if (/colmek|\bcoli\b/.test(t)) return "colmek";
  if (/doggy/.test(t)) return "doggy";
  if (/open\s*bo|openbo|\bstw\b|\blc\b|karaoke/.test(t)) return "open-bo";
  if (/malaysia|\bmalay\b/.test(t)) return "malaysia";
  if (/chindo|cina indo/.test(t)) return "chindo";
  if (/gangbang|threesome|\bgroup\b|lesbian/.test(t)) return "gangbang";
  if (/percakapan|obrolan|ngobrol/.test(t)) return "percakapan";
  if (/amatir|reallife|real ?couple|tobrut|toket|montok|semok|bondol|ngewe|ngentot|sange|sepong|suster|pacar|mantan|mesum|binor|pembantu|om\b|tete|payudara/.test(t))
    return "amatir";
  return "lainnya";
}
function slugOf(item: RawItem): string {
  if (isVidey(item)) return "videy";
  if (isPutarin(item)) return "jav";
  if (isStreamtape(item)) return "ai-plus";
  const raw = (item.category || "").toLowerCase().trim();
  const mapped = raw && raw !== "lainnya" ? findCategory(raw) : undefined;
  if (mapped && mapped.slug !== "lainnya") return mapped.slug;
  const hit = classify(item.title || "");
  if (hit !== "lainnya") return hit;
  // IndoAV / UserBokep tanpa keyword → amatir (biar Lainnya gak ngebludak)
  if (isIndoAv(item) || isUserBokep(item)) return "amatir";
  return "lainnya";
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
  // Videy removed from UI: never feed cdn.videy.co MP4 into thumbs/grids.
  if (isVidey(item)) return "";
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
  if (isVidey(item)) return false; // cabut Videy dari index/feed
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
    durationLabel: "—",
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
  const local = withIds(asList(localCatalog)).filter(isUsable);
  const latest = withIds(asList(latestVideos)).filter(isUsable);
  const st = withIds(asList(streamtapeBatch)).filter(isUsable);
  const st2 = withIds(asList(streamtapeBatchSep25)).filter(isUsable);
  const pu = withIds(asList(putarinBatch)).filter(isUsable);
  const posters: Record<string, string> = {
    ...(postersMap as Record<string, string>),
    ...asPosterMap(latestPosters),
  };
  return { items: uniqById([...latest, ...st, ...st2, ...pu, ...local]), posters };
}

async function refreshRemote(base: { items: RawItem[]; posters: Record<string, string> }): Promise<CatalogCache> {
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
  const putarinN = cache.items.filter(isPutarin).length;
  // Cold start serverless: tunggu remote sekali kalau Jav/Putarin masih tipis
  if (putarinN < 200) {
    try {
      if (inflight) cache = await inflight;
      else cache = await refreshRemote({ items: cache.items, posters: cache.posters });
    } catch {
      kickRemoteRefresh({ items: cache.items, posters: cache.posters });
    }
    return cache;
  }
  kickRemoteRefresh({ items: cache.items, posters: cache.posters });
  return cache;
}


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

/** ~85% IndoAV + ~15% UserBokep, acak per slot 5 menit. */
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
  // Hero pool: IndoAV-heavy, berubah tiap 5 menit (bukan urutan katalog tetap).
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
  }
  else if (s === "ai-plus" || s === "streamtape") {
    const hit = bySlug.get("ai-plus");
    pool = hit && hit.length ? hit : items.filter(isStreamtape);
  }
  else if (s === "videy") {
    // Videy category hidden — empty listing.
    return pageOf([], page, limit, posters, videyNo);
  }
  else pool = bySlug.get(s) || mainSorted.filter((x) => slugOf(x) === s);
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
  if (!item && inflight) {
    bag = await inflight;
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

  // Videy filtered from all related/"Tonton juga" grids.
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
    if (slug === "videy") continue; // hide Videy category chip/nav
    const nonVidey = list.filter((x) => !isVidey(x));
    if (!nonVidey.length) continue;
    const cat = findCategory(slug);
    out.push({ slug, label: cat?.label || slug, count: nonVidey.length });
  }
  return out.sort((a, b) => b.count - a.count);
}
