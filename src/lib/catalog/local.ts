import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { findCategory } from "./categories";
import localCatalog from "./videos.json";
import streamtapeBatch from "./streamtape.json";
import localPosters from "./posters.json";

const CACHE_MS = 60 * 1000;

/** Bot uploads di GitHub — selalu di-fetch server-side (bukan hanya kalau CATALOG_REMOTE). */
const BOT_FEEDS = [
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/putarin-latest.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/putarin.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguin/main/data/putarin.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/videos-latest.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/campur-latest.json",
];

const REMOTE_ENABLED =
  typeof process !== "undefined" &&
  (process.env.CATALOG_REMOTE === "1" || process.env.CATALOG_REMOTE === "true");

const SITE_FEEDS = REMOTE_ENABLED
  ? [
      "https://www.koleksidrpinguin.site/data/videos-latest.json",
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
      .replace(/^\uD83C\uDFAC\s*/, "")
      .replace(/^judul\s*[:：-]\s*/i, "")
      .replace(/^title\s*[:：-]\s*/i, "")
      .replace(/Collection Dr\.?\s*Anjing Bokep[^,]*[,.]?\s*S\.\s*M\.\s*Sc\.?/gi, "")
      .replace(/\bAI-\s*koleksidrpinguin\.(com|site)\b/gi, "")
      .replace(/koleksidrpinguin\.(com|site)/gi, "")
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
  return /putarin|doodstream|ds2play|ds2video/i.test(blobOf(item));
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
  if (item.direct && /cdn\.videy\.co\//i.test(item.direct)) return item.direct;
  const id = embedId(item.embed || item.direct || "");
  if (!id || !/videy/i.test(`${item.embed} ${item.direct || ""} ${item.source || ""}`)) return "";
  const ext = /\.mp4$/i.test(item.direct || "") ? "" : ".mp4";
  return `https://cdn.videy.co/${id}${ext}`;
}

function bestPlayUrl(item: RawItem): string {
  const videy = videyFile(item);
  if (videy) return videy;
  return item.direct || item.embed || "";
}

function slugOf(item: RawItem): string {
  const raw = (item.category || "").toLowerCase().trim();
  if (raw && findCategory(raw)) return raw;
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

function toCard(item: RawItem, posters: Record<string, string>): VideoCard {
  const id = item.id;
  const title = cleanTitle(item.title || "Video");
  let quality = "HD";
  let creator: string | null = sourceLabel(item);
  if (isVidey(item)) {
    quality = "Videy";
    creator = "Videy";
  } else if (isStreamtape(item)) {
    quality = "Streamtape";
  } else if (isPutarin(item)) {
    quality = "Putarin";
  }
  const thumb =
    posters[id] ||
    posters[embedKey(item.embed)] ||
    `https://picsum.photos/seed/${id}/640/360`;
  return {
    id,
    title,
    thumbnail: thumb,
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

function toDetail(item: RawItem, posters: Record<string, string>): VideoDetail {
  const card = toCard(item, posters);
  const qualities: { label: string; url: string; format: string }[] = [];
  if (item.embed) {
    qualities.push({ label: "Embed", url: item.embed, format: "iframe" });
  }
  if (item.direct && item.direct !== item.embed) {
    qualities.push({ label: "Direct", url: item.direct, format: "mp4" });
  }
  const videy = videyFile(item);
  if (videy && !qualities.some((q) => q.url === videy)) {
    qualities.push({ label: "Videy", url: videy, format: "mp4" });
  }
  return {
    ...card,
    video_url: isIndoAv(item) || isPutarin(item) || isStreamtape(item) ? item.embed : videy || item.embed,
    qualities,
    subjects: [card.category],
    playable: Boolean(videy || item.embed),
  };
}

function pageOf<T>(arr: T[], page: number, limit: number) {
  const p = Math.max(1, page || 1);
  const lim = Math.min(Math.max(1, limit || DEFAULT_PAGE_SIZE), 48);
  const start = (p - 1) * lim;
  const slice = arr.slice(start, start + lim);
  return { slice, total: arr.length, hasMore: start + lim < arr.length, page: p, limit: lim };
}

let cache: { at: number; items: RawItem[]; posters: Record<string, string> } | null = null;

async function fetchJson(url: string): Promise<unknown> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
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

async function loadItems(): Promise<{ items: RawItem[]; posters: Record<string, string> }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;

  const base: RawItem[] = [
    ...(Array.isArray(localCatalog) ? (localCatalog as RawItem[]) : []),
    ...(Array.isArray(streamtapeBatch) ? (streamtapeBatch as RawItem[]) : []),
  ];

  const posters: Record<string, string> = {
    ...(typeof localPosters === "object" && localPosters ? (localPosters as Record<string, string>) : {}),
  };

  // Bot feeds always
  for (const url of BOT_FEEDS) {
    const data = await fetchJson(url);
    const list = normalizeList(data);
    for (const it of list) {
      if (it?.id && it?.embed) base.push(it);
    }
  }

  if (REMOTE_ENABLED) {
    for (const url of SITE_FEEDS) {
      const data = await fetchJson(url);
      const list = normalizeList(data);
      for (const it of list) {
        if (it?.id && it?.embed) base.push(it);
      }
    }
    for (const url of POSTER_URLS) {
      const data = await fetchJson(url);
      if (data && typeof data === "object") Object.assign(posters, data);
    }
  }

  // dedupe by id, prefer later
  const map = new Map<string, RawItem>();
  for (const it of base) {
    if (!it?.id) continue;
    map.set(it.id, it);
  }
  const items = Array.from(map.values());

  cache = { at: Date.now(), items, posters };
  return cache;
}

export async function listLatest(page = 1, limit = DEFAULT_PAGE_SIZE, _signal?: AbortSignal): Promise<PagedVideos> {
  const { items, posters } = await loadItems();
  const main = mainCatalog(items);
  const { slice, total, hasMore, page: p, limit: lim } = pageOf(main, page, limit);
  return { page: p, limit: lim, total, hasMore, items: slice.map((x) => toCard(x, posters)) };
}

export async function listFeatured(page = 1, limit = 1, _signal?: AbortSignal): Promise<PagedVideos> {
  const { items, posters } = await loadItems();
  const main = mainCatalog(items);
  const { slice, total, hasMore, page: p, limit: lim } = pageOf(main, page, limit);
  return { page: p, limit: lim, total, hasMore, items: slice.map((x) => toCard(x, posters)) };
}

export async function listCategory(slug: string, page = 1, limit = DEFAULT_PAGE_SIZE, _signal?: AbortSignal): Promise<PagedVideos> {
  const { items, posters } = await loadItems();
  const s = slug.toLowerCase().trim();
  let pool: RawItem[];
  if (s === "videy") {
    pool = items.filter(isVidey);
  } else if (s === "putarin") {
    pool = items.filter(isPutarin);
  } else if (s === "streamtape") {
    pool = items.filter(isStreamtape);
  } else {
    pool = mainCatalog(items).filter((x) => slugOf(x) === s);
  }
  const { slice, total, hasMore, page: p, limit: lim } = pageOf(pool, page, limit);
  return { page: p, limit: lim, total, hasMore, items: slice.map((x) => toCard(x, posters)) };
}

export async function listSearch(q: string, page = 1, limit = DEFAULT_PAGE_SIZE, _signal?: AbortSignal): Promise<PagedVideos> {
  if (!q || !q.trim()) {
    return listLatest(page, limit, _signal);
  }
  const key = q.trim().toLowerCase();
  const { items, posters } = await loadItems();
  const filtered = items.filter((x) =>
    `${x.title} ${x.source ?? ""} ${x.category ?? ""} ${slugOf(x)}`.toLowerCase().includes(key),
  );
  const { slice, total, hasMore, page: p, limit: lim } = pageOf(filtered, page, limit);
  return { page: p, limit: lim, total, hasMore, items: slice.map((x) => toCard(x, posters)) };
}

export async function getDetail(id: string, _signal?: AbortSignal): Promise<VideoDetail> {
  const { items, posters } = await loadItems();
  const item = items.find((x) => x.id === id);
  if (!item) {
    throw Object.assign(new Error("Video tidak ditemukan."), { code: "not_found" as const });
  }
  return toDetail(item, posters);
}

export async function listRelated(id: string, limit = 12, _signal?: AbortSignal): Promise<PagedVideos> {
  const { items, posters } = await loadItems();
  const current = items.find((x) => x.id === id);
  if (!current) {
    return { page: 1, limit, total: 0, hasMore: false, items: [] };
  }

  let pool: RawItem[];
  if (isPutarin(current)) {
    pool = items.filter((x) => x.id !== id && isPutarin(x));
  } else if (isStreamtape(current)) {
    pool = items.filter((x) => x.id !== id && isStreamtape(x));
  } else if (isVidey(current)) {
    pool = items.filter((x) => x.id !== id && isVidey(x));
  } else {
    const main = mainCatalog(items).filter((x) => x.id !== id);
    const sameCat = main.filter((x) => slugOf(x) === slugOf(current));
    const indoSame = sameCat.filter(isIndoAv);
    const userSame = sameCat.filter(isUserBokep);
    const restSame = sameCat.filter((x) => !isIndoAv(x) && !isUserBokep(x));
    const indoAll = main.filter(isIndoAv);
    const userAll = main.filter(isUserBokep);
    pool = [
      ...indoSame,
      ...userSame,
      ...restSame,
      ...indoAll.filter((x) => !sameCat.includes(x)),
      ...userAll.filter((x) => !sameCat.includes(x)),
      ...main.filter((x) => !isIndoAv(x) && !isUserBokep(x) && !sameCat.includes(x)),
    ];
    const seen = new Set<string>();
    pool = pool.filter((x) => {
      if (seen.has(x.id)) return false;
      seen.add(x.id);
      return true;
    });
  }

  const picked = pool.slice(0, limit);
  return { page: 1, limit, total: picked.length, hasMore: false, items: picked.map((x) => toCard(x, posters)) };
}
