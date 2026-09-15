import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { findCategory } from "./categories";
import localCatalog from "./videos.json";
import streamtapeBatch from "./streamtape.json";
import localPosters from "./posters.json";

const CACHE_MS = 5 * 60 * 1000;

/** Bot uploads di GitHub — selalu di-fetch server-side (bukan hanya kalau CATALOG_REMOTE). */
const BOT_FEEDS = [
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/putarin-latest.json",
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
      .replace(/Collection Dr\.?\s*Anjing Bokep[^,]*[,.]?\s*S\.\s*M\.\s*Sc\.?/gi, "")
      .replace(/koleksidrpinguin\.(com|site)/gi, "")
      .replace(/dibokepindo\.com/gi, "")
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
  return out;
}

let cache: { at: number; items: RawItem[]; posters: Record<string, string> } | null = null;

function basePosters(): Record<string, string> {
  const map: Record<string, string> = {};
  const raw = localPosters as Record<string, unknown>;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      const src = String(value || "").trim();
      if (!key || !/^https?:\/\//i.test(src)) continue;
      map[key] = src;
      map[key.toLowerCase()] = src;
    }
  }
  return map;
}

async function loadPosters(): Promise<Record<string, string>> {
  const map = basePosters();
  if (!POSTER_URLS.length) return map;
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

async function fetchJsonList(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "kdp-catalog" },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function loadBotFeeds(): Promise<unknown[]> {
  return Promise.all(BOT_FEEDS.map((url) => fetchJsonList(url)));
}

async function loadRemoteLists(): Promise<unknown[]> {
  if (!SITE_FEEDS.length) return [];
  return Promise.all(SITE_FEEDS.map((url) => fetchJsonList(url)));
}

async function loadItems(): Promise<{ items: RawItem[]; posters: Record<string, string> }> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache;

  const localPacks: unknown[] = [streamtapeBatch, localCatalog];

  let bot: unknown[] = [];
  let remote: unknown[] = [];
  let posters: Record<string, string> = basePosters();
  try {
    const tasks: Promise<unknown>[] = [loadBotFeeds()];
    if (REMOTE_ENABLED) {
      tasks.push(loadRemoteLists(), loadPosters());
    }
    const settled = await Promise.all(tasks);
    bot = settled[0] as unknown[];
    if (REMOTE_ENABLED) {
      remote = settled[1] as unknown[];
      posters = settled[2] as Record<string, string>;
    }
  } catch {
    /* keep local */
  }

  // Bot feeds dulu (terbaru), lalu remote opsional, lalu bundle lokal.
  const items = prioritizeMain(merge([...bot, ...remote, ...localPacks]));
  cache = { at: now, items, posters };
  return cache;
}

function blobOf(item: RawItem): string {
  return `${item.embed} ${item.direct || ""} ${item.source || ""} ${item.category || ""}`;
}

function isIndoAv(item: RawItem): boolean {
  return /indoav/i.test(blobOf(item));
}

function isUserBokep(item: RawItem): boolean {
  return /userbokep/i.test(blobOf(item));
}

function isPutarin(item: RawItem): boolean {
  return /putarin|puterin/i.test(blobOf(item));
}

function isStreamtape(item: RawItem): boolean {
  return /streamtape|strcloud|tapecontent/i.test(blobOf(item));
}

/** Silo samping: tidak masuk Terbaru / hero / related IndoAV. */
function isSideSilo(item: RawItem): boolean {
  return isPutarin(item) || isStreamtape(item);
}

function mainRank(item: RawItem): number {
  if (isIndoAv(item)) return 3;
  if (isUserBokep(item)) return 2;
  return 1;
}

function prioritizeMain(items: RawItem[]): RawItem[] {
  return [...items].sort((a, b) => mainRank(b) - mainRank(a));
}

function mainCatalog(items: RawItem[]): RawItem[] {
  return items.filter((x) => !isSideSilo(x));
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
  const blob = blobOf(item);

  if (id) {
    const hit = posters[id] || posters[id.toLowerCase()];
    if (hit) return hit;
  }

  const videy = videyFile(item);
  if (videy) return videy;

  if (id && /streamtape|strcloud|tapecontent/i.test(blob)) {
    return `/api/tape-thumb?id=${encodeURIComponent(id)}`;
  }

  return "";
}

function normalizeCategorySlug(raw?: string): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-");
  if (findCategory(key)) return findCategory(key)!.slug;
  const aliases: Record<string, string> = {
    "open bo": "open-bo",
    openbo: "open-bo",
    umum: "lainnya",
    other: "lainnya",
    puterin: "jav",
    putarin: "jav",
    streamtape: "ai-plus",
    streampie: "ai-plus",
    ai: "ai-plus",
    "ai+": "ai-plus",
  };
  const aliased = aliases[key] || aliases[raw.trim().toLowerCase()];
  if (aliased && findCategory(aliased)) return aliased;
  return null;
}

function seoBlurb(title: string, label: string): string {
  const t = cleanTitle(title);
  return `Nonton ${t} bokep Indo ${label} full di Dr. Pinguin. Streaming amatir, jilbab, tante, viral. Konten 18+.`;
}

function toCard(item: RawItem, posters: Record<string, string>): VideoCard {
  const slug = slugOf(item);
  const label = findCategory(slug)?.label ?? "Lainnya";
  const title = cleanTitle(item.title || "");
  let quality = item.source || "HD";
  let creator: string | null = item.source || null;
  if (isIndoAv(item)) {
    quality = "IndoAV";
    creator = "IndoAV";
  } else if (isUserBokep(item)) {
    quality = "UserBokep";
    creator = "UserBokep";
  } else if (isPutarin(item)) {
    quality = "Putarin";
    creator = "Putarin";
  } else if (isStreamtape(item)) {
    quality = "Streamtape";
    creator = "Streamtape";
  }
  return {
    id: item.id,
    title,
    thumbnail: thumbOf(item, posters),
    description: seoBlurb(title, label),
    category: label,
    duration: null,
    durationLabel: "\u2014",
    quality,
    year: null,
    creator,
    views: null,
  };
}

function toDetail(item: RawItem, posters: Record<string, string>): VideoDetail {
  const card = toCard(item, posters);
  const qualities: VideoDetail["qualities"] = [];
  if (isIndoAv(item)) {
    qualities.push({ label: "IndoAV", url: item.embed, format: "embed" });
  } else if (isPutarin(item)) {
    qualities.push({ label: "Putarin", url: item.embed, format: "embed" });
  } else if (isStreamtape(item)) {
    qualities.push({ label: "Streamtape", url: item.embed, format: "embed" });
  } else {
    qualities.push({ label: item.source || "Embed", url: item.embed, format: "embed" });
  }
  if (item.direct && item.direct !== item.embed) {
    qualities.push({ label: "Direct", url: item.direct, format: "direct" });
  }
  const videy = videyFile(item);
  if (videy && !qualities.some((q) => q.url === videy)) {
    qualities.push({ label: "Videy", url: videy, format: "mp4" });
  }
  return {
    ...card,
    video_url: isIndoAv(item) || isPutarin(item) || isStreamtape(item) ? item.embed : videy || item.embed,
    qualities,
    subjects: [card.category, "bokep indo"],
    playable: Boolean(videy || item.embed),
  };
}

function slugOf(item: RawItem): string {
  if (isPutarin(item)) return "jav";
  if (isStreamtape(item)) return "ai-plus";
  return normalizeCategorySlug(item.category) || classify(item.title || "");
}

export async function listLatest(page = 1, limit = DEFAULT_PAGE_SIZE, _signal?: AbortSignal): Promise<PagedVideos> {
  const { items, posters } = await loadItems();
  const main = mainCatalog(items);
  const { slice, total, hasMore } = pageOf(main, page, limit);
  return { page, limit, total, hasMore, items: slice.map((x) => toCard(x, posters)) };
}

const FEATURED_SLOT_MS = 5 * 60 * 1000;

function mulberry32(seed: number) {
  let a = seed | 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSeeded<T>(items: T[], seed: number): T[] {
  const copy = items.slice();
  const rng = mulberry32(seed);
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/** Satu judul IndoAV acak per slot 5 menit — tidak campur Puterin/Streamtape. */
export async function listFeatured(page = 1, limit = 1, _signal?: AbortSignal): Promise<PagedVideos> {
  const { items, posters } = await loadItems();
  const indo = items.filter(isIndoAv);
  const slot = Math.floor(Date.now() / FEATURED_SLOT_MS);
  const shuffled = shuffleSeeded(indo, slot);
  const take = Math.max(1, limit);
  const picked = shuffled.slice(0, Math.min(take, shuffled.length));
  return {
    page,
    limit: take,
    total: indo.length,
    hasMore: false,
    items: picked.map((x) => toCard(x, posters)),
  };
}

export async function listCategory(slug: string, page = 1, limit = DEFAULT_PAGE_SIZE, _signal?: AbortSignal): Promise<PagedVideos> {
  const { items, posters } = await loadItems();
  const key = (findCategory(slug)?.slug || slug).toLowerCase();
  let filtered: RawItem[];
  if (key === "jav") {
    filtered = items.filter(isPutarin);
  } else if (key === "ai-plus") {
    filtered = items.filter(isStreamtape);
  } else {
    filtered = mainCatalog(items).filter((x) => slugOf(x) === key);
  }
  const { slice, total, hasMore } = pageOf(filtered, page, limit);
  return { page, limit, total, hasMore, items: slice.map((x) => toCard(x, posters)) };
}

export async function listSearch(q: string, page = 1, limit = DEFAULT_PAGE_SIZE, _signal?: AbortSignal): Promise<PagedVideos> {
  const key = q.trim().toLowerCase();
  const { items, posters } = await loadItems();
  // Cari di semua silo; hasil tetap bisa dibuka. Related tetap silo sendiri.
  const filtered = items.filter((x) =>
    `${x.title} ${x.source ?? ""} ${x.category ?? ""} ${slugOf(x)}`.toLowerCase().includes(key),
  );
  const { slice, total, hasMore } = pageOf(filtered, page, limit);
  return { page, limit, total, hasMore, items: slice.map((x) => toCard(x, posters)) };
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
  } else {
    // Katalog utama: IndoAV dulu, UserBokep kedua; tidak campur silo samping.
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
    // dedupe preserve order
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
