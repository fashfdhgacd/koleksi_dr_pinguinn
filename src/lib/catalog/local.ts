import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { findCategory } from "./categories";
import localCatalog from "./videos.json";
import streamtapeBatch from "./streamtape.json";
import localPosters from "./posters.json";

/** In-memory cache katalog — 5 menit, selaras dengan hero time-slot. */
const CACHE_MS = 90 * 1000;

const BOT_FEEDS = [
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/putarin-latest.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/putarin.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguin/main/data/putarin.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/videos-latest.json",
  "https://cdn.jsdelivr.net/gh/fashfdhgacd/koleksi_dr_pinguinn@main/data/videos-latest.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/campur-latest.json",
];

const REMOTE_ENABLED =
  typeof process !== "undefined" &&
  (process.env.CATALOG_REMOTE === "1" || process.env.CATALOG_REMOTE === "true");

const SITE_FEEDS = REMOTE_ENABLED
  ? [
      "https://www.koleksidrpinguin.site/data/videos-latest.json",
  "https://cdn.jsdelivr.net/gh/fashfdhgacd/koleksi_dr_pinguinn@main/data/videos-latest.json",
      "https://www.koleksidrpinguin.site/data/putarin-latest.json",
      "https://www.koleksidrpinguin.site/data/campur-latest.json",
      "https://www.koleksidrpinguin.site/data/videos.json",
      "https://www.koleksidrpinguin.site/data/campur.json",
      "https://www.koleksidrpinguin.site/data/putarin.json",
    ]
  : [];

const POSTER_URLS = REMOTE_ENABLED
  ? [
      "https://www.koleksidrpinguin.site/data/posters.json",
      "https://www.koleksidrpinguin.site/data/latest-posters.json",
    ]
  : [];

type RawItem = {
  id: string;
  title: string;
  embed: string;
  direct?: string;
  source?: string;
  category?: string;
  date?: string;
  updated_at?: string;
  tags?: string[];
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

function cleanTitle(title: string, keepBrand = false): string {
  let t = title
    .replace(/^\u25b6\s*/, "")
    .replace(/^\uD83C\uDFAC\s*/, "")
    .replace(/^judul\s*[:：-]\s*/i, "")
    .replace(/^title\s*[:：-]\s*/i, "")
    .replace(/Collection Dr\.?\s*Anjing Bokep[^,]*[,.]?\s*S\.\s*M\.\s*Sc\.?/gi, "");
  if (!keepBrand) {
    t = t
      .replace(/\bAI-\s*koleksidrpinguin\.(com|site)\b/gi, "")
      .replace(/koleksidrpinguin\.(com|site)/gi, "");
  }
  return (
    t
      .replace(/dibokepindo\.com/gi, "")
      .replace(/playbokep\.id/gi, "")
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
  return embedId(embed) || embed;
}

function blobOf(item: RawItem): string {
  return `${item.embed} ${item.direct || ""} ${item.source || ""} ${item.title || ""}`;
}

function isIndoAv(item: RawItem): boolean {
  return /indoav|tv1\.indoav/i.test(blobOf(item));
}

function isUserBokep(item: RawItem): boolean {
  return /userbokep|tv1\.userbokep/i.test(blobOf(item));
}

function isPutarin(item: RawItem): boolean {
  return /putarin|puterin|doodstream|ds2play|ds2video|panel\.putarin/i.test(blobOf(item));
}

function isStreamtape(item: RawItem): boolean {
  return /streamtape/i.test(blobOf(item));
}

function isVidey(item: RawItem): boolean {
  return /videy\.co|cdn\.videy|\bvidey\b/i.test(blobOf(item));
}

function isSideSilo(item: RawItem): boolean {
  return isPutarin(item) || isStreamtape(item) || isVidey(item);
}

function mainCatalog(items: RawItem[]): RawItem[] {
  return items.filter((x) => !isSideSilo(x));
}

function videyFile(item: RawItem): string {
  if (item.direct && /cdn\.videy\.co\/.+\.(mp4|mov)($|\?)/i.test(item.direct)) return item.direct;
  const id = embedId(item.embed || item.direct || "");
  if (!id || !isVidey(item)) return "";
  const ext = id.length === 9 && id.charAt(8) === "2" ? ".mov" : ".mp4";
  return `https://cdn.videy.co/${id}${ext}`;
}

function videyFallbacks(item: RawItem): string[] {
  const file = videyFile(item);
  if (!file) return [];
  const id = embedId(item.embed || item.direct || file);
  if (!id) return [file];
  const mp4 = `https://cdn.videy.co/${id}.mp4`;
  const mov = `https://cdn.videy.co/${id}.mov`;
  return file.endsWith(".mov") ? [file, mp4] : [file, mov];
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

const SOURCE_MAP: Record<string, string> = {
  indoav: "IndoAV",
  "indoav.app": "IndoAV",
  userbokep: "UserBokep",
  "userbokep.com": "UserBokep",
  putarin: "Putarin",
  streamtape: "Streamtape",
  videy: "videy",
  "videy.co": "videy",
};

function sourceLabel(item: RawItem): string {
  const s = (item.source || "").toLowerCase();
  for (const [k, v] of Object.entries(SOURCE_MAP)) {
    if (s.includes(k)) return v;
  }
  if (isIndoAv(item)) return "IndoAV";
  if (isUserBokep(item)) return "UserBokep";
  if (isPutarin(item)) return "Putarin";
  if (isStreamtape(item)) return "Streamtape";
  if (isVidey(item)) return "Videy";
  return item.source || "Unknown";
}

const PLACEHOLDER_IMAGE_RE =
  /picsum\.photos|loremflickr|placeholder|placehold\.co|via\.placeholder|dummyimage/i;

function thumbOf(item: RawItem, posters: Record<string, string>): string {
  const id = item.id;
  if (isVidey(item)) {
    const videy = videyFile(item);
    if (videy) return videy;
  }
  const fromPoster = posters[id] || posters[embedKey(item.embed || "")] || "";
  if (fromPoster && !PLACEHOLDER_IMAGE_RE.test(fromPoster)) {
    return fromPoster;
  }
  const videy = videyFile(item);
  if (videy) return videy;
  const eid = embedId(item.embed || item.direct || "") || id;
  if (isStreamtape(item) && eid) return `/brand-poster.jpg`;
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
  let creator: string | null = sourceLabel(item);
  if (isVidey(item)) {
    quality = "Videy";
    creator = "Videy";
  } else if (isStreamtape(item)) {
    quality = "Streamtape";
  } else if (isPutarin(item)) {
    quality = "Puterin";
  }
  return {
    id,
    title,
    thumbnail: thumbOf(item, posters),
    description: title,
    category: slugOf(item),
    duration: null,
    durationLabel: "",
    quality,
    year: null,
    creator,
    views: null,
  };
}

function toDetail(item: RawItem, posters: Record<string, string>, videyNo?: Map<string, number>): VideoDetail {
  const card = toCard(item, posters, videyNo);
  const qualities: { label: string; url: string; format: string }[] = [];
  const videyUrls = videyFallbacks(item);
  for (const url of videyUrls) {
    if (!qualities.some((q) => q.url === url)) {
      qualities.push({ label: "Videy MP4", url, format: "mp4" });
    }
  }
  if (!isVidey(item) && item.embed) {
    qualities.push({ label: "Embed", url: item.embed, format: "iframe" });
  }
  if (!isVidey(item) && item.direct && item.direct !== item.embed) {
    qualities.push({ label: "Direct", url: item.direct, format: "mp4" });
  }
  const primary = isVidey(item)
    ? videyUrls[0] || item.direct || item.embed
    : item.embed;
  return {
    ...card,
    video_url: primary,
    qualities,
    subjects: [card.category],
    playable: Boolean(primary),
  };
}

function pageOf<T>(arr: T[], page: number, limit: number) {
  const p = Math.max(1, page || 1);
  const lim = Math.min(Math.max(1, limit || DEFAULT_PAGE_SIZE), 48);
  const start = (p - 1) * lim;
  const slice = arr.slice(start, start + lim);
  return { slice, total: arr.length, hasMore: start + lim < arr.length, page: p, limit: lim };
}

let cache: {
  at: number;
  items: RawItem[];
  posters: Record<string, string>;
  videyNo: Map<string, number>;
} | null = null;

function numberVidey(items: RawItem[]): Map<string, number> {
  const map = new Map<string, number>();
  let n = 1;
  for (const it of items) {
    if (!isVidey(it) || !it.id || map.has(it.id)) continue;
    map.set(it.id, n++);
  }
  return map;
}

async function fetchJson(url: string): Promise<unknown> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function normalizeList(raw: unknown): RawItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as RawItem[];
  if (typeof raw === "object" && raw !== null && "items" in raw && Array.isArray((raw as any).items)) {
    return (raw as any).items as RawItem[];
  }
  return [];
}

function fallbackId(item: RawItem): string {
  const basis = `${item.embed || ""}|${item.direct || ""}|${item.title || ""}`;
  let hash = 0;
  for (let i = 0; i < basis.length; i++) {
    hash = (hash * 31 + basis.charCodeAt(i)) | 0;
  }
  return `gen-${Math.abs(hash).toString(36)}`;
}

function withId(it: RawItem): RawItem {
  return it?.id ? it : { ...it, id: fallbackId(it) };
}

function itemTime(it: RawItem): number {
  if (it.updated_at) {
    const t = Date.parse(it.updated_at);
    if (Number.isFinite(t)) return t;
  }
  if (it.date) {
    const t = Date.parse(it.date.length === 10 ? `${it.date}T23:59:59.000Z` : it.date);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

function isNewer(a: RawItem, b: RawItem): boolean {
  return itemTime(a) >= itemTime(b);
}

function sortByNewest(items: RawItem[]): RawItem[] {
  return items
    .map((it, index) => ({ it, index, t: itemTime(it) }))
    .sort((a, b) => {
      if (b.t !== a.t) return b.t - a.t;
      return a.index - b.index;
    })
    .map((x) => x.it);
}

async function loadItems(): Promise<{
  items: RawItem[];
  posters: Record<string, string>;
  videyNo: Map<string, number>;
}> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;

  const base: RawItem[] = [];

  const posters: Record<string, string> = {
    ...(typeof localPosters === "object" && localPosters ? (localPosters as Record<string, string>) : {}),
  };

  const botResults = await Promise.all(BOT_FEEDS.map((url) => fetchJson(url)));
  for (const data of botResults) {
    const list = normalizeList(data);
    for (const it of list) {
      if (it?.embed) base.push(withId(it as RawItem));
    }
  }

  if (REMOTE_ENABLED) {
    const [siteResults, posterResults] = await Promise.all([
      Promise.all(SITE_FEEDS.map((url) => fetchJson(url))),
      Promise.all(POSTER_URLS.map((url) => fetchJson(url))),
    ]);
    for (const data of siteResults) {
      const list = normalizeList(data);
      for (const it of list) {
        if (it?.embed) base.push(withId(it as RawItem));
      }
    }
    for (const data of posterResults) {
      if (data && typeof data === "object") Object.assign(posters, data);
    }
  }

  if (Array.isArray(localCatalog)) {
    for (const it of localCatalog as RawItem[]) {
      if (it?.embed) base.push(withId(it));
    }
  }
  if (Array.isArray(streamtapeBatch)) {
    for (const it of streamtapeBatch as RawItem[]) {
      if (it?.embed) base.push(withId(it));
    }
  }

  const map = new Map<string, RawItem>();
  for (const it of base) {
    if (!it?.id) continue;
    const prev = map.get(it.id);
    if (!prev || isNewer(it, prev)) {
      map.set(it.id, prev ? { ...prev, ...it } : it);
    } else {
      map.set(it.id, { ...it, ...prev });
    }
  }

  const items = sortByNewest(Array.from(map.values()));
  const videyNo = numberVidey(items);

  cache = { at: Date.now(), items, posters, videyNo };
  return cache;
}

export async function listLatest(page = 1, limit = DEFAULT_PAGE_SIZE, _signal?: AbortSignal): Promise<PagedVideos> {
  const { items, posters, videyNo } = await loadItems();
  // Terbaru = katalog utama SAJA (IndoAV/UserBokep). Streamtape hanya di tab AI+.
  const main = sortByNewest(mainCatalog(items));
  const { slice, total, hasMore, page: p, limit: lim } = pageOf(main, page, limit);
  return { page: p, limit: lim, total, hasMore, items: slice.map((x) => toCard(x, posters, videyNo)) };
}

export async function listFeatured(page = 1, limit = 8, _signal?: AbortSignal): Promise<PagedVideos> {
  const { items, posters, videyNo } = await loadItems();
  const main = mainCatalog(items);

  const indo = main.filter(isIndoAv);
  const user = main.filter(isUserBokep);
  const pool =
    indo.length >= 12 ? indo : user.length >= 12 ? [...indo, ...user] : main.length ? main : items;

  if (!pool.length) {
    return { page: 1, limit: 0, total: 0, hasMore: false, items: [] };
  }

  const SLOT_MS = 5 * 60 * 1000;
  const slot = Math.floor(Date.now() / SLOT_MS);
  const want = Math.min(Math.max(1, limit || 8), 16, pool.length);
  const start = slot % pool.length;

  const picked: RawItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < pool.length && picked.length < want; i++) {
    const it = pool[(start + i) % pool.length];
    if (!it?.id || seen.has(it.id)) continue;
    seen.add(it.id);
    picked.push(it);
  }

  return {
    page: 1,
    limit: picked.length,
    total: pool.length,
    hasMore: false,
    items: picked.map((x) => toCard(x, posters, videyNo)),
  };
}

export async function listCategory(slug: string, page = 1, limit = DEFAULT_PAGE_SIZE, _signal?: AbortSignal): Promise<PagedVideos> {
  const { items, posters, videyNo } = await loadItems();
  const s = slug.toLowerCase().trim();
  let pool: RawItem[];
  if (s === "videy") {
    pool = items.filter(isVidey);
  } else if (s === "jav" || s === "putarin" || s === "puterin") {
    pool = items.filter(isPutarin);
  } else if (s === "ai-plus" || s === "ai+" || s === "streamtape" || s === "streampie") {
    pool = items.filter(isStreamtape);
  } else {
    pool = mainCatalog(items).filter((x) => slugOf(x) === s);
  }
  const { slice, total, hasMore, page: p, limit: lim } = pageOf(pool, page, limit);
  return { page: p, limit: lim, total, hasMore, items: slice.map((x) => toCard(x, posters, videyNo)) };
}

export async function listSearch(q: string, page = 1, limit = DEFAULT_PAGE_SIZE, _signal?: AbortSignal): Promise<PagedVideos> {
  if (!q || !q.trim()) {
    return listLatest(page, limit, _signal);
  }
  const key = q.trim().toLowerCase();
  const { items, posters, videyNo } = await loadItems();
  const filtered = items.filter((x) =>
    `${x.title} ${x.source ?? ""} ${x.category ?? ""} ${slugOf(x)}`.toLowerCase().includes(key),
  );
  const { slice, total, hasMore, page: p, limit: lim } = pageOf(filtered, page, limit);
  return { page: p, limit: lim, total, hasMore, items: slice.map((x) => toCard(x, posters, videyNo)) };
}

export async function getDetail(id: string, _signal?: AbortSignal): Promise<VideoDetail> {
  const { items, posters, videyNo } = await loadItems();
  const item = items.find((x) => x.id === id) || items.find((x) => embedId(x.embed || x.direct || "") === id);
  if (!item) {
    throw Object.assign(new Error("Video tidak ditemukan."), { code: "not_found" as const });
  }
  return toDetail(item, posters, videyNo);
}

function takeRoundRobin(buckets: RawItem[][], limit: number): RawItem[] {
  const copies = buckets.map((b) => b.slice());
  const out: RawItem[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (out.length < limit && guard < 4000) {
    guard++;
    let added = false;
    for (const bucket of copies) {
      while (bucket.length) {
        const v = bucket.shift()!;
        if (!v.id || seen.has(v.id)) continue;
        seen.add(v.id);
        out.push(v);
        added = true;
        break;
      }
      if (out.length >= limit) break;
    }
    if (!added) break;
  }
  return out;
}

const RELATED_SLOT_MS = 15 * 60 * 1000;
const RELATED_POOL_MAX = 240;

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function uniquePool(list: RawItem[], max = RELATED_POOL_MAX): RawItem[] {
  const out: RawItem[] = [];
  const seen = new Set<string>();
  for (const it of list) {
    if (!it?.id || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
    if (out.length >= max) break;
  }
  return out;
}

function rotatePick(pool: RawItem[], limit: number, seedKey: string): RawItem[] {
  if (!pool.length) return [];
  const want = Math.min(Math.max(1, limit || 12), pool.length);
  const slot = Math.floor(Date.now() / RELATED_SLOT_MS);
  const start = (slot + hashSeed(seedKey)) % pool.length;
  const out: RawItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < pool.length && out.length < want; i++) {
    const it = pool[(start + i) % pool.length];
    if (!it?.id || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

export async function listRelated(id: string, limit = 12, _signal?: AbortSignal): Promise<PagedVideos> {
  const { items, posters, videyNo } = await loadItems();
  const current = items.find((x) => x.id === id) || items.find((x) => embedId(x.embed || x.direct || "") === id);
  if (!current) {
    return { page: 1, limit, total: 0, hasMore: false, items: [] };
  }

  let pool: RawItem[];
  if (isVidey(current)) {
    const rest = items.filter((x) => x.id !== current.id);
    pool = takeRoundRobin(
      [rest.filter(isIndoAv), rest.filter(isUserBokep), rest.filter(isVidey)],
      RELATED_POOL_MAX,
    );
  } else if (isPutarin(current)) {
    pool = uniquePool(items.filter((x) => x.id !== current.id && isPutarin(x)));
  } else if (isStreamtape(current)) {
    pool = uniquePool(items.filter((x) => x.id !== current.id && isStreamtape(x)));
  } else {
    const main = mainCatalog(items).filter((x) => x.id !== current.id);
    const sameCat = main.filter((x) => slugOf(x) === slugOf(current));
    const sameSet = new Set(sameCat.map((x) => x.id));
    const indoSame = sameCat.filter(isIndoAv);
    const userSame = sameCat.filter(isUserBokep);
    const restSame = sameCat.filter((x) => !isIndoAv(x) && !isUserBokep(x));
    const indoAll = main.filter(isIndoAv);
    const userAll = main.filter(isUserBokep);
    pool = uniquePool([
      ...indoSame,
      ...userSame,
      ...restSame,
      ...indoAll.filter((x) => !sameSet.has(x.id)),
      ...userAll.filter((x) => !sameSet.has(x.id)),
      ...main.filter((x) => !isIndoAv(x) && !isUserBokep(x) && !sameSet.has(x.id)),
    ]);
  }

  const picked = rotatePick(pool, limit, current.id);

  return { page: 1, limit, total: pool.length, hasMore: false, items: picked.map((x) => toCard(x, posters, videyNo)) };
}
