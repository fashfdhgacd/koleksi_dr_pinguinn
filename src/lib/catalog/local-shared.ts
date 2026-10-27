import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { LEGACY_CATEGORY_SLUGS, SEO_MIN_COUNT, findCategory } from "./categories";
import {
  EXTRA_CATEGORY_RULES,
  GENERIC_CATEGORY_SLUGS,
  RAW_CATEGORY_ALIASES,
  SOFT_RAW_CATEGORY_ALIASES,
  normCategoryText,
  refineCategory,
} from "./title-category.js";
import siteLikesSnapshot from "./site-likes.json";
import { DRP_CATEGORY, DRP_SOURCES, drpKindOfItem } from "./drp-hosts.js";

/** Our own D1 likes (video_likes), 12-hour snapshot written by the stats workflow. Cards only. */
const SITE_LIKES = siteLikesSnapshot as unknown as Record<string, number>;

export const CACHE_MS = 10 * 60 * 1000;
export const STALE_MS = 30 * 60 * 1000;

export function feedUrl(path: string): string {
  const t = Math.floor(Date.now() / 600_000);
  return `${path}${path.includes("?") ? "&" : "?"}t=${t}`;
}

/**
 * Live feeds re-read per isolate. Empty since Oct 19 2026 (cost cut): the last one,
 * raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguin/main/data/putarin.json (the OLD repo,
 * unchanged since Oct 7 2026; the bot writes to this repo's data/ files, which reach the site through
 * the build), is bundled as putarin-feed-20261007.json instead. Every refresh used to cost one GitHub
 * subrequest plus a full catalog rebuild (~0.2-0.5 s CPU) per isolate every 10 min (~21k/day).
 * Earlier the three data/ feeds of this repo were dropped (Oct 13): they always answered 404.
 */
export const BOT_FEEDS: string[] = [];

export type RawItem = {
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

export type CatalogCache = {
  at: number;
  items: RawItem[];
  posters: Record<string, string>;
  videyNo: Map<string, number>;
  byId: Map<string, RawItem>;
  bySlug: Map<string, RawItem[]>;
  mainSorted: RawItem[];
  /** Terbaru order: page 1 IndoAV-only, then 3 IndoAV : 1 UserBokep; no Videy, no Byse/Dood/Lulu. */
  terbaruSorted: RawItem[];
  /** Mixed page order for some categories (bokep: H,H,IndoAV; jav: 2 IndoAV/UserBokep : 1 Puterin). */
  listOrder: Map<string, RawItem[]>;
  haystack: { item: RawItem; hay: string }[];
};

/**
 * One catalog per isolate. The build emits this module twice (Nitro server chunk for middleware/API
 * and the SSR router bundle), so a module-local object meant every cold isolate built the ~10k-item
 * indexes twice (e.g. /watch: watch-placeholder middleware, then the page). globalThis lets both
 * copies share the same built cache. Data is identical (same bundled JSON); no KV writes, no timers.
 */
type CatalogRuntime = { cache: CatalogCache | null; inflight: Promise<CatalogCache> | null };
const RUNTIME_KEY = "__kdpCatalogRuntimeV1";
const runtimeHost = globalThis as unknown as Record<string, CatalogRuntime | undefined>;
export const runtime: CatalogRuntime = (runtimeHost[RUNTIME_KEY] ??= { cache: null, inflight: null });

/** Safe startsWith that never throws if value is not a string. */
export function safeStartsWith(value: unknown, prefix: string): boolean {
  if (typeof value !== "string") return false;
  return value.startsWith(prefix);
}

export function asList(data: unknown): RawItem[] {
  if (Array.isArray(data)) return data as RawItem[];
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as RawItem[];
    if (Array.isArray(o.videos)) return o.videos as RawItem[];
  }
  return [];
}

export function asPosterMap(data: unknown): Record<string, string> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (safeStartsWith(v, "http")) out[k] = v as string;
  }
  return out;
}

export async function fetchJson(url: string): Promise<unknown> {
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

export function embedId(embed = ""): string {
  const m =
    String(embed).match(/\/(?:e|v|d)\/([A-Za-z0-9_-]+)/i) ||
    String(embed).match(/[?&]id=([A-Za-z0-9_-]+)/i);
  return m ? m[1] : "";
}

export function embedKey(embed = ""): string {
  return embedId(embed) || String(embed).slice(0, 64);
}

/** Coerce any value to a string without throwing (repair, never drop). */
export function toStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return Number.isFinite(Number(v)) ? String(v) : "";
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = toStr(x);
      if (s) return s;
    }
    return "";
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return typeof o.url === "string" ? o.url : "";
  }
  return "";
}

const STRING_FIELDS = ["id", "title", "embed", "direct", "category", "source", "poster", "thumbnail", "date", "creator"] as const;

/** Single sanitizer for every raw catalog item: repairs field types so nothing downstream can crash. */
export function repairItem(raw: unknown): RawItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item: RawItem = { ...(raw as RawItem) };
  for (const k of STRING_FIELDS) {
    if (k in item && typeof item[k] !== "string") (item as Record<string, unknown>)[k] = toStr(item[k]);
  }
  if ("tags" in item) {
    const t = item.tags;
    item.tags = (Array.isArray(t) ? t : t == null ? [] : [t]).map(toStr).filter(Boolean);
  }
  if (!item.title || !item.title.trim()) item.title = "Video";
  if (item.createdAt != null && typeof item.createdAt !== "string" && typeof item.createdAt !== "number") item.createdAt = toStr(item.createdAt);
  if (item.duration != null && typeof item.duration !== "number") {
    const n = Number(item.duration);
    item.duration = Number.isFinite(n) ? n : undefined;
  }
  return item;
}

export function withIds(items: RawItem[]): RawItem[] {
  const out: RawItem[] = [];
  for (const rawItem of items) {
    const item = repairItem(rawItem);
    if (!item) continue;
    let id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id || id.length < 3) {
      id = embedId(String(item.embed || "")) || embedId(String(item.direct || ""));
    }
    if (!id || id.length < 3) continue;
    out.push(id === item.id ? item : { ...item, id });
  }
  return out;
}

export function isIndoAv(item: RawItem): boolean {
  return /indoav/i.test(`${item.embed || ""} ${item.source || ""} ${item.direct || ""}`);
}
export function isUserBokep(item: RawItem): boolean {
  return /userbokep/i.test(`${item.embed || ""} ${item.source || ""} ${item.direct || ""}`);
}
export function isPutarin(item: RawItem): boolean {
  return /putarin|puterin/i.test(`${item.embed || ""} ${item.source || ""} ${item.direct || ""}`);
}
export function isStreamtape(item: RawItem): boolean {
  return /streamtape|strcloud/i.test(`${item.embed || ""} ${item.source || ""} ${item.direct || ""}`);
}
export function isVidey(item: RawItem): boolean {
  return /videy/i.test(`${item.embed || ""} ${item.source || ""} ${item.direct || ""}`);
}
/** Owner's own LuluStream / DoodStream / Byse uploads -> "Koleksi Dr. Pinguin Bokep" (/kategori/bokep). */
export function isDrpBokep(item: RawItem): boolean {
  return Boolean(drpKindOfItem(item));
}
export function isSideSilo(item: RawItem): boolean {
  return isPutarin(item) || isStreamtape(item) || isVidey(item);
}
/**
 * Halaman Utama / Terbaru = SEMUA item usable (IndoAV, UserBokep, Streamtape, Putarin, dll).
 * Filter source dihapus supaya homepage menampilkan isi JSON penuh (~7000+).
 */
export function mainCatalog(items: RawItem[]): RawItem[] {
  // Videy is back (2026-10-13): only items with a playable cdn mp4 reach here (isUsable).
  return items;
}
export function cleanTitle(t: string): string {
  return t.replace(/\s+/g, " ").trim() || "Video";
}
export function classify(title: string): string {
  const t = title.toLowerCase();
  if (/jilbab|hijab|tudung|kerudung/.test(t)) return "jilbab";
  if (/tante|milf|janda/.test(t)) return "tante";
  if (/istri|suami|selingkuh/.test(t)) return "istri";
  if (/kosan|kontrakan|indekos/.test(t)) return "kosan";
  if (/viral/.test(t)) return "viral";
  if (/\blive\b|bokep live/.test(t)) return "live";
  if (/abg|\bsma\b|\bsmk\b|mahasisw|remaja/.test(t)) return "abg"; // not "tocil": adult slang
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
/** Public category slug of an item (internal classifier keys like "abg" mapped to their current slug). */
/**
 * Anime / hentai by title, any source (Putarin, IndoAV, UserBokep, Lulu/Dood/Byse, Streamtape, Videy).
 * Real JAV (product code / FC2) never matches, so /kategori/jav stays live-action only.
 */
const JAV_CODE_RE = /\b[a-z]{2,6}[-_ ]?\d{3,5}\b|\bfc2\b/i;
const INDO_WORD_RE =
  /\b(?:indo|bokep|ngentot|ngewe|cewek|cowok|yang|sama|lagi|pacar|tante|abg|viral|colmek|jilbab|hijab|live|mesum|sange|toket|memek|kontol|tobrut|mahasiswi|janda|istri|suami|dientot|crot|mesra|video|toge|mulus)\b/i;
const HENTAI_STRONG_RE = /\bhentai\b|\bthe animation\b|\bova\b/i;
const ANIME_EP_RE = /\beps?\s*\d{1,3}\b|\bs\d{1,2}e\d{1,3}\b/i;
const ROMAJI_RE =
  /\b(?:tsuma|netori|ojisan|nikubenki|hitozuma|onee|imouto|oppai|ecchi|kyoushitsu|seikatsu|gakuen|ojou|yuusha|hime|joushi|kanojo|musume|desuga|shitara|ikasetara)\b/i;
const PARTICLE_RE = /\b(?:wa|ga|wo|ni|no|desu)\b/gi;
export function isHentaiTitle(title: string): boolean {
  const t = String(title || "").trim();
  if (!t || JAV_CODE_RE.test(t) || INDO_WORD_RE.test(t)) return false;
  if (HENTAI_STRONG_RE.test(t) || ANIME_EP_RE.test(t) || ROMAJI_RE.test(t)) return true;
  return new Set(t.toLowerCase().match(PARTICLE_RE) || []).size >= 2;
}
export function slugOf(item: RawItem): string {
  // Owner override from /pemilik (KV owner:edit:v1, set in local-cache.ts) beats every auto rule.
  const owner = typeof item.ownerCategory === "string" ? findCategory(item.ownerCategory) : undefined;
  if (owner) return owner.slug;
  if (isHentaiTitle(item.title || "")) return "hentai";
  let s = slugOfRaw(item);

  // Owner rule 2026-10-22: /kategori/jav holds ONLY Putarin. Other sources with a JAV-ish title or a
  // "jav" source label get their next-best category instead (never hidden).
  if (s === "jav" && !isPutarin(item)) s = nonJavSlug(item);
  return LEGACY_CATEGORY_SLUGS[s] || s;
}
function nonJavSlug(item: RawItem): string {
  const title = item.title || "";
  const base = classify(title);
  if (!GENERIC_CATEGORY_SLUGS.has(base)) return base === "abg" ? refineCategory(base, title) : base;
  const t = normCategoryText(title);
  for (const [slug, re] of EXTRA_CATEGORY_RULES as [string, RegExp][]) {
    if (slug !== "jav" && re.test(t)) return slug;
  }
  if (isIndoAv(item) || isUserBokep(item)) return "amatir";
  return "lainnya";
}
function slugOfRaw(item: RawItem): string {
  if (isVidey(item)) return "videy";
  if (isDrpBokep(item)) return DRP_CATEGORY;
  const raw = (item.category || "").toLowerCase().trim();
  const title = item.title || "";
  // An explicit AI GAY upload (#aigay / "kategori: ai gay") wins over the host default.
  // Same for the 2026-10-26 SEO categories (#blunder, "kategori: kelas bintang", ...). No stored
  // category of a live video names one of them, so no live video moves.
  const seo = raw ? findCategory(raw)?.slug : undefined;
  if (seo && seo in SEO_MIN_COUNT) return seo;
  if (isPutarin(item)) return "jav";
  if (isStreamtape(item)) return "ai-plus";
  // Explicit source/bot category naming one of the newer categories (bule, bumil, tobrut, ...).
  const alias = RAW_CATEGORY_ALIASES[raw as keyof typeof RAW_CATEGORY_ALIASES];
  if (alias && findCategory(alias)) return alias;
  // Loose source-folder labels (stw, bule, tobrut, outdoor, ...) are hints, not explicit categories.
  const isSoft = Object.prototype.hasOwnProperty.call(SOFT_RAW_CATEGORY_ALIASES, raw);
  const mapped = raw && raw !== "lainnya" && !isSoft ? findCategory(raw) : undefined;
  if (mapped && mapped.slug !== "lainnya") {
    // Explicit categories stay; only the generic / unlisted buckets can be refined.
    if (mapped.slug === "teen-18") return refineCategory("abg", title);
    return mapped.slug === "amatir" ? refineCategory(mapped.slug, title) : mapped.slug;
  }
  const base = classify(title);
  if (!GENERIC_CATEGORY_SLUGS.has(base)) return refineCategory(base, title);
  // Source hints (stw → tante, artis → selebgram, toilet → kamar mandi) before generic title themes.
  const soft = SOFT_RAW_CATEGORY_ALIASES[raw as keyof typeof SOFT_RAW_CATEGORY_ALIASES];
  if (soft && findCategory(soft)) return soft;
  const hit = refineCategory(base, title);
  if (hit !== "lainnya") return hit;
  if (isIndoAv(item) || isUserBokep(item)) return "amatir";
  return "lainnya";
}
export function sourceLabel(item: RawItem): string {
  if (isIndoAv(item)) return "IndoAV";
  if (isUserBokep(item)) return "UserBokep";
  if (isPutarin(item)) return "Putarin";
  if (isStreamtape(item)) return "Streamtape";
  if (isVidey(item)) return "Videy";
  const drp = drpKindOfItem(item);
  if (drp) return DRP_SOURCES[drp as keyof typeof DRP_SOURCES];
  return item.source || "Unknown";
}

export const PLACEHOLDER_IMAGE_RE =
  /placeholder|1x1|transparent|data:image\/gif|please.?watch|original.?website/i;

export function videyFile(item: RawItem): string {
  if (!item.id || !isVidey(item)) return "";
  const direct = String(item.direct || item.embed || "");
  if (/cdn\.videy\.co/i.test(direct)) return direct;
  // Videy mirror file (cdn2.aceimg.com/<id>.mp4), played as stored.
  if (/^https:\/\/cdn\d*\.aceimg\.com\/[A-Za-z0-9]+\.mp4$/i.test(direct)) return direct;
  return "";
}

export function directPoster(url: unknown): string {
  const u = String(url || "").trim();
  if (!safeStartsWith(u, "http")) return "";
  if (PLACEHOLDER_IMAGE_RE.test(u)) return "";
  if (/cdnhlsplayer\.lat/i.test(u)) return "";
  if (/\/api\/(img-proxy|tape-thumb|embed-thumb|puterin-thumb)/i.test(u)) return "";
  return fixDmmCover(u);
}

/**
 * Stored poster maps (jav-posters.json etc.) hold DMM URLs built from the short id
 * (.../digital/video/sone011/sone011pl.jpg), which redirect to "NOW PRINTING". Rewrite them to
 * the real content id; "" (brand poster) when DMM has no cover for that code.
 */
export function fixDmmCover(url: string): string {
  const m = url.match(/^https?:\/\/pics\.dmm\.co\.jp\/digital\/video\/([a-z]{2,8})(\d{3,4})\/\1\2pl\.jpg$/i);
  if (!m) return url;
  return javCoverFromTitle(`${m[1]}-${m[2]}`);
}

/**
 * DMM digital covers live under the 5-digit content id (sone011 -> sone00011). The short id
 * (sone011) 302-redirects to DMM's "NOW PRINTING" placeholder, which is why most Jav cards showed it.
 * SOD/Faleno labels carry a "1" prefix on DMM (star716 -> 1star00716).
 */
const JAV_DMM_ONE_PREFIX = new Set(["star", "stars", "start", "sdmu", "sdnm", "fsdss", "dldss", "msfh", "iene", "fns"]);
/** Codes checked by hand: a different DMM content id, or "" when DMM has no cover (brand poster). */
const JAV_DMM_OVERRIDES: Record<string, string> = {
  abp901: "118abp00901",
  abp906: "118abp00906",
  vrtm168: "h_910vrtm00168",
  abw177: "",
  ekdv592: "",
  hez882: "",
  hez894: "",
  heyzo2054: "",
  onez229: "",
};

export function javCoverFromTitle(title = ""): string {
  const m = String(title).match(/\b([A-Z]{2,8})[-_ ]?(\d{3,4})\b/i);
  if (!m) return "";
  const label = m[1].toLowerCase();
  const key = label + m[2];
  let cid: string;
  if (Object.prototype.hasOwnProperty.call(JAV_DMM_OVERRIDES, key)) cid = JAV_DMM_OVERRIDES[key];
  else if (label === "heyzo") cid = "";
  else cid = `${JAV_DMM_ONE_PREFIX.has(label) ? "1" : ""}${label}${String(Number(m[2])).padStart(5, "0")}`;
  if (!cid) return "";
  return `https://pics.dmm.co.jp/digital/video/${cid}/${cid}pl.jpg`;
}

/** Videy frame grabbed once by .github/workflows/videy-thumbs.yml, served as a static asset. */
export function videyThumb(item: RawItem): string {
  const id = String(item.id || "").replace(/[^A-Za-z0-9_-]/g, "");
  return id ? `/videy-thumbs/${id}.jpg` : "";
}

/** Videy ids that have public/videy-thumbs/<id>.jpg, listed at build time by vite.config.ts. */
declare const __VIDEY_THUMB_IDS__: string[] | undefined;
let videyThumbSet: Set<string> | null | undefined;
function videyThumbIds(): Set<string> | null {
  if (videyThumbSet === undefined) {
    videyThumbSet = typeof __VIDEY_THUMB_IDS__ !== "undefined" && Array.isArray(__VIDEY_THUMB_IDS__) ? new Set(__VIDEY_THUMB_IDS__) : null;
  }
  return videyThumbSet;
}

/** A Videy item whose frame is still missing this long after upload is left out of public lists. */
export const VIDEY_NO_THUMB_HIDE_HOURS = 6;
export const VIDEY_NO_THUMB_HIDE_MS = VIDEY_NO_THUMB_HIDE_HOURS * 3_600_000;

/** True when the build has no frame for this Videy item (unknown thumb list = false, never hides). */
export function videyMissingThumb(item: RawItem): boolean {
  if (!isVidey(item)) return false;
  const ids = videyThumbIds();
  if (!ids) return false;
  const id = String(item.id || "").replace(/[^A-Za-z0-9_-]/g, "");
  return Boolean(id) && !ids.has(id);
}

/**
 * When a Videy item without a frame drops out of public lists (upload time + 6 h), or 0 when it never
 * does (has a frame / not Videy). An unknown upload time counts as old. The frame failing to grab
 * usually means the cdn file is dead, so its player would not play either.
 */
export function videyNoThumbHideAt(item: RawItem, uploadedMs: number): number {
  if (!videyMissingThumb(item)) return 0;
  return uploadedMs > 0 ? uploadedMs + VIDEY_NO_THUMB_HIDE_MS : 1;
}

export function thumbOf(item: RawItem, posters: Record<string, string>): string {
  const id = item.id;
  if (isVidey(item)) return videyThumb(item);
  return (
    directPoster(posters[id]) ||
    directPoster(posters[embedKey(item.embed || "")]) ||
    directPoster(item.poster) ||
    directPoster(item.thumbnail) ||
    (isPutarin(item) ? javCoverFromTitle(String(item.title || "")) : "") ||
    // Putarin without a known poster: the embed's own image (decrypted server-side). The card tries
    // R2 first, then /thumb/<id> which resolves the same image once and stores it in R2.
    (isPutarin(item) && /^[A-Za-z0-9]{6,20}$/.test(id) ? `https://koleksidrpinguin.com/api/puterin-thumb?id=${id}` : "") ||
    ""
  );
}

export function videyDisplayTitle(_item: RawItem, index: number): string {
  return `Videy koleksidrpinguin.com ${index}`;
}

export function isUsable(item: RawItem): boolean {
  // Videy plays in our own player from the cdn mp4, so a Videy item needs that file URL.
  if (isVidey(item)) return Boolean(item?.id && typeof item.id === "string" && videyFile(item));
  if (!item?.id || typeof item.id !== "string") return false;
  if (item.id.length < 3) return false;
  const play = String(item.embed || item.direct || "").trim();
  if (!play) return false;
  if (/^https?:\/\//i.test(play) || safeStartsWith(play, "/")) return true;
  return play.length >= 6;
}

function fmtDuration(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}j ${m}m` : m ? `${m}m ${r}s` : `${r}s`;
}

export function toCard(item: RawItem, posters: Record<string, string>, videyNo?: Map<string, number>): VideoCard {
  const id = item.id;
  const title =
    isVidey(item) && !String(item.title || "").trim()
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
    durationLabel: typeof item.duration === "number" && item.duration > 0 ? fmtDuration(item.duration) : "\u2014",
    quality,
    year: null,
    creator: sourceLabel(item),
    views: typeof item.views === "number" ? item.views : null,
    likes: typeof item.likes === "number" ? item.likes : null,
    siteLikes: typeof SITE_LIKES[id] === "number" && SITE_LIKES[id] > 0 ? SITE_LIKES[id] : null,
  };
}
