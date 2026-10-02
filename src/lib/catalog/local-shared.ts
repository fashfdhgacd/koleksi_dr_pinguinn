import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { findCategory } from "./categories";

export const CACHE_MS = 10 * 60 * 1000;
export const STALE_MS = 30 * 60 * 1000;

export function feedUrl(path: string): string {
  const t = Math.floor(Date.now() / 600_000);
  return `${path}${path.includes("?") ? "&" : "?"}t=${t}`;
}

export const BOT_FEEDS = [
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/videos-latest.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/latest-posters.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguinn/main/data/putarin-latest.json",
  "https://raw.githubusercontent.com/fashfdhgacd/koleksi_dr_pinguin/main/data/putarin.json",
];

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
  haystack: { item: RawItem; hay: string }[];
};

export let cache: CatalogCache | null = null;
export let inflight: Promise<CatalogCache> | null = null;

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
    if (typeof v === "string" && v.startsWith("http")) out[k] = v;
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

export function withIds(items: RawItem[]): RawItem[] {
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
export function isSideSilo(item: RawItem): boolean {
  return isPutarin(item) || isStreamtape(item) || isVidey(item);
}
/**
 * Halaman Utama / Terbaru = IndoAV + Userbokep SAJA (prioritas monetisasi).
 * AI Streamtape, Putarin/JAV, Videy tetap ada di kategori masing-masing — tidak numpuk di Terbaru.
 */
export function mainCatalog(items: RawItem[]): RawItem[] {
  // Hanya IndoAV + Userbokep di beranda; urutan final di buildMainSorted
  const indo = items.filter((x) => isIndoAv(x));
  const ub = items.filter((x) => isUserBokep(x) && !isIndoAv(x));
  const core = [...indo, ...ub];
  return core.length ? core : items.filter((x) => !isVidey(x));
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
export function slugOf(item: RawItem): string {
  if (isVidey(item)) return "videy";
  if (isPutarin(item)) return "jav";
  if (isStreamtape(item)) return "ai-plus";
  const raw = (item.category || "").toLowerCase().trim();
  const mapped = raw && raw !== "lainnya" ? findCategory(raw) : undefined;
  if (mapped && mapped.slug !== "lainnya") return mapped.slug;
  const hit = classify(item.title || "");
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
  return item.source || "Unknown";
}

export const PLACEHOLDER_IMAGE_RE =
  /placeholder|1x1|transparent|data:image\/gif|please.?watch|original.?website/i;

export function videyFile(item: RawItem): string {
  if (!item.id || !isVidey(item)) return "";
  const direct = String(item.direct || item.embed || "");
  if (/cdn\.videy\.co/i.test(direct)) return direct;
  return "";
}

export function directPoster(url: string): string {
  const u = String(url || "").trim();
  if (!u.startsWith("http")) return "";
  if (PLACEHOLDER_IMAGE_RE.test(u)) return "";
  if (/cdnhlsplayer\.lat/i.test(u)) return "";
  if (/\/api\/(img-proxy|tape-thumb|embed-thumb|puterin-thumb)/i.test(u)) return "";
  return u;
}

export function javCoverFromTitle(title = ""): string {
  const m = String(title).match(/\b([A-Z]{2,8})[-_ ]?(\d{3,4})\b/i);
  if (!m) return "";
  const code = (m[1] + m[2]).toLowerCase();
  return `https://pics.dmm.co.jp/digital/video/${code}/${code}pl.jpg`;
}

export function thumbOf(item: RawItem, posters: Record<string, string>): string {
  const id = item.id;
  if (isVidey(item)) return "";
  return (
    directPoster(posters[id]) ||
    directPoster(posters[embedKey(item.embed || "")]) ||
    directPoster(String(item.poster || "")) ||
    directPoster(String(item.thumbnail || "")) ||
    (isPutarin(item) ? javCoverFromTitle(String(item.title || "")) : "") ||
    ""
  );
}

export function videyDisplayTitle(_item: RawItem, index: number): string {
  return `Videy koleksidrpinguin.com ${index}`;
}

export function isUsable(item: RawItem): boolean {
  if (isVidey(item)) return false;
  if (!item?.id || typeof item.id !== "string") return false;
  if (item.id.length < 3) return false;
  const play = String(item.embed || item.direct || "").trim();
  if (!play) return false;
  if (/^https?:\/\//i.test(play) || play.startsWith("/")) return true;
  return play.length >= 6;
}

export function toCard(item: RawItem, posters: Record<string, string>, videyNo?: Map<string, number>): VideoCard {
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
