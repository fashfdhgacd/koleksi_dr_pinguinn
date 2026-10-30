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
 *  - copies also meet on the whole title as letters and digits ("[Ailin] … Bab 1 (Kisah …)" =
 *    "Ailin … Bab 1 Kisah …"), with a boundary kept between separate numbers so "1 - 2" / "1 2" never
 *    equals "12"; a group whose copies still read as different episodes is left alone;
 *  - a group needs at least 2 different hosts. The same host twice joins when those copies have the
 *    same known duration, or come from different upload days that each put the video on 2+ hosts
 *    (the same multi-host upload sent again, Oct 29 + Oct 30 2026). Any other same-host copy is a
 *    duplicate: only the first joins and the rest keep their own page. Same-host copies whose known
 *    durations differ leave the whole group alone;
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
  return s ? { key: `${s.key}#${s.ep}.${s.sub}`, why: "series" } : { key: `x:${flatKey(lower)}`, why: "title" };
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
const episodeOf = (key: string): string => (/#\d+\.\d+$/.exec(key)?.[0] ?? "");

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

/** Upload day (UTC) of a copy, "" when unknown (unknown days count as one day). */
function dayOf(it: ServerItem): string {
  const t = timeOf(it);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "";
}

const hasPoster = (it: ServerItem): boolean => Boolean(String(it.poster || it.thumbnail || "").trim());

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
  blocked: Array<{ key: string; ids: string[]; why: "host-twice" | "duration-differs" | "episode-differs" }>;
  /** Same host, same upload day: copies left out of a group (they keep their own page). */
  extra: Array<{ key: string; id: string; host: ServerHost }>;
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
  const extra: MergeResult["extra"] = [];
  const oldest = (a: Row, b: Row) => timeOf(a.it) - timeOf(b.it) || rankOf(a.host) - rankOf(b.host) || a.at - b.at;
  const queue = [...byRoot.values()];
  for (let q = 0; q < queue.length; q++) {
    const all = queue[q];
    if (all.length < 2) continue;
    if (new Set(all.map((x) => x.host)).size < 2) continue;
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
      queue.push(...byKey.values());
      continue;
    }
    // Same host twice: different known durations block the group. Without matching durations, a
    // copy joins from each upload day that put the video on 2+ hosts (a whole re-upload); otherwise
    // only the first copy of that host joins (one with a poster first, then the oldest).
    const perHost = new Map<string, Row[]>();
    for (const x of all) {
      const l = perHost.get(x.host);
      if (l) l.push(x);
      else perHost.set(x.host, [x]);
    }
    // Hosts per upload day: a day counts as its own upload only when it put the video on 2+ hosts.
    const dayHosts = new Map<string, Set<string>>();
    for (const x of all) {
      const d = dayOf(x.it);
      const set = dayHosts.get(d);
      if (set) set.add(x.host);
      else dayHosts.set(d, new Set([x.host]));
    }
    let hostClash = false;
    const left = new Set<Row>();
    for (const list of perHost.values()) {
      if (list.length < 2) continue;
      const known = list.map((x) => durationOf(x.it)).filter((d) => d > 0);
      if (new Set(known).size > 1) {
        hostClash = true;
        break;
      }
      if (known.length === list.length) continue; // same known duration: a re-upload
      const days = list.map((x) => dayOf(x.it));
      const ownUploads = days.every((d) => (dayHosts.get(d)?.size || 0) >= 2);
      const byDay = new Map<string, Row[]>();
      list.forEach((x, i) => {
        const d = ownUploads ? days[i] : "";
        const l = byDay.get(d);
        if (l) l.push(x);
        else byDay.set(d, [x]);
      });
      for (const same of byDay.values()) {
        if (same.length < 2) continue;
        const keep = same.slice().sort((a, b) => Number(hasPoster(b.it)) - Number(hasPoster(a.it)) || oldest(a, b))[0];
        for (const x of same) if (x !== keep) left.add(x);
      }
    }
    if (hostClash) {
      blocked.push({ key, ids, why: "host-twice" });
      continue;
    }
    const arr = all.filter((x) => !left.has(x));
    if (new Set(arr.map((x) => x.host)).size < 2) continue;
    const ds = arr.map((x) => durationOf(x.it));
    if (!ds.every((a) => ds.every((b) => durOk(a, b)))) {
      blocked.push({ key, ids, why: "duration-differs" });
      continue;
    }
    for (const x of all) if (left.has(x)) extra.push({ key, id: x.it.id, host: x.host });
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
  return { groups, blocked, extra, skip };
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
