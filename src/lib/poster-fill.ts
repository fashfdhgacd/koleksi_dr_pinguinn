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
 */
import { checkImage, isPlaceholderMd5 } from "@/lib/image-guard";
import { posterKey, resolvePostersBucket } from "@/lib/poster-r2";
import { fetchPosterBytes, resolvePuterinImage } from "@/lib/puterin-poster";
import { fetchByseMeta, fetchDrpPageMeta, fetchEmbedPageMeta, fetchStreamtapeMeta } from "@/lib/bot/providers.js";
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

export type FillRow = { id: string; title: string; platform: string; status: "filled" | "missing"; reason?: string };

export type FillBatch = {
  ok: true;
  total: number;
  offset: number;
  nextOffset: number;
  done: boolean;
  /** Per platform for this batch: checked, already had a poster, filled now, still missing. */
  byPlatform: Record<string, { checked: number; had: number; filled: number; missing: number }>;
  rows: FillRow[];
  /** Posters found for videos whose card had no poster link at all: save once via set-posters. */
  newPosters: Record<string, string>;
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
  };
}

function httpUrl(v: unknown): string {
  const s = String(v || "").trim();
  return /^https:\/\//i.test(s) ? s : "";
}

function embedOf(it: RawItem): string {
  return String(it.embed || it.direct || "");
}

/** Remote poster URLs to try for one item, cheapest first (no fetch for stored ones). */
async function candidates(it: RawItem, posters: Record<string, string>, spend: () => boolean): Promise<{ url: string; referer: string }[]> {
  const out: { url: string; referer: string }[] = [];
  const add = (url: string, referer = "") => {
    if (url && !/\/api\/(puterin-thumb|tape-thumb|embed-thumb|img-proxy)/i.test(url) && !out.some((c) => c.url === url)) {
      out.push({ url, referer });
    }
  };
  const embed = embedOf(it);
  add(httpUrl(thumbOf(it, posters)), embed);
  if (isPutarin(it)) add(javCoverFromTitle(String(it.title || "")), "");
  if (out.length) return out;
  // Nothing stored: ask the platform itself (one or more fetches, counted against the budget).
  if (isPutarin(it) || !spend()) return out;
  if (isIndoAv(it) || isUserBokep(it)) {
    const fallback = isUserBokep(it) ? `https://tv1.userbokep.com/e/${it.id}` : `https://tv1.indoav.app/e/${it.id}`;
    const meta = await fetchEmbedPageMeta(/^https:\/\//i.test(embed) ? embed : fallback, it.id).catch(() => null);
    add(httpUrl(meta?.thumb), embed || fallback);
  } else if (isStreamtape(it)) {
    const fileId = embed.match(/\/(?:e|v)\/([A-Za-z0-9]+)/)?.[1] || it.id;
    const meta = await fetchStreamtapeMeta(fileId, posterEnv()).catch(() => null);
    add(httpUrl(meta?.thumb), "https://streamtape.com/");
  } else {
    const kind = drpKindOfItem(it);
    const code = drpCodeFromUrl(embed);
    if (kind === "byse" && code) {
      let origin = "";
      try {
        origin = new URL(embed).origin;
      } catch {
        origin = "";
      }
      const meta = await fetchByseMeta(origin, code).catch(() => null);
      add(httpUrl(meta?.thumb), origin ? `${origin}/` : "");
    } else if ((kind === "lulu" || kind === "dood") && code) {
      const meta = await fetchDrpPageMeta(kind, embed, code).catch(() => null);
      add(httpUrl(meta?.thumb), embed);
    }
  }
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
  let i = offset;
  for (; i < Math.min(total, offset + limit); i++) {
    const it = list[i];
    const platform = sourceLabel(it);
    const stat = (byPlatform[platform] ||= { checked: 0, had: 0, filled: 0, missing: 0 });
    const title = String(it.title || it.id).slice(0, 90);
    if (isVidey(it)) {
      // Static frame from the videy-thumbs workflow; nothing a Worker can fetch.
      stat.checked++;
      if (videyMissingThumb(it)) {
        stat.missing++;
        rows.push({ id: it.id, title, platform, status: "missing", reason: "videy-frame-belum-ada" });
      } else stat.had++;
      continue;
    }
    // Leave room for the worst case of this item (head + lookup + 2 fetches + put, or Putarin decrypt).
    if (used + 6 > FILL_BUDGET) break;
    spend();
    const key = posterKey(it.id);
    const saved = await (bucket.head ? bucket.head(key) : bucket.get(key)).catch(() => null);
    stat.checked++;
    if (saved && !isPlaceholderMd5(saved.etag)) {
      stat.had++;
      continue;
    }
    let stored = "";
    let reason = "tidak-ada-sumber";
    const cands = await candidates(it, posters, () => spend());
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
      rows.push({ id: it.id, title, platform, status: "filled" });
    } else {
      stat.missing++;
      rows.push({ id: it.id, title, platform, status: "missing", reason });
    }
  }
  return { ok: true, total, offset, nextOffset: i, done: i >= total, byPlatform, rows, newPosters };
}
