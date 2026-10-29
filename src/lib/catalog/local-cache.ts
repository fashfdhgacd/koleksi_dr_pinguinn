import { DEFAULT_PAGE_SIZE } from "./types";
import { popularIds, tagOptions, titleTags } from "./title-tags";
import { findCategory } from "./categories";
import type { PagedVideos } from "./types";
import {
  type RawItem,
  type CatalogCache,
  CACHE_MS,
  STALE_MS,
  BOT_FEEDS,
  asList,
  asPosterMap,
  fetchJson,
  withIds,
  isIndoAv,
  isUserBokep,
  isPutarin,
  isUsable,
  isVidey,
  isDrpBokep,
  mainCatalog,
  slugOf,
  thumbOf,
  toCard,
  videyNoThumbHideAt,
} from "./local-shared";
import localCatalog from "./videos.json";
import streamtapeBatch from "./streamtape.json";
import streamtapeBatchSep25 from "./streamtape-batch-20260925.json";
import putarinBatch from "./putarin.json";
import folderBatch20261007 from "./folder-batch-20261007.json";
import videoStats from "./video-stats.json";
import itemOverrides from "./overrides.json";
import { softenMinorTerms } from "./minor-title-guard";
import { HIDDEN_IDS as HIDDEN_ID_REASONS, RESTORED_TITLES, minorContentReason } from "./hidden-ids.js";
import { isLockedMinorId, lockedMinorReason, schoolReason } from "./minor-lock.js";
import { ownerChecked18 } from "./minor-context.js";
import postersMap from "./posters.json";
import javPosters from "./jav-posters.json";
// Telegram bot uploads (IndoAV/Streamtape/Putarin) land in these feeds; bundle so every batch stays live.
// Chunked bot feeds (contract: src/lib/catalog/chunk-contract.js). Every chunk is bundled and
// ordered by its -index.json; scripts/check-catalog.mjs fails the build if one goes missing.
const latestVideos: unknown[] = mergeChunks(
  import.meta.glob<unknown>("../../../data/videos-latest*.json", { eager: true, import: "default" }),
  latestVideosIndex,
  "videos-latest",
);
const latestPutarin: unknown[] = mergeChunks(
  import.meta.glob<unknown>("../../../data/putarin-latest*.json", { eager: true, import: "default" }),
  latestPutarinIndex,
  "putarin-latest",
);
import { mergeChunks } from "@/lib/catalog/chunk-contract.js";
import latestVideosIndex from "../../../data/videos-latest-index.json";
import latestPutarinIndex from "../../../data/putarin-latest-index.json";
import latestPosters from "../../../data/latest-posters.json";
// Owner's Byse / DoodStream / LuluStream library (/kategori/bokep), one-off import 2026-10-19.
import drpBokepBatch from "../../../data/drp-bokep.json";
// Real titles/posters found for videos whose stored title is generic ("Koleksi Dr. Pinguin Bokep N",
// titleAuto). Written by the /pemilik sweep (set-auto-meta) and the one-off Byse restore 2026-10-29.
import autoMetaFile from "../../../data/auto-meta.json";
import { isGenericTitle } from "./generic-title.js";
// Frozen copy of the old repo's live feed (koleksi_dr_pinguin data/putarin.json, last change Oct 7 2026),
// bundled so no request ever fetches it from raw.githubusercontent.com again (see BOT_FEEDS).
import putarinFeedSnapshot from "./putarin-feed-20261007.json";
import { restoreBuild, serializeBuild } from "./build-snapshot";
import { keepAlive, readSnapshot, snapshotKey, writeSnapshot } from "./build-snapshot-store";
import { borrowedPosters, emptyMultiServer, mergeServers, multiServerFrom, type MultiServer } from "./multi-server";

// Re-bind mutable cache/inflight via shared module namespace
import { runtime } from "./local-shared";

function sourcePriority(item: RawItem): number {
  // Kategori/pencarian: IndoAV di atas Userbokep, lalu sumber lain
  if (isIndoAv(item)) return 100;
  if (isUserBokep(item)) return 50;
  return 0;
}

/**
 * Upload time in ms. Bot records carry ISO strings (`date: "2026-10-24"`, `updated_at`), which
 * Number() turned into NaN, so new Puterin uploads never sorted to the top of their category.
 */
function timeKey(it: RawItem): number {
  const extra = it as RawItem & { updated_at?: unknown; created_at?: unknown };
  for (const v of [it.createdAt, extra.created_at, extra.updated_at, it.date]) {
    if (v == null || v === "") continue;
    const n = typeof v === "number" ? v : /^\d+$/.test(String(v)) ? Number(v) : Date.parse(String(v));
    if (Number.isFinite(n) && n > 0) return n < 1e12 ? n * 1000 : n;
  }
  return 0;
}

/** sourceFirst=false: pure newest-first (category pages), so a fresh upload from any source leads. */
export function sortByNewest(items: RawItem[], sourceFirst = true): RawItem[] {
  const keyed = items.map((it) => ({ it, p: sourceFirst ? sourcePriority(it) : 0, t: timeKey(it) }));
  keyed.sort((a, b) => b.p - a.p || b.t - a.t);
  return keyed.map((k) => k.it);
}

function hasPosterLink(it: RawItem): boolean {
  return /^https:\/\//i.test(String(it.poster || "")) || /^https:\/\//i.test(String(it.thumbnail || ""));
}

/**
 * Like uniqById (first copy of an id wins), but when the winning copy only has a generic title
 * (bot fallback "Koleksi Dr. Pinguin Bokep N" / titleAuto) or no poster, a later copy of the same id
 * fills them in. Example: Byse videos re-sent to the bot on 2026-10-29 shadowed the drp-bokep import
 * that already had the real title and poster. A real title is never replaced; a hidden flag on any
 * copy is kept (never publishes more). Videy is left as it is. One pass over a Map, no I/O.
 */
export function mergeById(items: RawItem[]): RawItem[] {
  const at = new Map<string, number>();
  const out: RawItem[] = [];
  for (const it of items) {
    if (!it?.id) continue;
    const idx = at.get(it.id);
    if (idx === undefined) {
      at.set(it.id, out.length);
      out.push(it);
      continue;
    }
    const kept = out[idx];
    if (isVidey(kept)) continue;
    let next = kept;
    if (isGenericTitle(kept.title, kept) && !isGenericTitle(it.title, it)) {
      const { titleAuto: _auto, ...rest } = next as RawItem & { titleAuto?: unknown };
      next = { ...rest, title: it.title } as RawItem;
    }
    if (!hasPosterLink(next) && hasPosterLink(it)) {
      next = { ...next, ...(it.poster ? { poster: it.poster } : {}), ...(it.thumbnail ? { thumbnail: it.thumbnail } : {}) };
    }
    const dup = it as { hidden?: unknown; hidden_reason?: unknown };
    if (dup.hidden === true && (next as { hidden?: unknown }).hidden !== true) {
      next = { ...next, hidden: true, hidden_reason: dup.hidden_reason || "bot-flag" } as RawItem;
    }
    if (next !== kept) out[idx] = next;
  }
  return out;
}

export function uniqById(items: RawItem[]): RawItem[] {
  const seen = new Set<string>();
  const out: RawItem[] = [];
  for (const it of items) {
    if (!it?.id || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

export function buildVideyNo(items: RawItem[]): Map<string, number> {
  const m = new Map<string, number>();
  let n = 0;
  for (const it of items) {
    if (isVidey(it) && !m.has(it.id)) m.set(it.id, ++n);
  }
  return m;
}

const STATS = videoStats as unknown as Record<string, [number, number, number]>;

/** hidden: reason string (e.g. "source-gone") hides the item without deleting it; Unhide can restore it. */
type ItemOverride = { title?: string; category?: string; poster?: string; hidden?: string };
const OVERRIDES = itemOverrides as Record<string, ItemOverride>;
/**
 * data/auto-meta.json: id -> { title?, poster?, src?, hidden?, none? }. Applied only on top of a
 * generic stored title / missing poster (never over a real one). `hidden` = the found title carries a
 * minor/school theme: kept unpublished. `none` = the platform gave nothing (sweep skips it next time).
 */
type AutoMeta = { title?: string; poster?: string; src?: string; hidden?: string; none?: string };
const AUTO_META = autoMetaFile as Record<string, AutoMeta>;
/** Owner edits from /pemilik (KV owner:edit:v1, owner-edit-store.ts), applied on top of OVERRIDES. */
type OwnerEditLite = { title?: string; category?: string; extra?: string[] };
let EDITS: Record<string, OwnerEditLite> = {};
let editsKey = "";

function overrideTitle(id: string): string {
  return String(EDITS[id]?.title || OVERRIDES[id]?.title || "");
}

/** Real source titles for stored "***" titles that only masked "tocil" (see hidden-ids.js). */
const RESTORED = RESTORED_TITLES as Record<string, string>;

/**
 * Hidden (not deleted) items: reviewed list (hidden-ids.js), records the bot flagged
 * with `hidden: true`, and any title the shared minor-content detector matches (checked on
 * the raw title, before display renaming). They are dropped from every index, so they never
 * show up in listings, categories, search, related videos, sitemap or /watch.
 *
 * Hidden is the default. The only way back is the owner's explicit "Unhide" in /pemilik, which
 * writes the id to a server-side override list (KV "owner:unhide:v1", see unhide-store.ts).
 * That list is re-read every UNHIDE_TTL_MS and the indexes are rebuilt when it changes.
 */
const HIDDEN_REASONS = HIDDEN_ID_REASONS as Record<string, string>;

/**
 * Title -> detector result, per isolate. Both detectors are pure functions of the title, and each
 * title is checked several times per index build (locked check + hidden reason), so this halves the
 * cold-start build and makes later rebuilds (owner Unhide/Edit) almost free.
 */
const minorMemo = new Map<string, string>();
const lockedMemo = new Map<string, string>();
const MEMO_MAX = 50_000;
function minorReasonMemo(title: string): string {
  let r = minorMemo.get(title);
  if (r === undefined) {
    r = schoolReason(title); // hidden-ids rules + owner 18yo uniform exception (minor-lock.js)
    if (minorMemo.size > MEMO_MAX) minorMemo.clear();
    minorMemo.set(title, r);
  }
  return r;
}
function lockedReasonMemo(title: string): string {
  let r = lockedMemo.get(title);
  if (r === undefined) {
    r = lockedMinorReason(title);
    if (lockedMemo.size > MEMO_MAX) lockedMemo.clear();
    lockedMemo.set(title, r);
  }
  return r;
}
const HIDDEN_IDS = new Set<string>(Object.keys(HIDDEN_REASONS));

/** Cache plus the raw (pre-filter, pre-override) item list, so hidden items can be restored. */
type BuiltCache = CatalogCache & {
  raw?: RawItem[];
  hiddenIds?: Set<string>;
  unhideKey?: string;
  /** Videy items without a frame, past VIDEY_NO_THUMB_HIDE_HOURS: off lists, /watch still opens (noindex). */
  videyNoThumbIds?: Set<string>;
  /** Next time a frameless Videy item crosses the limit (0 = none pending); loadItemsRaw rebuilds then. */
  videyNoThumbNextAt?: number;
  /** Multi-server groups (multi-server.ts): merged-away copies are out of byId and every list. */
  multi?: MultiServer;
};

let lastHiddenIds = new Set<string>();
let UNHIDDEN = new Set<string>();
/** Owner "Sembunyikan" from the Player error card (KV owner:hide:v1, owner-hide-store.ts). Wins over Unhide. */
let OWNER_HIDDEN = new Set<string>();
let unhideKey = "";
let unhideCheckedAt = 0;
let unhideInflight: Promise<void> | null = null;
const UNHIDE_TTL_MS = 30_000;

/** Owner-edited title that passes both detectors: it replaces the stored title for title-based rules. */
function hasCleanEdit(id: string): boolean {
  const t = EDITS[id]?.title;
  return Boolean(t) && !minorReasonMemo(String(t)) && !lockedReasonMemo(String(t));
}

/**
 * Owner rule 2026-10-26: an item held ONLY by the review layer (bot flag "detector-review") whose
 * title carries an adult age marker (18yo/18+, ownerChecked18) is published. Locks, HIDDEN_IDS and
 * every other hidden reason still apply (checked after this by the normal path).
 */
function adultReviewOnly(it: RawItem): boolean {
  const rec = it as { hidden?: unknown; hidden_reason?: unknown };
  if (rec.hidden !== true || rec.hidden_reason !== "detector-review") return false;
  const title = String(overrideTitle(it.id) || RESTORED[it.id] || it.title || "");
  return ownerChecked18(title) && !lockedReasonMemo(title) && !minorReasonMemo(title);
}

/** Why an item is hidden by default ("" = not hidden). Ignores owner Unhide overrides. */
export function hiddenReasonRaw(it: RawItem): string {
  if (AUTO_META[it.id]?.hidden) return String(AUTO_META[it.id].hidden);
  if (hasCleanEdit(it.id)) {
    const rec = it as { hidden?: unknown; hidden_reason?: unknown };
    if (rec.hidden === true && !adultReviewOnly(it)) return String(rec.hidden_reason || "bot-flag");
    return String(OVERRIDES[it.id]?.hidden || "");
  }
  const listed = HIDDEN_REASONS[it.id];
  if (listed) return listed;
  const auto = AUTO_META[it.id];
  if (auto?.hidden) return String(auto.hidden);
  if (auto?.title && !isVidey(it)) {
    const t = String(auto.title);
    const r = minorReasonMemo(t) || lockedReasonMemo(t);
    if (r) return r;
  }
  const rec = it as { hidden?: unknown; hidden_reason?: unknown };
  if (rec.hidden === true && !adultReviewOnly(it)) return String(rec.hidden_reason || "bot-flag");
  const ovHidden = OVERRIDES[it.id]?.hidden;
  if (ovHidden) return String(ovHidden);
  // Reviewed real title (owner edit, overrides.json, or "***" restored to "Tocil ..." via
  // RESTORED_TITLES) is checked instead of a masked stored title. An owner edit that is itself
  // flagged is checked as well as the stored title (a clean edit is handled above).
  const title = String(overrideTitle(it.id) || RESTORED[it.id] || it.title || "");
  const edited = EDITS[it.id]?.title ? String(OVERRIDES[it.id]?.title || RESTORED[it.id] || it.title || "") : "";
  return (
    minorReasonMemo(title) ||
    lockedReasonMemo(title) ||
    (edited ? minorReasonMemo(edited) || lockedReasonMemo(edited) : "")
  );
}

/** Clear school/minor theme (minor-lock.js): hidden even when the owner pressed Unhide. */
export function isLockedMinor(it: RawItem): boolean {
  if (isLockedMinorId(it.id)) return true;
  if (hasCleanEdit(it.id)) return false;
  if (EDITS[it.id]?.title && lockedReasonMemo(String(EDITS[it.id]?.title)) !== "") return true;
  if (AUTO_META[it.id]?.title && lockedReasonMemo(String(AUTO_META[it.id].title)) !== "") return true;
  return lockedReasonMemo(String(OVERRIDES[it.id]?.title || RESTORED[it.id] || it.title || "")) !== "";
}

function isHiddenRaw(it: RawItem): boolean {
  if (OWNER_HIDDEN.has(it.id)) return true;
  if (isLockedMinor(it)) return true;
  if (UNHIDDEN.has(it.id)) return false;
  return hiddenReasonRaw(it) !== "";
}

function keyOf(ids: Iterable<string>): string {
  return [...ids].sort().join(",");
}

/** Unhide list + owner hide list (null = could not read it; keep the previous one). */
type HideLists = {
  unhidden: string[];
  ownerHidden: string[] | null;
  /** Owner edits (null = could not read them; keep the previous ones). */
  edits: Record<string, OwnerEditLite> | null;
};

async function fetchUnhiddenIds(): Promise<HideLists | null> {
  try {
    if (import.meta.env.SSR) {
      const mod = await import("./unhide-store");
      const state = await mod.readUnhideState();
      let ownerHidden: string[] | null = null;
      try {
        const hideMod = await import("./owner-hide-store");
        ownerHidden = Object.keys((await hideMod.readOwnerHideState()).ids);
      } catch {
        ownerHidden = null;
      }
      let edits: HideLists["edits"] = null;
      try {
        const editMod = await import("./owner-edit-store");
        edits = (await editMod.readOwnerEditState()).ids;
      } catch {
        edits = null;
      }
      return { unhidden: Object.keys(state.ids), ownerHidden, edits };
    }
    const res = await fetch("/api/hidden-ids");
    if (!res.ok) return null;
    const data = (await res.json()) as { unhidden?: unknown; ownerHidden?: unknown; edits?: unknown };
    if (!Array.isArray(data?.unhidden)) return null;
    return {
      unhidden: data.unhidden.map(String),
      ownerHidden: Array.isArray(data.ownerHidden) ? data.ownerHidden.map(String) : null,
      edits:
        data.edits && typeof data.edits === "object" && !Array.isArray(data.edits)
          ? (data.edits as Record<string, OwnerEditLite>)
          : null,
    };
  } catch {
    return null;
  }
}

/**
 * Applies a new Unhide list (and, when given, a new owner hide list); rebuilds the current indexes
 * when either changed. Callers that only know the Unhide list leave the owner hide list as it is.
 */
export function applyUnhidden(
  ids: Iterable<string>,
  ownerHidden?: Iterable<string> | null,
  edits?: Record<string, OwnerEditLite> | null,
): void {
  const next = new Set<string>(ids);
  const nextHidden = ownerHidden ? new Set<string>(ownerHidden) : OWNER_HIDDEN;
  const nextEdits = edits || EDITS;
  const nextEditsKey = edits ? JSON.stringify(edits) : editsKey;
  const key =
    keyOf(next) + (nextHidden.size ? `|hide:${keyOf(nextHidden)}` : "") + (nextEditsKey ? `|edit:${nextEditsKey}` : "");
  unhideCheckedAt = Date.now();
  if (key === unhideKey) return;
  UNHIDDEN = next;
  OWNER_HIDDEN = nextHidden;
  EDITS = nextEdits;
  editsKey = nextEditsKey;
  unhideKey = key;
  const cur = runtime.cache as BuiltCache | null;
  // unhideKey first: a snapshot-restored cache assembles `raw` lazily, only when a rebuild needs it.
  if (cur && cur.unhideKey !== key && cur.raw) {
    runtime.cache = buildIndexes(cur.raw, cur.posters, cur.videyNo, cur.at);
    rememberBuild(runtime.cache as BuiltCache);
  }
}

async function syncUnhidden(force = false): Promise<void> {
  if (!force && Date.now() - unhideCheckedAt < UNHIDE_TTL_MS) return;
  if (unhideInflight) return unhideInflight;
  unhideInflight = (async () => {
    const lists = await fetchUnhiddenIds();
    if (lists) applyUnhidden(lists.unhidden, lists.ownerHidden, lists.edits);
    else unhideCheckedAt = Date.now(); // keep the previous list; retry after the TTL
  })().finally(() => {
    unhideInflight = null;
  });
  return unhideInflight;
}

/**
 * Load-time only (stored/bot data is never rewritten):
 *  - folder stats (views, duration sec, likes)
 *  - manual overrides (src/lib/catalog/overrides.json: title / category / poster per id)
 *  - light title guard that strips minor-implying wording from display titles
 */
function withStats(it: RawItem): RawItem {
  let out = it;
  const st = STATS[it.id];
  if (st) {
    const [views, dur, likes] = st;
    out = {
      ...out,
      views: typeof it.views === "number" ? it.views : views,
      likes: typeof it.likes === "number" ? it.likes : likes,
      duration: typeof it.duration === "number" && it.duration > 0 ? it.duration : dur || undefined,
    };
  }
  const restored = RESTORED[it.id];
  if (restored) out = { ...out, title: restored };
  const auto = AUTO_META[it.id];
  if (auto && !isVidey(it)) {
    if (auto.title && isGenericTitle(out.title, out)) {
      const { titleAuto: _auto, ...rest } = out as RawItem & { titleAuto?: unknown };
      out = { ...rest, title: auto.title } as RawItem;
    }
    if (auto.poster && !out.poster && !out.thumbnail) out = { ...out, poster: auto.poster };
  }
  const ov = OVERRIDES[it.id];
  if (ov) {
    out = {
      ...out,
      ...(ov.title ? { title: ov.title } : {}),
      ...(ov.category ? { category: ov.category } : {}),
      ...(ov.poster && !out.poster ? { poster: ov.poster } : {}),
    };
  }
  const ed = EDITS[it.id];
  if (ed) {
    out = {
      ...out,
      ...(ed.title ? { title: ed.title } : {}),
      ...(ed.category ? { category: ed.category, ownerCategory: ed.category } : {}),
      ...(ed.extra?.length ? { ownerExtraCategories: ed.extra } : {}),
    };
  }
  const title = typeof out.title === "string" ? out.title : "";
  const safe = title ? softenMinorTerms(title, findCategory(String(out.category || ""))?.label) : title;
  if (safe !== title) out = { ...out, title: safe };
  return out;
}

/**
 * Terbaru (homepage list, /api/data?type=latest) ordering, deterministic for pagination/SEO
 * (owner rule 2026-10-19):
 *  - page 1 (positions 1..36): IndoAV only
 *  - from page 2: every 4th card is UserBokep (newest first), the rest IndoAV = 27 IndoAV + 9
 *    UserBokep per 36; when one of the two runs out, the other continues.
 *  - ONLY IndoAV and its sister site UserBokep. Videy, Koleksi Dr. Pinguin Bokep (Byse / DoodStream /
 *    LuluStream), Puterin, Streamtape and every other source live only in their own categories.
 * Built once per catalog build (buildIndexes). Category pages keep their own ordering (listOrder).
 */
const TERBARU_FIRST_PAGE = DEFAULT_PAGE_SIZE;
const TERBARU_UB_EVERY = 4;
export function terbaruOrder(sorted: RawItem[]): RawItem[] {
  const indo: RawItem[] = [];
  const ub: RawItem[] = [];
  for (const it of sorted) {
    if (isVidey(it) || isDrpBokep(it) || isPutarin(it)) continue;
    if (isIndoAv(it)) indo.push(it);
    else if (isUserBokep(it)) ub.push(it);
  }
  const out: RawItem[] = indo.slice(0, TERBARU_FIRST_PAGE);
  let i = TERBARU_FIRST_PAGE;
  let u = 0;
  let slot = 0;
  while (u < ub.length && i < indo.length) {
    if (slot % TERBARU_UB_EVERY === TERBARU_UB_EVERY - 1) out.push(ub[u++]);
    else out.push(indo[i++]);
    slot++;
  }
  while (u < ub.length) out.push(ub[u++]);
  while (i < indo.length) out.push(indo[i++]);
  return out;
}

/**
 * Interleave two newest-first lists in a fixed pattern: `a` cards of `main`, then `b` of `side`,
 * repeating; when one runs out the other continues (`sideStops`: the side list only fills between
 * main cards and stops when main runs out). Each item appears once.
 */
function interleave(main: RawItem[], side: RawItem[], a: number, b: number, sideStops = false): RawItem[] {
  const out: RawItem[] = [];
  const seen = new Set<string>();
  const push = (it: RawItem) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    out.push(it);
    return true;
  };
  let m = 0;
  let s = 0;
  while (m < main.length) {
    for (let k = 0; k < a && m < main.length; ) if (push(main[m++])) k++;
    if (m >= main.length && sideStops) break;
    for (let k = 0; k < b && s < side.length; ) if (push(side[s++])) k++;
  }
  if (!sideStops) while (s < side.length) push(side[s++]);
  return out;
}

/**
 * Category page order (listCategory), built once per catalog build. bySlug keeps the plain
 * category membership (counts, related videos); only these slugs get a mixed page order:
 *  - bokep: owner's Byse / DoodStream / LuluStream videos (thumbnail first, logo-only after) with one
 *    IndoAV video (newest first, each once) after every 2 host videos: H, H, I.
 *  - jav: 2 IndoAV/UserBokep jav videos : 1 Puterin, newest first within each, then the rest.
 */
function categoryOrders(bySlug: Map<string, RawItem[]>, mainSorted: RawItem[]): Map<string, RawItem[]> {
  const out = new Map<string, RawItem[]>();
  const bokep = bySlug.get("bokep") || [];
  if (bokep.length) {
    const indo = mainSorted.filter((it) => isIndoAv(it) && !isVidey(it) && !isDrpBokep(it));
    out.set("bokep", interleave(bokep, indo, 2, 1, true));
  }
  const jav = bySlug.get("jav") || [];
  if (jav.length) {
    const put: RawItem[] = [];
    const other: RawItem[] = [];
    for (const it of jav) (isPutarin(it) ? put : other).push(it);
    out.set("jav", interleave(other, put, 2, 1));
  }
  return out;
}

function hasDataPoster(it: RawItem, posters: Record<string, string>): boolean {
  const p = String(it.poster || it.thumbnail || posters[it.id] || "").trim();
  return /^https?:\/\//i.test(p);
}

/** Stable split: items with a poster URL in data, then the rest. */
function postersFirst(list: RawItem[], posters: Record<string, string>): RawItem[] {
  const withPoster: RawItem[] = [];
  const without: RawItem[] = [];
  for (const it of list) (hasDataPoster(it, posters) ? withPoster : without).push(it);
  return [...withPoster, ...without];
}

export function buildIndexes(
  items: RawItem[],
  posters: Record<string, string>,
  videyNo: Map<string, number>,
  at: number,
): BuiltCache {
  const raw = items;
  const byId = new Map<string, RawItem>();
  const bySlug = new Map<string, RawItem[]>();
  const haystack: { item: RawItem; hay: string }[] = [];
  const hiddenIds = new Set<string>();
  items = items
    .filter((it) => {
      if (!isHiddenRaw(it)) return true;
      hiddenIds.add(it.id);
      return false;
    })
    .map(withStats);
  lastHiddenIds = hiddenIds;
  // Frameless Videy items past the limit leave every list but stay in byId, so /watch still opens.
  const now = Date.now();
  const videyNoThumbIds = new Set<string>();
  let videyNoThumbNextAt = 0;
  for (const it of items) {
    byId.set(it.id, it);
    const hideAt = videyNoThumbHideAt(it, timeKey(it));
    if (!hideAt) continue;
    if (hideAt <= now) videyNoThumbIds.add(it.id);
    else if (!videyNoThumbNextAt || hideAt < videyNoThumbNextAt) videyNoThumbNextAt = hideAt;
  }
  if (videyNoThumbIds.size) items = items.filter((it) => !videyNoThumbIds.has(it.id));
  // Multi-server: copies of one video on other hosts fold into its main page (multi-server.ts).
  // Built from the published items only, so a hidden copy is never a server. Nothing is deleted.
  const groups = mergeServers(items).groups;
  const multi = multiServerFrom(items, groups);
  if (multi.mainOf.size) {
    // A main page with no poster of its own shows the best poster of its other copies.
    const borrowed = borrowedPosters(items, groups, (it) => thumbOf(it, posters));
    items = items
      .filter((it) => !multi.mainOf.has(it.id))
      .map((it) => {
        const poster = borrowed.get(it.id);
        if (!poster) return it;
        const next = { ...it, poster };
        byId.set(it.id, next);
        return next;
      });
    for (const id of multi.mainOf.keys()) byId.delete(id);
  }
  const popular = popularIds(items);
  for (const it of items) {
    // Multi-category (title-tags.ts): the video joins its primary category and every tag category.
    const slugs = titleTags(it.title, slugOf(it), tagOptions(it, popular));
    // Owner-chosen extra categories (/pemilik > Edit): the video also shows up in each of them.
    const extra = Array.isArray(it.ownerExtraCategories) ? (it.ownerExtraCategories as unknown[]) : [];
    for (const x of extra) {
      const cat = typeof x === "string" ? findCategory(x) : undefined;
      if (cat && !slugs.includes(cat.slug)) slugs.push(cat.slug);
    }
    for (const slug of slugs) {
      const bucket = bySlug.get(slug);
      if (bucket) bucket.push(it);
      else bySlug.set(slug, [it]);
    }
    haystack.push({
      item: it,
      hay: `${(it.title || "").toLowerCase()} ${it.id.toLowerCase()}`,
    });
  }
  const core = mainCatalog(items);
  // Homepage = semua item (urut tanggal), tanpa batasi cuma IndoAV/UserBokep
  const mainSorted = sortByNewest(core);
  for (const [slug, list] of bySlug) {
    const sorted = sortByNewest(list, false);
    // /kategori/bokep: videos with a real poster in data first, logo-only ones after (stable, so the
    // newest-first order holds inside each group). A poster added to data/drp-bokep.json later moves
    // the video up on the next build. Other categories keep their order.
    bySlug.set(slug, slug === "bokep" ? postersFirst(sorted, posters) : sorted);
  }
  const terbaruSorted = terbaruOrder(mainSorted);
  const listOrder = categoryOrders(bySlug, mainSorted);
  return {
    at,
    items,
    posters,
    videyNo,
    byId,
    bySlug,
    mainSorted,
    terbaruSorted,
    listOrder,
    haystack,
    raw,
    hiddenIds,
    unhideKey,
    videyNoThumbIds,
    videyNoThumbNextAt,
    multi,
  };
}

/** Multi-server lookup of a built catalog (empty for a cache built without it). */
export function multiServerOf(cache: CatalogCache): MultiServer {
  return (cache as BuiltCache).multi || EMPTY_MULTI;
}
const EMPTY_MULTI = emptyMultiServer();

/**
 * Main page id for a copy that was merged into another page (multi-server.ts), else null. Used by
 * server/middleware/watch-placeholder.ts for the 301 of old /watch/<id> URLs.
 */
export async function mergedMainOf(id: string): Promise<string | null> {
  const key = String(id || "").trim();
  if (!key) return null;
  const cache = await loadItemsRaw();
  return multiServerOf(cache).mainOf.get(key) || null;
}

/**
 * Poster borrowed from another copy (buildIndexes) for a multi-server main page, else "". Used by
 * /thumb/<id> after its own poster maps miss, so the borrowed poster is fetched and stored in R2
 * under the main id once. Only main pages of a group are looked at.
 */
export async function mergedPosterOf(id: string): Promise<string> {
  const key = String(id || "").trim();
  if (!key) return "";
  const cache = await loadItemsRaw();
  if (!multiServerOf(cache).servers.has(key)) return "";
  const poster = String(cache.byId.get(key)?.poster || "").trim();
  return /^https:\/\//i.test(poster) ? poster : "";
}

export function pageOf(pool: RawItem[], page: number, limit: number, posters: Record<string, string>, videyNo: Map<string, number>): PagedVideos {
  const p = Math.max(1, page);
  const start = (p - 1) * limit;
  const slice = pool.slice(start, start + limit);
  return {
    page: p,
    limit,
    total: pool.length,
    hasMore: start + limit < pool.length,
    items: slice.map((x) => toCard(x, posters, videyNo)),
  };
}

/** Poster map of the bundled data (the posters half of assembleLocal, no item work). */
function localPosters(): Record<string, string> {
  return {
    ...(postersMap as Record<string, string>),
    ...asPosterMap(javPosters),
    ...asPosterMap(latestPosters),
    ...asPosterMap(putarinFeedSnapshot),
  };
}

export function assembleLocal(): { items: RawItem[]; posters: Record<string, string> } {
  const local = withIds(asList(localCatalog)).filter(isUsable);
  const latest = withIds(asList(latestVideos)).filter(isUsable);
  const st = withIds(asList(streamtapeBatch)).filter(isUsable);
  const st2 = withIds(asList(streamtapeBatchSep25)).filter(isUsable);
  const pu = withIds(asList(putarinBatch)).filter(isUsable);
  const pl = withIds(asList(latestPutarin)).filter(isUsable);
  // Owner folder ingest (IndoAV/UserBokep /f/ folders). Placed last so existing entries always win.
  const fb = withIds(asList(folderBatch20261007)).filter(isUsable);
  const drp = withIds(asList(drpBokepBatch)).filter(isUsable);
  // First, like the live feed it replaces (remote items used to be merged in front of the bundle).
  const feed = withIds(asList(putarinFeedSnapshot)).filter(isUsable);
  const posters: Record<string, string> = localPosters();
  return { items: mergeById([...feed, ...latest, ...pl, ...st, ...st2, ...pu, ...local, ...fb, ...drp]), posters };
}

export async function refreshRemote(base: { items: RawItem[]; posters: Record<string, string> }): Promise<CatalogCache> {
  if (!BOT_FEEDS.length) return runtime.cache || buildIndexes(base.items, base.posters, buildVideyNo(base.items), Date.now());
  const posters = { ...base.posters };
  const remote: RawItem[] = [];
  const botResults = await Promise.all(BOT_FEEDS.map((url) => fetchJson(url)));
  for (const data of botResults) {
    remote.push(...withIds(asList(data)).filter(isUsable));
    Object.assign(posters, asPosterMap(data));
  }
  const items = mergeById([...remote, ...base.items]);
  const videyNo = buildVideyNo(items);
  return buildIndexes(items, posters, videyNo, Date.now());
}

export function seedLocalCache(): CatalogCache {
  const local = assembleLocal();
  return buildIndexes(local.items, local.posters, buildVideyNo(local.items), Date.now());
}

/**
 * Built catalog from a snapshot (build-snapshot.ts) made by this same deploy under the same owner
 * lists. Same indexes and item objects as buildIndexes would give; `raw` (the pre-filter list, only
 * read by owner tools and rebuilds) is assembled from the bundled data on first use.
 */
function cacheFromSnapshot(text: string, key: string): BuiltCache | null {
  const parts = restoreBuild(text);
  if (!parts) return null;
  const cache: BuiltCache = { ...parts, posters: localPosters(), unhideKey: key };
  let raw: RawItem[] | undefined;
  Object.defineProperty(cache, "raw", {
    enumerable: true,
    configurable: true,
    get: () => (raw ??= assembleLocal().items),
    set: (v: RawItem[] | undefined) => {
      raw = v;
    },
  });
  lastHiddenIds = parts.hiddenIds;
  return cache;
}

/** Saves a fresh build as this data centre's snapshot, after the response (waitUntil; best effort). */
function rememberBuild(cache: BuiltCache): void {
  if (BOT_FEEDS.length) return; // live feeds change between builds: never snapshot those
  const listKey = cache.unhideKey ?? "";
  const job = (async () => {
    const key = await snapshotKey(listKey);
    if (!key || runtime.cache !== cache) return;
    const text = serializeBuild(cache);
    if (text) await writeSnapshot(key, text);
  })().catch(() => {});
  keepAlive(job);
}

/** One cold seed per isolate, shared by both bundled copies of this module (like runtime). */
const SEED_KEY = "__kdpCatalogSeedV1";
const seedHost = globalThis as unknown as Record<string, Promise<CatalogCache> | undefined>;

/**
 * Cold isolate: read this data centre's snapshot for the current deploy + owner lists, else build
 * (seedLocalCache, exactly as before) and save the build for the next cold isolate.
 */
async function coldSeed(): Promise<CatalogCache> {
  if (BOT_FEEDS.length) return seedLocalCache();
  const existing = seedHost[SEED_KEY];
  if (existing) return existing;
  const job = (async () => {
    const listKey = unhideKey;
    const key = await snapshotKey(listKey);
    if (key) {
      const text = await readSnapshot(key);
      if (text && listKey === unhideKey) {
        const cache = cacheFromSnapshot(text, listKey);
        if (cache) return cache;
      }
    }
    if (runtime.cache) return runtime.cache;
    const built = seedLocalCache() as BuiltCache;
    runtime.cache = built;
    rememberBuild(built);
    return built;
  })();
  seedHost[SEED_KEY] = job;
  try {
    return await job;
  } finally {
    seedHost[SEED_KEY] = undefined;
  }
}

export function kickRemoteRefresh(base: { items: RawItem[]; posters: Record<string, string> }): void {
  if (runtime.inflight) return;
  runtime.inflight = refreshRemote(base)
    .then((next) => {
      runtime.cache = next;
      return next;
    })
    .catch(() => runtime.cache as CatalogCache)
    .finally(() => {
      runtime.inflight = null;
    });
}

/** Refresh base: the raw list (hidden items included) so an Unhide can always restore them. */
function baseOf(cache: CatalogCache): { items: RawItem[]; posters: Record<string, string> } {
  return { items: (cache as BuiltCache).raw || cache.items, posters: cache.posters };
}

export async function loadItemsRaw(): Promise<CatalogCache> {
  await syncUnhidden();
  const cache = (await loadItemsInner()) as BuiltCache;
  // A refresh that started before the latest Unhide change: rebuild with the current list.
  // Or a frameless Videy item just crossed VIDEY_NO_THUMB_HIDE_HOURS (CPU only, at most once per item).
  const due = Boolean(cache.videyNoThumbNextAt && Date.now() >= cache.videyNoThumbNextAt);
  // The cache is shared with the other bundled copy of this module (local-shared.ts runtime). If it was
  // built under a newer owner list than this copy has seen, re-read the lists (KV read only) before
  // deciding to rebuild, so the two copies never rebuild back and forth over a stale key.
  if (cache.unhideKey !== unhideKey && !due && cache.raw) await syncUnhidden(true);
  if ((cache.unhideKey !== unhideKey || due) && cache.raw) {
    const next = buildIndexes(cache.raw, cache.posters, cache.videyNo, cache.at);
    if (runtime.cache === cache) {
      runtime.cache = next;
      rememberBuild(next);
    }
    return next;
  }
  return cache;
}

/**
 * The catalog is built ONCE per isolate from the bundled data (every upload lands through a GitHub
 * commit + deploy, so new videos arrive with the new deploy, not through a fetch). It is rebuilt only
 * when the owner's Unhide / hide / edit lists change (syncUnhidden, every 30 s from KV). Live feeds
 * (BOT_FEEDS, empty now) are still merged in every CACHE_MS if any are ever added again.
 */
async function loadItemsInner(): Promise<CatalogCache> {
  if (!runtime.cache) {
    const seeded = await coldSeed();
    runtime.cache ??= seeded;
  }
  if (!BOT_FEEDS.length) return runtime.cache;
  const now = Date.now();
  if (now - runtime.cache.at < CACHE_MS) return runtime.cache;
  if (now - runtime.cache.at < STALE_MS || runtime.cache.items.filter(isPutarin).length >= 200) {
    kickRemoteRefresh(baseOf(runtime.cache));
    return runtime.cache;
  }
  try {
    if (runtime.inflight) runtime.cache = await runtime.inflight;
    else runtime.cache = await refreshRemote(baseOf(runtime.cache));
  } catch {
    kickRemoteRefresh(baseOf(runtime.cache));
  }
  return runtime.cache;
}

/** Fitur 'Tidak publish' / hidden review DINONAKTIFKAN â€” selalu return set kosong. */
export async function getUnpublished(): Promise<Set<string>> {
  return new Set();
}

/** Videy item left off lists for a missing frame (/watch stays 200 with noindex). */
export async function isVideyNoThumbHidden(id: string): Promise<boolean> {
  const key = String(id || "").trim();
  if (!key) return false;
  const cache = (await loadItemsRaw()) as BuiltCache;
  return Boolean(cache.videyNoThumbIds?.has(key));
}

/** Owner list: frameless Videy items hidden right now, newest first. */
export async function listVideyNoThumbHidden(): Promise<RawItem[]> {
  const cache = (await loadItemsRaw()) as BuiltCache;
  const ids = cache.videyNoThumbIds;
  if (!ids?.size) return [];
  return sortByNewest([...ids].map((id) => cache.byId.get(id)).filter((it): it is RawItem => Boolean(it)), false);
}

/** Raw bundled items by id, only for publicIdBeforeBuild (dropped once the catalog is built). */
let rawById: Map<string, RawItem> | null = null;

/**
 * Cheap id check for beacon-style endpoints (/api/like, /api/player-log) on a fresh isolate, so a
 * like count or a player error report no longer builds the whole catalog (~1-2 s CPU) just to
 * validate one id. Same answer as `getDetail(id)` succeeding: the id is in the bundled catalog,
 * passes the same isHiddenRaw rules as buildIndexes (owner hide / lock / Unhide / edits, read from
 * KV first exactly like loadItemsRaw) and is not in HIDDEN_IDS unless unhidden (isPublicHidden).
 * Returns null once the catalog is built (or while live feeds exist): callers then use getDetail.
 */
export async function publicIdBeforeBuild(id: string): Promise<boolean | null> {
  if (runtime.cache || runtime.inflight || BOT_FEEDS.length) {
    rawById = null;
    return null;
  }
  await syncUnhidden();
  if (runtime.cache || runtime.inflight) {
    rawById = null;
    return null;
  }
  const key = String(id || "").trim();
  if (!key) return false;
  if (!rawById) {
    rawById = new Map<string, RawItem>();
    for (const it of assembleLocal().items) rawById.set(it.id, it);
  }
  const it = rawById.get(key);
  if (!it || isHiddenRaw(it)) return false;
  if (OWNER_HIDDEN.has(key)) return false;
  if (UNHIDDEN.has(key)) return true;
  return !HIDDEN_IDS.has(key);
}

/** True for hidden ids (minor/school-themed content); /watch answers 404 + noindex for them. */
export async function isPublicHidden(id: string): Promise<boolean> {
  const key = String(id || "").trim();
  if (!key) return false;
  const cache = (await loadItemsRaw()) as BuiltCache;
  if (OWNER_HIDDEN.has(key)) return true;
  // Built with isHiddenRaw: already honours Unhide, except for locked clear minor themes.
  if ((cache.hiddenIds || lastHiddenIds).has(key)) return true;
  if (UNHIDDEN.has(key)) return false;
  return HIDDEN_IDS.has(key);
}

export type HiddenCandidate = { item: RawItem; reason: string; unhidden: boolean; unhiddenAt: number };

/**
 * Owner-only (call from owner-auth endpoints): every item hidden by default, with its reason and
 * whether the owner has restored it. Always re-reads the Unhide list first.
 */
export async function listHiddenCandidates(unhideAt: Record<string, number> = {}): Promise<HiddenCandidate[]> {
  await syncUnhidden(true);
  const cache = (await loadItemsRaw()) as BuiltCache;
  const out: HiddenCandidate[] = [];
  const seen = new Set<string>();
  for (const it of cache.raw || cache.items) {
    if (!it?.id || seen.has(it.id)) continue;
    seen.add(it.id);
    // Same sources as isHiddenRaw, so this list always matches the "Tersembunyi" count.
    const ownerHidden = OWNER_HIDDEN.has(it.id);
    const locked = !ownerHidden && isLockedMinor(it);
    const reason = hiddenReasonRaw(it) || (ownerHidden ? "owner-hide" : locked ? "minor-lock" : "");
    if (!reason) continue;
    const forced = ownerHidden || locked;
    out.push({
      item: it,
      reason,
      unhidden: !forced && UNHIDDEN.has(it.id),
      unhiddenAt: unhideAt[it.id] || 0,
    });
  }
  return out;
}

/** Katalog publik = semua item (tanpa filter minor / Tidak publish). */
export async function loadItems(): Promise<CatalogCache> {
  return loadItemsRaw();
}

