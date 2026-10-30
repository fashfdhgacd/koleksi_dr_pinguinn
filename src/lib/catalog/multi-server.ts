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
 *  - never merged: Videy, generic / auto titles, numbered brand titles ("Koleksi Dr Pinguin 12");
 *  - short titles (under 16 chars or 3 words, 6 chars for CJK) merge only when every copy has the
 *    same known duration ("Mantanmu Idamanku", 801 s twice); "Anime Hentai (7)" twice with no
 *    duration stays apart (two different files, Oct 30 2026 check);
 *  - series titles keep the episode in the key, so Ep 2 only merges with Ep 2;
 *  - copies also meet on the whole title as letters and digits ("[Ailin] … Bab 1 (Kisah …)" =
 *    "Ailin … Bab 1 Kisah …"), with a boundary kept between separate numbers so "1 - 2" / "1 2" never
 *    equals "12"; a group whose copies still read as different episodes is left alone;
 *  - every copy with the same title joins, one host or many (owner rule Oct 30 2026: same title =
 *    one page, each copy a server button "Byse", "Byse 2", ...). The same host twice must not have
 *    different known durations: same-host copies are the same file (Lulu / Streamtape sizes and
 *    file names checked on the real catalog, Oct 30 2026), so their durations match exactly;
 *  - known durations across hosts may differ by at most max(20 s, 10 %);
 *  - a group that fails a duration check is split once by exact known duration ("Gangguin Adik …"
 *    455 s on IndoAV twice + 153 s on UserBokep: the two 455 s copies merge, 153 s stays apart);
 *    copies without a duration stay on their own page then.
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
  const s =
    `${String(it.embed || "")} ${String(it.source || "")} ${String(it.direct || "")}`.toLowerCase();
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
const NUMBERED_BRAND =
  /^(?:ai bokep dr\.? pinguin|videy|koleksi dr\.? pinguin|bokep indo pilihan)\b/i;
const CJK = /[\u3040-\u30ff\u3400-\u9fff]/;

function cleanTitle(t: unknown): string {
  let s = String(cleanUploadTitle(String(t || "")) || "")
    .normalize("NFKC")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s
      .replace(SITE, "")
      .replace(TAIL, "")
      .replace(/[\s\-–—|:·,.]+$/, "")
      .trim();
    if (s === before) break;
  }
  return s;
}

export type SkipReason = "videy" | "generic" | "numbered-brand";

/** Merge key of one copy, or the reason it never merges. */
export function mergeKeyOf(it: ServerItem): {
  key: string | null;
  why: SkipReason | "series" | "title" | "short";
} {
  if (serverHostOf(it) === "Videy") return { key: null, why: "videy" };
  if (isGenericTitle(it.title, it) || it.titleAuto) return { key: null, why: "generic" };
  const clean = cleanTitle(it.title);
  if (NUMBERED_BRAND.test(clean)) return { key: null, why: "numbered-brand" };
  const lower = clean.toLowerCase();
  const k = lower.replace(/[^\p{L}\p{N}]+/gu, "");
  const words = lower
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const cjk = CJK.test(k);
  // Short titles are too common to trust alone: their group also needs one known duration (mergeServers).
  if ((!cjk && (k.length < 16 || words.length < 3)) || (cjk && k.length < 6))
    return { key: `s:${flatKey(lower)}`, why: "short" };
  const s = parseSeries(String(it.title || ""));
  return s
    ? { key: `${s.key}#${s.ep}.${s.sub}`, why: "series" }
    : { key: `x:${flatKey(lower)}`, why: "title" };
}

/** Letters and digits of a cleaned lower-case title, with "_" between two separate numbers. */
function flatKey(lower: string): string {
  return lower.replace(/(\p{N})[^\p{L}\p{N}]+(?=\p{N})/gu, "$1_").replace(/[^\p{L}\p{N}_]+/gu, "");
}

/** Every key a copy can meet another copy on: its merge key and its whole flat title. */
function keysOf(it: ServerItem, key: string): string[] {
  return [key, `f:${flatKey(cleanTitle(it.title).toLowerCase())}`];
}

/** Episode of a series key ("…#3.0"), "" for a plain title. */
const episodeOf = (key: string): string => /#\d+\.\d+$/.exec(key)?.[0] ?? "";

function durationOf(it: ServerItem): number {
  const d = Number(it.duration);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

const durOk = (a: number, b: number): boolean =>
  !a || !b || Math.abs(a - b) <= Math.max(20, 0.1 * Math.max(a, b));
const isShort = (key: string): boolean => key.startsWith("s:");

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
  blocked: Array<{
    key: string;
    ids: string[];
    why: "host-twice" | "duration-differs" | "episode-differs" | "short-no-duration";
  }>;
  skip: Partial<Record<SkipReason, number>>;
};

export function mergeServers(items: readonly ServerItem[]): MergeResult {
  type Row = { it: ServerItem; host: ServerHost; at: number; key: string };
  const rows: Row[] = [];
  const skip: Partial<Record<SkipReason, number>> = {};
  const seen = new Set<string>();
  // Union-find over the copies: two copies are one video when they share any key (keysOf).
  const parent: number[] = [];
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const firstOf = new Map<string, number>();
  items.forEach((it, at) => {
    if (!it?.id || seen.has(it.id)) return;
    seen.add(it.id);
    const { key, why } = mergeKeyOf(it);
    if (!key) {
      const r = why as SkipReason;
      skip[r] = (skip[r] || 0) + 1;
      return;
    }
    const i = rows.length;
    rows.push({ it, host: serverHostOf(it), at, key });
    parent.push(i);
    for (const k of keysOf(it, key)) {
      const j = firstOf.get(k);
      if (j === undefined) firstOf.set(k, i);
      else {
        const a = find(i);
        const b = find(j);
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
      }
    }
  });
  const byRoot = new Map<number, Row[]>();
  rows.forEach((row, i) => {
    const r = find(i);
    const list = byRoot.get(r);
    if (list) list.push(row);
    else byRoot.set(r, [row]);
  });
  const groups: ServerGroup[] = [];
  const blocked: MergeResult["blocked"] = [];
  const oldest = (a: Row, b: Row) =>
    timeOf(a.it) - timeOf(b.it) || rankOf(a.host) - rankOf(b.host) || a.at - b.at;
  /** Copies of a blocked group regrouped by exact known duration (no duration: own page). */
  const byDuration = (all: Row[]): Row[][] => {
    const m = new Map<number, Row[]>();
    for (const x of all) {
      const d = durationOf(x.it);
      if (!d) continue;
      const l = m.get(d);
      if (l) l.push(x);
      else m.set(d, [x]);
    }
    return [...m.values()];
  };
  // `split`: already regrouped by duration once, a second failure leaves the copies alone.
  const queue: Array<{ all: Row[]; split: boolean }> = [...byRoot.values()].map((all) => ({
    all,
    split: false,
  }));
  for (let q = 0; q < queue.length; q++) {
    const { all, split } = queue[q];
    if (all.length < 2) continue;
    const key = all.slice().sort(oldest)[0].key;
    const ids = all.map((x) => x.it.id);
    // Copies joined through the flat title must still agree on the episode; when they do not, the
    // flat-title join is dropped and each merge key is tried on its own.
    const eps = new Set(all.map((x) => episodeOf(x.key)).filter(Boolean));
    if (eps.size > 1) {
      blocked.push({ key, ids, why: "episode-differs" });
      const byKey = new Map<string, Row[]>();
      for (const x of all) {
        const l = byKey.get(x.key);
        if (l) l.push(x);
        else byKey.set(x.key, [x]);
      }
      queue.push(...[...byKey.values()].map((list) => ({ all: list, split })));
      continue;
    }
    const ds = all.map((x) => durationOf(x.it));
    // A short title alone is not enough: every copy needs the same known duration.
    if (all.some((x) => isShort(x.key)) && !(ds.every((d) => d > 0) && new Set(ds).size === 1)) {
      blocked.push({ key, ids, why: "short-no-duration" });
      continue;
    }
    // Same host twice: those copies are one file, so their known durations must be equal.
    const perHost = new Map<string, Set<number>>();
    for (const x of all) {
      const d = durationOf(x.it);
      if (!d) continue;
      const set = perHost.get(x.host);
      if (set) set.add(d);
      else perHost.set(x.host, new Set([d]));
    }
    let why: "host-twice" | "duration-differs" | "" = "";
    if ([...perHost.values()].some((set) => set.size > 1)) why = "host-twice";
    else if (!ds.every((a) => ds.every((b) => durOk(a, b)))) why = "duration-differs";
    if (why) {
      blocked.push({ key, ids, why });
      if (!split) queue.push(...byDuration(all).map((list) => ({ all: list, split: true })));
      continue;
    }
    const indo = all.filter((x) => x.host === "IndoAV").sort(oldest);
    const main = (indo[0] || all.slice().sort(oldest)[0]).it.id;
    const ordered = all
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

export function multiServerFrom<T extends ServerItem>(
  items: readonly T[],
  groups: readonly ServerGroup[],
): MultiServer {
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
