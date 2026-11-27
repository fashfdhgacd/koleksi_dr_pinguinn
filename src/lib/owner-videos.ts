/**
 * "Video ditonton" table for /pemilik → Statistik: pure helpers (no server imports), shared by the
 * owner API (src/routes/api/owner-videos.ts) and the panel. Tested in owner-videos.test.ts.
 *
 * One row per video id: `views` = video page opens (/watch/<id> pageviews, sample-weighted) in the
 * period, `uniq` = distinct visitors who opened it, `pops` = popunder tabs opened on that video
 * (player-log pop_n1..n6 daily counters, which carry the video id).
 */
import type { PeriodKey } from "./stats14.ts";

export const VIDEOS_PER_PAGE = 10;
export const VIDEO_SORTS = ["views", "pop", "upload"] as const;
export type VideoSort = (typeof VIDEO_SORTS)[number];

export type WatchedVideo = {
  id: string;
  /** Catalog title ("" when the video is no longer in the catalog). */
  title: string;
  thumb: string;
  /** Category slug. */
  cat: string;
  /** Server / source label (IndoAV, UserBokep, Videy, …). */
  server: string;
  /** Upload time (epoch ms, 0 = unknown). */
  up: number;
  views: number;
  uniq: number;
  pops: number;
};

export type PopTotals = { videy: number; other: number; prevVidey: number; prevOther: number };

export type WatchedList = {
  period: PeriodKey;
  rows: WatchedVideo[];
  totals: { views: number; prevViews: number; pops: PopTotals };
  updatedAt: string;
};

export type WatchedPage = {
  ok: true;
  period: PeriodKey;
  /** Videos watched in the period (before the search filter). */
  totalAll: number;
  /** Videos matching the search. */
  total: number;
  page: number;
  pages: number;
  rows: WatchedVideo[];
  totals: WatchedList["totals"];
  updatedAt: string;
};

/** Video id from a /watch/<id> path, or "" when the path is not a video page. */
export function watchId(path: string): string {
  const p = String(path || "").split(/[?#]/)[0] || "";
  if (!p.startsWith("/watch/")) return "";
  const raw = p.slice("/watch/".length).replace(/\/+$/, "");
  if (!raw || raw.includes("/")) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Merge per-path view rows and per-id popunder rows into one row per video id (catalog fields empty;
 * the API fills them). A video with popunders but no recorded pageview (sampling) still appears.
 */
export function mergeWatched(
  viewRows: { path: string; views: number; uniq: number }[],
  popRows: { id: string; n: number }[],
): WatchedVideo[] {
  const m = new Map<string, WatchedVideo>();
  const get = (id: string) => {
    let r = m.get(id);
    if (!r) m.set(id, (r = { id, title: "", thumb: "", cat: "", server: "", up: 0, views: 0, uniq: 0, pops: 0 }));
    return r;
  };
  for (const v of viewRows) {
    const id = watchId(v.path);
    if (!id) continue;
    const r = get(id);
    r.views += Math.max(0, Math.round(Number(v.views) || 0));
    r.uniq += Math.max(0, Math.round(Number(v.uniq) || 0));
  }
  for (const p of popRows) {
    const id = String(p.id || "");
    const n = Math.max(0, Math.round(Number(p.n) || 0));
    if (!id || !n) continue;
    get(id).pops += n;
  }
  return [...m.values()].sort((a, b) => b.views - a.views || b.pops - a.pops);
}

function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Search (title or id), sort, and cut one page of 10. Default: most watched first. */
export function pageWatched(
  list: WatchedList,
  opts: { q?: string; sort?: string; dir?: string; page?: number },
): WatchedPage {
  const q = norm(opts.q || "").slice(0, 80);
  const sort: VideoSort = (VIDEO_SORTS as readonly string[]).includes(String(opts.sort)) ? (opts.sort as VideoSort) : "views";
  const asc = opts.dir === "asc";
  let rows = list.rows;
  if (q) rows = rows.filter((r) => norm(r.title).includes(q) || norm(r.id).includes(q));
  const key = (r: WatchedVideo) => (sort === "pop" ? r.pops : sort === "upload" ? r.up : r.views);
  rows = [...rows].sort((a, b) => {
    const d = asc ? key(a) - key(b) : key(b) - key(a);
    return d || b.views - a.views || a.id.localeCompare(b.id);
  });
  const pages = Math.max(1, Math.ceil(rows.length / VIDEOS_PER_PAGE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(opts.page) || 1)));
  return {
    ok: true,
    period: list.period,
    totalAll: list.rows.length,
    total: rows.length,
    page,
    pages,
    rows: rows.slice((page - 1) * VIDEOS_PER_PAGE, page * VIDEOS_PER_PAGE),
    totals: list.totals,
    updatedAt: list.updatedAt,
  };
}

/** Page buttons: 1 … around current … last (numbers, or 0 for a gap). */
export function pageButtons(page: number, pages: number): number[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, 2, pages - 1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const nums = [...set].sort((a, b) => a - b);
  const out: number[] = [];
  for (const n of nums) {
    if (out.length && n - out[out.length - 1] > 1) out.push(0);
    out.push(n);
  }
  return out;
}
