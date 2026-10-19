import { DEFAULT_PAGE_SIZE } from "./types";
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
  mainCatalog,
  slugOf,
  toCard,
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
import { isLockedMinorId, lockedMinorReason } from "./minor-lock.js";
import postersMap from "./posters.json";
import javPosters from "./jav-posters.json";
import latestVideos from "../../../data/videos-latest.json";
// Putarin uploads from the Telegram bot land here (bot appends, dedupes by id); bundle so every batch stays live.
import latestPutarin from "../../../data/putarin-latest.json";
import latestPosters from "../../../data/latest-posters.json";
// Owner's Byse / DoodStream / LuluStream library (/kategori/bokep), one-off import 2026-10-19.
import drpBokepBatch from "../../../data/drp-bokep.json";
// Frozen copy of the old repo's live feed (koleksi_dr_pinguin data/putarin.json, last change Oct 7 2026),
// bundled so no request ever fetches it from raw.githubusercontent.com again (see BOT_FEEDS).
import putarinFeedSnapshot from "./putarin-feed-20261007.json";

// Re-bind mutable cache/inflight via shared module namespace
import { runtime } from "./local-shared";

function sourcePriority(item: RawItem): number {
  // Kategori/pencarian: IndoAV di atas Userbokep, lalu sumber lain
  if (isIndoAv(item)) return 100;
  if (isUserBokep(item)) return 50;
  return 0;
}

/**
 * Same order as before (source priority, then createdAt/date newest first; stable), but the keys are
 * computed once per item instead of 3 regex tests per comparison.
 */
export function sortByNewest(items: RawItem[]): RawItem[] {
  const keyed = items.map((it) => ({ it, p: sourcePriority(it), t: Number(it.createdAt || it.date || 0) }));
  keyed.sort((a, b) => b.p - a.p || b.t - a.t);
  return keyed.map((k) => k.it);
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
/** Owner edits from /pemilik (KV owner:edit:v1, owner-edit-store.ts), applied on top of OVERRIDES. */
let EDITS: Record<string, { title?: string; category?: string }> = {};
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
    r = minorContentReason(title);
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
};

let lastHiddenIds = new Set<string>();
let UNHIDDEN = new Set<string>();
/** Owner "Sembunyikan" from the Player error card (KV owner:hide:v1, owner-hide-store.ts). Wins over Unhide. */
let OWNER_HIDDEN = new Set<string>();
let unhideKey = "";
let unhideCheckedAt = 0;
let unhideInflight: Promise<void> | null = null;
const UNHIDE_TTL_MS = 30_000;

/** Why an item is hidden by default ("" = not hidden). Ignores owner Unhide overrides. */
export function hiddenReasonRaw(it: RawItem): string {
  const listed = HIDDEN_REASONS[it.id];
  if (listed) return listed;
  const rec = it as { hidden?: unknown; hidden_reason?: unknown };
  if (rec.hidden === true) return String(rec.hidden_reason || "bot-flag");
  const ovHidden = OVERRIDES[it.id]?.hidden;
  if (ovHidden) return String(ovHidden);
  // Reviewed real title (owner edit, overrides.json, or "***" restored to "Tocil ..." via
  // RESTORED_TITLES) is checked instead of a masked stored title. An owner edit is checked as well
  // as the stored title, so editing can never take a flagged video out of the hidden list.
  const title = String(overrideTitle(it.id) || RESTORED[it.id] || it.title || "");
  const edited = EDITS[it.id]?.title ? String(OVERRIDES[it.id]?.title || RESTORED[it.id] || it.title || "") : "";
  return (
    minorReasonMemo(title) ||
    lockedReasonMemo(title) ||
    (edited ? minorReasonMemo(edited) || lockedReasonMemo(edited) : "")
  );
}

/** Clear school/minor theme (minor-lock.js): hidden even when the owner pressed Unhide. */
function isLockedMinor(it: RawItem): boolean {
  if (isLockedMinorId(it.id)) return true;
  if (EDITS[it.id]?.title && lockedReasonMemo(String(EDITS[it.id]?.title)) !== "") return true;
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
  edits: Record<string, { title?: string; category?: string }> | null;
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
          ? (data.edits as Record<string, { title?: string; category?: string }>)
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
  edits?: Record<string, { title?: string; category?: string }> | null,
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
  if (cur && cur.raw && cur.unhideKey !== key) {
    runtime.cache = buildIndexes(cur.raw, cur.posters, cur.videyNo, cur.at);
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
      ...(ed.category ? { category: ed.category } : {}),
    };
  }
  const title = typeof out.title === "string" ? out.title : "";
  const safe = title ? softenMinorTerms(title) : title;
  if (safe !== title) out = { ...out, title: safe };
  return out;
}

/**
 * Terbaru (homepage list) ordering, deterministic for pagination/SEO:
 *  - positions 1..24 (page 1): IndoAV only, same order as before
 *  - from page 2: every 3rd card is UserBokep (newest first), the rest IndoAV, until
 *    UserBokep runs out; then the remaining items keep the existing order.
 * Category pages and search keep their own ordering (mainSorted / bySlug / ranking).
 */
const TERBARU_FIRST_PAGE = DEFAULT_PAGE_SIZE;
export function terbaruOrder(sorted: RawItem[]): RawItem[] {
  const indo: RawItem[] = [];
  const ub: RawItem[] = [];
  const rest: RawItem[] = [];
  const vy: RawItem[] = [];
  for (const it of sorted) {
    if (isIndoAv(it)) indo.push(it);
    else if (isUserBokep(it)) ub.push(it);
    else if (isVidey(it)) vy.push(it);
    else rest.push(it);
  }
  const out: RawItem[] = indo.slice(0, TERBARU_FIRST_PAGE);
  let i = TERBARU_FIRST_PAGE;
  let u = 0;
  let slot = 0;
  while (u < ub.length && i < indo.length) {
    if (slot % 3 === 2) out.push(ub[u++]);
    else out.push(indo[i++]);
    slot++;
  }
  while (u < ub.length) out.push(ub[u++]);
  while (i < indo.length) out.push(indo[i++]);
  out.push(...rest);
  // Videy (newest first) mixed in from page 2 on (page 1 stays IndoAV only): one in every 4 cards.
  for (let k = 0; k < vy.length; k++) {
    const at = TERBARU_FIRST_PAGE + 1 + k * 4;
    if (at <= out.length) out.splice(at, 0, vy[k]);
    else out.push(vy[k]);
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
  for (const it of items) {
    byId.set(it.id, it);
    const slug = slugOf(it);
    const bucket = bySlug.get(slug);
    if (bucket) bucket.push(it);
    else bySlug.set(slug, [it]);
    haystack.push({
      item: it,
      hay: `${(it.title || "").toLowerCase()} ${it.id.toLowerCase()}`,
    });
  }
  const core = mainCatalog(items);
  // Homepage = semua item (urut tanggal), tanpa batasi cuma IndoAV/UserBokep
  const mainSorted = sortByNewest(core);
  for (const [slug, list] of bySlug) {
    const sorted = sortByNewest(list);
    // /kategori/bokep: videos with a real poster in data first, logo-only ones after (stable, so the
    // newest-first order holds inside each group). A poster added to data/drp-bokep.json later moves
    // the video up on the next build. Other categories keep their order.
    bySlug.set(slug, slug === "bokep" ? postersFirst(sorted, posters) : sorted);
  }
  const terbaruSorted = terbaruOrder(mainSorted);
  return {
    at,
    items,
    posters,
    videyNo,
    byId,
    bySlug,
    mainSorted,
    terbaruSorted,
    haystack,
    raw,
    hiddenIds,
    unhideKey,
  };
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
  const posters: Record<string, string> = {
    ...(postersMap as Record<string, string>),
    ...asPosterMap(javPosters),
    ...asPosterMap(latestPosters),
    ...asPosterMap(putarinFeedSnapshot),
  };
  return { items: uniqById([...feed, ...latest, ...pl, ...st, ...st2, ...pu, ...local, ...fb, ...drp]), posters };
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
  const items = uniqById([...remote, ...base.items]);
  const videyNo = buildVideyNo(items);
  return buildIndexes(items, posters, videyNo, Date.now());
}

export function seedLocalCache(): CatalogCache {
  const local = assembleLocal();
  return buildIndexes(local.items, local.posters, buildVideyNo(local.items), Date.now());
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
  if (cache.raw && cache.unhideKey !== unhideKey) {
    const next = buildIndexes(cache.raw, cache.posters, cache.videyNo, cache.at);
    if (runtime.cache === cache) runtime.cache = next;
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
  if (!runtime.cache) runtime.cache = seedLocalCache();
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

/** Fitur 'Tidak publish' / hidden review DINONAKTIFKAN — selalu return set kosong. */
export async function getUnpublished(): Promise<Set<string>> {
  return new Set();
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
    if (!it?.id || seen.has(it.id) || isVidey(it)) continue;
    seen.add(it.id);
    const reason = hiddenReasonRaw(it);
    if (!reason) continue;
    out.push({ item: it, reason, unhidden: UNHIDDEN.has(it.id), unhiddenAt: unhideAt[it.id] || 0 });
  }
  return out;
}

/** Katalog publik = semua item (tanpa filter minor / Tidak publish). */
export async function loadItems(): Promise<CatalogCache> {
  return loadItemsRaw();
}
