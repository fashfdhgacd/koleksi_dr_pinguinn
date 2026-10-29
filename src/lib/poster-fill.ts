/**
 * "Isi poster" for /pemilik: walks the public catalog in small owner-clicked batches and makes sure
 * every video has a real poster in R2 (posters/typed/<id>, the same key /thumb/<id> and the cards'
 * img.koleksidrpinguin.com URL use). Missing or placeholder copies are filled from each platform's
 * own poster source, validated by image-guard.ts first. Nothing runs on visits, no cron, no KV.
 *
 * Per platform:
 * - IndoAV / UserBokep: stored poster, else og:image of the public /d|/e page.
 * - Putarin (Puterin): stored poster, else JAV cover from the title, else the embed's player.image.
 * - Streamtape: stored poster, else file/info (+ getsplash with the existing login/key).
 * - LuluStream / DoodStream: stored poster, else the embed page poster.
 * - Byse: stored poster, else Byse's public embed details (img-place.com).
 * - Videy: no remote poster exists; frames come from the videy-thumbs workflow (ffmpeg), which a
 *   Worker cannot run. Reported as "frame belum ada" only, never fetched here.
 * Hidden videos are skipped on purpose (never published, so they never get a public poster).
 *
 * Titles (all platforms except Videy, which has none): a video still on a generic title ("Koleksi
 * Dr. Pinguin Bokep N", "Bokep Indo Pilihan <code>", a file name / page placeholder) asks the same
 * platform source for its real title. Found titles come back in `newMeta` and the owner saves them
 * with "set-auto-meta" (one commit of data/auto-meta.json per 50; fills only, never replaces a real
 * title). When the source gives nothing the id is marked "sumber-nggak-ngasih" so later sweeps skip
 * it for a week. Byse refuses server IPs on its details API, so its poster comes straight from
 * img-place.com first.
 */
import { checkImage, isPlaceholderMd5 } from "@/lib/image-guard";
import { posterKey, resolvePostersBucket } from "@/lib/poster-r2";
import { fetchPosterBytes, resolvePuterinImage } from "@/lib/puterin-poster";
import {
  fetchByseMeta,
  fetchBysePoster,
  fetchDrpPageMeta,
  fetchEmbedPageMeta,
  fetchPutarinMeta,
  fetchStreamtapeMeta,
} from "@/lib/bot/providers.js";
import { brandUploadTitle, cleanUploadTitle } from "@/lib/bot/title-brand.js";
import { NO_SOURCE, isGenericTitle, isRealTitle } from "@/lib/catalog/generic-title.js";
import autoMetaFile from "../../data/auto-meta.json";
import { drpCodeFromUrl, drpKindOfItem } from "@/lib/catalog/drp-hosts.js";
import {
  isIndoAv,
  isPutarin,
  isStreamtape,
  isUserBokep,
  isVidey,
  javCoverFromTitle,
  sourceLabel,
  thumbOf,
  videyMissingThumb,
  type RawItem,
} from "@/lib/catalog/local-shared";

/**
 * Counted requests per click (R2 head/put + platform lookups). Some lookups make 2-4 fetches inside,
 * so 30 counted stays well under the 50-subrequest limit of the smallest Workers plan.
 */
export const FILL_BUDGET = 30;
export const FILL_MAX_ITEMS = 50;

export type FillRow = {
  id: string;
  title: string;
  platform: string;
  status: "filled" | "missing";
  reason?: string;
  /** Only when the item had a generic title: found now, or the source gave none. */
  titleStatus?: "filled" | "missing";
  newTitle?: string;
};

/** Saved via "set-auto-meta": a real title, or `none` = the source gave no title (with the date). */
export type MetaEntry = { title?: string; none?: string; at?: string };

type AutoMeta = { title?: string; none?: string; at?: string };
const AUTO_META = autoMetaFile as Record<string, AutoMeta>;
/** A "sumber-nggak-ngasih" mark is retried after this long (titles sometimes appear later). */
const NO_SOURCE_RETRY_MS = 7 * 86400_000;

export type FillBatch = {
  ok: true;
  total: number;
  offset: number;
  nextOffset: number;
  done: boolean;
  /** Per platform for this batch: checked, already had a poster, filled now, still missing. */
  byPlatform: Record<
    string,
    { checked: number; had: number; filled: number; missing: number; titleFilled: number; titleMissing: number }
  >;
  rows: FillRow[];
  /** Posters found for videos whose card had no poster link at all: save once via set-posters. */
  newPosters: Record<string, string>;
  /** Real titles found for generic-titled videos, or "no source" marks: save via set-auto-meta. */
  newMeta: Record<string, MetaEntry>;
};

type Bucket = {
  head?: (key: string) => Promise<{ etag?: string } | null>;
  get: (key: string) => Promise<{ etag?: string; body: ReadableStream } | null>;
  put: (key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) => Promise<unknown>;
};

function posterEnv(): Record<string, string | undefined> {
  // Existing Streamtape vars only (no new env vars).
  return {
    STREAMTAPE_LOGIN: process.env.STREAMTAPE_LOGIN,
    STREAMTAPE_KEY: process.env.STREAMTAPE_KEY,
    STREAMTAPE_API: process.env.STREAMTAPE_API,
    PUTARIN_API_KEY: process.env.PUTARIN_API_KEY,
    PUTARIN_API_BASE: process.env.PUTARIN_API_BASE,
  };
}

/** Does this item still need a real title from its source? Never for Videy or a real title. */
export function wantsTitle(it: RawItem, now = Date.now()): boolean {
  if (isVidey(it)) return false;
  if (!isGenericTitle(String(it.title || ""), it)) return false;
  const auto = AUTO_META[it.id];
  if (auto?.title) return false;
  if (auto?.none) {
    const at = Date.parse(String(auto.at || ""));
    if (!Number.isFinite(at) || now - at < NO_SOURCE_RETRY_MS) return false;
  }
  return true;
}

/** Host title -> site title ("<clean> - koleksidrpinguin.com"), or "" when it is not a real one. */
export function siteTitleFrom(raw: unknown): string {
  const clean = cleanUploadTitle(String(raw || ""));
  if (!isRealTitle(clean)) return "";
  return brandUploadTitle(clean).slice(0, 200);
}

type Meta = { title: string; thumb: string; referer: string };

/**
 * One platform lookup for an item (title and poster), counted against the budget. Byse: the
 * img-place poster first (public), the details API only when a title is wanted.
 */
async function platformMeta(it: RawItem, wantTitle: boolean, wantThumb: boolean, spend: (n?: number) => boolean): Promise<Meta> {
  const empty: Meta = { title: "", thumb: "", referer: "" };
  const embed = embedOf(it);
  if (isIndoAv(it) || isUserBokep(it)) {
    if (!spend()) return empty;
    const fallback = isUserBokep(it) ? `https://tv1.userbokep.com/e/${it.id}` : `https://tv1.indoav.app/e/${it.id}`;
    const url = /^https:\/\//i.test(embed) ? embed : fallback;
    const meta = await fetchEmbedPageMeta(url, it.id).catch(() => null);
    return { title: String(meta?.title || ""), thumb: httpUrl(meta?.thumb), referer: url };
  }
  if (isStreamtape(it)) {
    if (!spend()) return empty;
    const fileId = embed.match(/\/(?:e|v)\/([A-Za-z0-9]+)/)?.[1] || it.id;
    const meta = await fetchStreamtapeMeta(fileId, posterEnv()).catch(() => null);
    return { title: String(meta?.title || ""), thumb: httpUrl(meta?.thumb), referer: "https://streamtape.com/" };
  }
  if (isPutarin(it)) {
    // Poster has its own path (JAV cover / player.image); only the title is asked here.
    if (!wantTitle || !posterEnv().PUTARIN_API_KEY || !spend()) return empty;
    const meta = await fetchPutarinMeta(it.id, posterEnv()).catch(() => null);
    return { title: String(meta?.title || ""), thumb: "", referer: "" };
  }
  const kind = drpKindOfItem(it);
  const code = drpCodeFromUrl(embed);
  if (kind === "byse" && code) {
    let origin = "";
    try {
      origin = new URL(embed).origin;
    } catch {
      origin = "";
    }
    const out: Meta = { ...empty, referer: origin ? `${origin}/` : "" };
    if (wantThumb && spend()) out.thumb = httpUrl(await fetchBysePoster(code).catch(() => ""));
    if (wantTitle && spend(2)) {
      const meta = await fetchByseMeta(origin, code).catch(() => null);
      out.title = String(meta?.title || "");
      if (!out.thumb) out.thumb = httpUrl(meta?.thumb);
    }
    return out;
  }
  if ((kind === "lulu" || kind === "dood") && code) {
    if (!spend()) return empty;
    const meta = await fetchDrpPageMeta(kind, embed, code).catch(() => null);
    return { title: String(meta?.title || ""), thumb: httpUrl(meta?.thumb), referer: embed };
  }
  return empty;
}

function httpUrl(v: unknown): string {
  const s = String(v || "").trim();
  return /^https:\/\//i.test(s) ? s : "";
}

function embedOf(it: RawItem): string {
  return String(it.embed || it.direct || "");
}

/** Poster URLs to try for one item: stored ones first (no fetch), then the platform lookup. */
function candidates(it: RawItem, posters: Record<string, string>, meta: Meta | null): { url: string; referer: string }[] {
  const out: { url: string; referer: string }[] = [];
  const add = (url: string, referer = "") => {
    if (url && !/\/api\/(puterin-thumb|tape-thumb|embed-thumb|img-proxy)/i.test(url) && !out.some((c) => c.url === url)) {
      out.push({ url, referer });
    }
  };
  add(httpUrl(thumbOf(it, posters)), embedOf(it));
  if (isPutarin(it)) add(javCoverFromTitle(String(it.title || "")), "");
  if (meta?.thumb) add(meta.thumb, meta.referer);
  return out;
}

export async function runPosterFill(
  items: RawItem[],
  posters: Record<string, string>,
  opts: { offset?: unknown; limit?: unknown },
): Promise<FillBatch | { ok: false; error: string }> {
  const bucket = (await resolvePostersBucket().catch(() => null)) as Bucket | null;
  if (!bucket) return { ok: false, error: "r2_unavailable" };
  // Stable order across isolates so offsets keep meaning the same video while the owner walks the list.
  const list = [...items].filter((it) => it?.id).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const total = list.length;
  const offset = Math.min(total, Math.max(0, Math.floor(Number(opts.offset) || 0)));
  const limit = Math.min(FILL_MAX_ITEMS, Math.max(1, Math.floor(Number(opts.limit) || 40)));
  let used = 0;
  const spend = (n = 1) => {
    if (used + n > FILL_BUDGET) return false;
    used += n;
    return true;
  };
  const byPlatform: FillBatch["byPlatform"] = {};
  const rows: FillRow[] = [];
  const newPosters: Record<string, string> = {};
  const newMeta: Record<string, MetaEntry> = {};
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  let i = offset;
  for (; i < Math.min(total, offset + limit); i++) {
    const it = list[i];
    const platform = sourceLabel(it);
    const stat = (byPlatform[platform] ||= { checked: 0, had: 0, filled: 0, missing: 0, titleFilled: 0, titleMissing: 0 });
    const title = String(it.title || it.id).slice(0, 90);
    if (isVidey(it)) {
      // Static frame from the videy-thumbs workflow; nothing a Worker can fetch. No title source either.
      stat.checked++;
      if (videyMissingThumb(it)) {
        stat.missing++;
        rows.push({ id: it.id, title, platform, status: "missing", reason: "videy-frame-belum-ada" });
      } else stat.had++;
      continue;
    }
    // Leave room for the worst case of this item (head + lookup(s) + 2 fetches + put, or Putarin decrypt).
    if (used + 7 > FILL_BUDGET) break;
    spend();
    const key = posterKey(it.id);
    const saved = await (bucket.head ? bucket.head(key) : bucket.get(key)).catch(() => null);
    stat.checked++;
    const needPoster = !(saved && !isPlaceholderMd5(saved.etag));
    const needTitle = wantsTitle(it, now);
    if (!needPoster && !needTitle) {
      stat.had++;
      continue;
    }
    const storedFirst = needPoster ? candidates(it, posters, null) : [];
    // Platform lookup only when it can add something: a title, or a poster nothing stored covers.
    const meta = needTitle || (needPoster && !storedFirst.length && !isPutarin(it))
      ? await platformMeta(it, needTitle, needPoster && !storedFirst.length, (n = 1) => spend(n))
      : null;

    let titleStatus: FillRow["titleStatus"];
    let newTitle = "";
    if (needTitle) {
      newTitle = siteTitleFrom(meta?.title);
      if (newTitle) {
        newMeta[it.id] = { title: newTitle };
        titleStatus = "filled";
        stat.titleFilled++;
      } else {
        newMeta[it.id] = { none: NO_SOURCE, at: today };
        titleStatus = "missing";
        stat.titleMissing++;
      }
    }

    if (!needPoster) {
      stat.had++;
      rows.push({ id: it.id, title, platform, status: "filled", reason: "poster-sudah-ada", titleStatus, newTitle: newTitle || undefined });
      continue;
    }
    let stored = "";
    let reason = "tidak-ada-sumber";
    const cands = needPoster ? candidates(it, posters, meta) : [];
    for (const c of cands.slice(0, 2)) {
      if (!spend()) break;
      const img = await fetchPosterBytes(c.url, c.referer || "https://koleksidrpinguin.com/").catch(() => null);
      const verdict = img ? await checkImage(img.buf, c.url) : { ok: false as const, reason: "fetch-failed" };
      if (!img || !verdict.ok) {
        reason = verdict.ok ? "fetch-failed" : verdict.reason;
        continue;
      }
      if (!spend()) break;
      await bucket.put(key, img.buf, { httpMetadata: { contentType: verdict.type } }).catch(() => undefined);
      stored = c.url;
      // Card had no poster link at all: it only tries R2 when it has one, so record the URL too.
      if (!httpUrl(thumbOf(it, posters))) newPosters[it.id] = c.url;
      break;
    }
    // Putarin without a usable stored/JAV cover: decrypt the embed's own player.image (3-4 fetches).
    // Its card already points at /api/puterin-thumb, so R2 alone is enough (no newPosters entry).
    if (!stored && isPutarin(it) && /^[A-Za-z0-9]{6,20}$/.test(it.id) && spend(5)) {
      const pt = await resolvePuterinImage(it.id).catch(() => null);
      if (pt) {
        await bucket.put(key, pt.buf, { httpMetadata: { contentType: pt.type } }).catch(() => undefined);
        stored = pt.url;
      } else reason = "putarin-tanpa-gambar";
    }
    if (stored) {
      stat.filled++;
      rows.push({ id: it.id, title, platform, status: "filled", titleStatus, newTitle: newTitle || undefined });
    } else {
      stat.missing++;
      rows.push({ id: it.id, title, platform, status: "missing", reason, titleStatus, newTitle: newTitle || undefined });
    }
  }
  return { ok: true, total, offset, nextOffset: i, done: i >= total, byPlatform, rows, newPosters, newMeta };
}
