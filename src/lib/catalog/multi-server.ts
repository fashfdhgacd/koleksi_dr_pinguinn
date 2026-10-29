/**
 * Multi-server: one watch page per video, with every host copy of it as a server button.
 *
 * The same video is often uploaded to several hosts (IndoAV + UserBokep, Streamtape + Byse, ...),
 * which gave one page per copy. This groups the copies of one video under one main page; the other
 * ids 301 to it (server/middleware/watch-placeholder.ts) and leave every list, the sitemap and search.
 * Nothing is deleted: every copy stays in the catalog data and plays as a server on the main page.
 *
 * Pure function of the published items (no I/O, no timers), run once per catalog build in
 * buildIndexes (local-cache.ts) and carried in the build snapshot (build-snapshot.ts).
 *
 * Merge rules (kept from the simulation run on the real catalog, Oct 30 2026):
 *  - title cleaned (cleanUploadTitle, NFKC, site suffix and quality/sub tail tags removed), then
 *    compared as lower-case letters and digits only;
 *  - never merged: Videy, generic / auto titles, numbered brand titles ("Koleksi Dr Pinguin 12"),
 *    keys shorter than 16 chars or 3 words (6 chars for CJK titles);
 *  - series titles keep the episode in the key, so Ep 2 only merges with Ep 2;
 *  - a group needs at least 2 different hosts; the same host twice only when those copies have the
 *    same known duration (a re-upload), otherwise the whole group is left alone;
 *  - known durations may differ by at most max(20 s, 10 %), otherwise the group is left alone.
 * Main page: the oldest IndoAV copy when there is one (IndoAV is never hurt), else the oldest copy.
 * Server order: IndoAV, LuluStream, DoodStream, Streampie, Streamtape, Putarin, UserBokep, Byse last.
 */
import { cleanUploadTitle } from "../bot/title-brand.js";
import { isGenericTitle } from "./generic-title.js";
import { drpKindOfItem } from "./drp-hosts.js";
import { parseSeries } from "./series.ts";

export type ServerItem = {
  id: string;
  title?: unknown;
  embed?: unknown;
  direct?: unknown;
  source?: unknown;
  duration?: unknown;
  createdAt?: unknown;
  date?: unknown;
  titleAuto?: unknown;
  [k: string]: unknown;
};

export type ServerHost =
  | "IndoAV"
  | "LuluStream"
  | "DoodStream"
  | "Streampie"
  | "Streamtape"
  | "Putarin"
  | "UserBokep"
  | "Byse"
  | "Videy"
  | "Lain";

export const HOST_RANK: Record<string, number> = {
  IndoAV: 0,
  LuluStream: 1,
  DoodStream: 2,
  Streampie: 3,
  Streamtape: 4,
  Putarin: 5,
  UserBokep: 6,
  Byse: 9,
};
const rankOf = (h: string): number => HOST_RANK[h] ?? 7;

/** Host of one catalog copy (same order of checks as the simulation). */
export function serverHostOf(it: ServerItem): ServerHost {
  const s = `${String(it.embed || "")} ${String(it.source || "")} ${String(it.direct || "")}`.toLowerCase();
  if (/indoav/.test(s)) return "IndoAV";
  if (/userbokep/.test(s)) return "UserBokep";
  if (/putarin|puterin/.test(s)) return "Putarin";
  if (/streamtape|strcloud/.test(s)) return "Streamtape";
  if (/videy/.test(s)) return "Videy";
  if (/streampie/.test(s)) return "Streampie";
  const drp = drpKindOfItem(it);
  if (drp === "lulu") return "LuluStream";
  if (drp === "dood") return "DoodStream";
  if (drp === "byse") return "Byse";
  return "Lain";
}

const SITE =
  /\s*[-–—|:·]?\s*[([]?\s*(?:https?:\/\/)?(?:www\.)?(?:koleksi\s*)?dr\.?\s*pinguin(?:\.(?:com|site))?\s*[)\]]?\s*$/i;
const TAIL =
  /\s*[-–—|:·,]?\s*(?<![\p{L}\p{N}])(?:full\s*hd|fhd|uhd|hd|4k|\d{3,4}p|sub(?:title)?\s*indo(?:nesia)?|indo\s*sub|uncen(?:sored)?)[.!]*\s*$/iu;
const NUMBERED_BRAND = /^(?:ai bokep dr\.? pinguin|videy|koleksi dr\.? pinguin|bokep indo pilihan)\b/i;
const CJK = /[\u3040-\u30ff\u3400-\u9fff]/;

function cleanTitle(t: unknown): string {
  let s = String(cleanUploadTitle(String(t || "")) || "")
    .normalize("NFKC")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s.replace(SITE, "").replace(TAIL, "").replace(/[\s\-–—|:·,.]+$/, "").trim();
    if (s === before) break;
  }
  return s;
}

export type SkipReason = "videy" | "generic" | "numbered-brand" | "too-short";

/** Merge key of one copy, or the reason it never merges. */
export function mergeKeyOf(it: ServerItem): { key: string | null; why: SkipReason | "series" | "title" } {
  if (serverHostOf(it) === "Videy") return { key: null, why: "videy" };
  if (isGenericTitle(it.title, it) || it.titleAuto) return { key: null, why: "generic" };
  const clean = cleanTitle(it.title);
  if (NUMBERED_BRAND.test(clean)) return { key: null, why: "numbered-brand" };
  const lower = clean.toLowerCase();
  const k = lower.replace(/[^\p{L}\p{N}]+/gu, "");
  const words = lower.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
  const cjk = CJK.test(k);
  if ((!cjk && (k.length < 16 || words.length < 3)) || (cjk && k.length < 6)) return { key: null, why: "too-short" };
  const s = parseSeries(String(it.title || ""));
  return s ? { key: `${s.key}#${s.ep}.${s.sub}`, why: "series" } : { key: `x:${k}`, why: "title" };
}

function durationOf(it: ServerItem): number {
  const d = Number(it.duration);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

const durOk = (a: number, b: number): boolean => !a || !b || Math.abs(a - b) <= Math.max(20, 0.1 * Math.max(a, b));

/** Upload time in ms (Infinity when unknown, so dated copies count as older). */
function timeOf(it: ServerItem): number {
  const v = it.createdAt ?? it.date;
  const n = typeof v === "number" ? v : Date.parse(String(v ?? ""));
  if (!Number.isFinite(n)) return Infinity;
  return n < 1e12 ? n * 1000 : n;
}

export type ServerGroup = {
  key: string;
  /** Main page id (canonical, sitemap, listings). */
  main: string;
  /** Every copy in server order (main included). */
  ids: string[];
  hosts: ServerHost[];
};

export type MergeResult = {
  groups: ServerGroup[];
  blocked: Array<{ key: string; ids: string[]; why: "host-twice" | "duration-differs" }>;
  skip: Partial<Record<SkipReason, number>>;
};

export function mergeServers(items: readonly ServerItem[]): MergeResult {
  const byKey = new Map<string, { it: ServerItem; host: ServerHost; at: number }[]>();
  const skip: Partial<Record<SkipReason, number>> = {};
  const seen = new Set<string>();
  items.forEach((it, at) => {
    if (!it?.id || seen.has(it.id)) return;
    seen.add(it.id);
    const { key, why } = mergeKeyOf(it);
    if (!key) {
      const r = why as SkipReason;
      skip[r] = (skip[r] || 0) + 1;
      return;
    }
    const row = { it, host: serverHostOf(it), at };
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  });
  const groups: ServerGroup[] = [];
  const blocked: MergeResult["blocked"] = [];
  for (const [key, arr] of byKey) {
    if (arr.length < 2) continue;
    const hosts = new Set(arr.map((x) => x.host));
    if (hosts.size < 2) continue;
    const ids = arr.map((x) => x.it.id);
    const perHost = new Map<string, number[]>();
    for (const x of arr) {
      const l = perHost.get(x.host);
      if (l) l.push(durationOf(x.it));
      else perHost.set(x.host, [durationOf(x.it)]);
    }
    const dupOk = [...perHost.values()].every((ds) => ds.length < 2 || ds.every((d) => d > 0 && d === ds[0]));
    if (!dupOk) {
      blocked.push({ key, ids, why: "host-twice" });
      continue;
    }
    const ds = arr.map((x) => durationOf(x.it));
    if (!ds.every((a) => ds.every((b) => durOk(a, b)))) {
      blocked.push({ key, ids, why: "duration-differs" });
      continue;
    }
    const oldest = (a: (typeof arr)[number], b: (typeof arr)[number]) =>
      timeOf(a.it) - timeOf(b.it) || rankOf(a.host) - rankOf(b.host) || a.at - b.at;
    const indo = arr.filter((x) => x.host === "IndoAV").sort(oldest);
    const main = (indo[0] || arr.slice().sort(oldest)[0]).it.id;
    const ordered = arr
      .slice()
      .sort(
        (a, b) =>
          rankOf(a.host) - rankOf(b.host) ||
          Number(b.it.id === main) - Number(a.it.id === main) ||
          oldest(a, b),
      );
    groups.push({ key, main, ids: ordered.map((x) => x.it.id), hosts: ordered.map((x) => x.host) });
  }
  return { groups, blocked, skip };
}

/** Lookup form kept on the built catalog (local-cache.ts). */
export type MultiServer = {
  /** merged-away id -> main id */
  mainOf: Map<string, string>;
  /** main id -> server ids in order (main included) */
  servers: Map<string, string[]>;
  /** merged-away items (left out of byId and every list, still playable as a server) */
  away: Map<string, ServerItem>;
};

export function emptyMultiServer(): MultiServer {
  return { mainOf: new Map(), servers: new Map(), away: new Map() };
}

export function multiServerFrom<T extends ServerItem>(items: readonly T[], groups: readonly ServerGroup[]): MultiServer {
  const byId = new Map<string, T>();
  for (const it of items) if (it?.id && !byId.has(it.id)) byId.set(it.id, it);
  const out = emptyMultiServer();
  for (const g of groups) {
    out.servers.set(g.main, g.ids.slice());
    for (const id of g.ids) {
      if (id === g.main) continue;
      out.mainOf.set(id, g.main);
      const it = byId.get(id);
      if (it) out.away.set(id, it);
    }
  }
  return out;
}

/**
 * Poster for each main page that has none of its own, taken from the first other copy in server
 * order that has a real remote image (e.g. a Byse main with no poster borrows the Lulu one).
 * `thumb` is the card's poster lookup (local-shared thumbOf). Titles need no such step: a copy with
 * a generic / auto title never joins a group (mergeKeyOf), so every copy already has the real title.
 */
export function borrowedPosters<T extends ServerItem>(
  items: readonly T[],
  groups: readonly ServerGroup[],
  thumb: (it: T) => string,
): Map<string, string> {
  const byId = new Map<string, T>();
  for (const it of items) if (it?.id && !byId.has(it.id)) byId.set(it.id, it);
  const out = new Map<string, string>();
  for (const g of groups) {
    const main = byId.get(g.main);
    if (!main || thumb(main)) continue;
    for (const id of g.ids) {
      if (id === g.main) continue;
      const it = byId.get(id);
      const url = it ? String(thumb(it) || "").trim() : "";
      if (/^https:\/\//i.test(url) && !/koleksidrpinguin\.com\/api\//i.test(url)) {
        out.set(g.main, url);
        break;
      }
    }
  }
  return out;
}
