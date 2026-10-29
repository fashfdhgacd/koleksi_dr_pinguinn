/**
 * Serialised copy of a built catalog (buildIndexes output), so a fresh isolate can skip the
 * ~1.2 s CPU build (Workers Logs, Oct 28-29 2026: requests >= 300 ms CPU were 4.6% of requests but
 * 88% of all CPU, median 1.27 s, i.e. one full catalog build per cold isolate).
 *
 * Pure functions only (no I/O): build-snapshot-store.ts keeps the text in the Cache API of the data
 * centre, keyed by deploy version + owner hide/unhide/edit lists, so it is only ever read back by the
 * exact same code and data that wrote it.
 *
 * Format: every built item once (`objs`, the byId values in insertion order); every list as indexes
 * into `objs`, so object identity between lists (items, mainSorted, bySlug, ...) is the same as after
 * a real build. Nothing is recomputed from titles, so the result does not depend on the detectors.
 */
import type { CatalogCache, RawItem } from "./local-shared";
import { emptyMultiServer, type MultiServer } from "./multi-server";

/** Bump when the format or the fields below change. 2: multi-server groups (ms, away). */
export const SNAPSHOT_SCHEMA = 2;

export type SnapshotSource = CatalogCache & {
  hiddenIds?: Set<string>;
  videyNoThumbIds?: Set<string>;
  videyNoThumbNextAt?: number;
  multi?: MultiServer;
};

export type RestoredParts = {
  at: number;
  items: RawItem[];
  videyNo: Map<string, number>;
  byId: Map<string, RawItem>;
  bySlug: Map<string, RawItem[]>;
  mainSorted: RawItem[];
  terbaruSorted: RawItem[];
  listOrder: Map<string, RawItem[]>;
  haystack: { item: RawItem; hay: string }[];
  hiddenIds: Set<string>;
  videyNoThumbIds: Set<string>;
  videyNoThumbNextAt: number;
  multi: MultiServer;
};

type Wire = {
  s: number;
  at: number;
  objs: RawItem[];
  /** [obj index, key] of own properties whose value is undefined (JSON would drop the key). */
  u: [number, string][];
  items: number[];
  hidden: string[];
  vnt: string[];
  vntNext: number;
  videyNo: [string, number][];
  main: number[];
  terbaru: number[];
  slugs: [string, number[]][];
  order: [string, number[]][];
  /** Multi-server: [main id, server ids in order]. */
  ms: [string, string[]][];
  /** Multi-server: indexes into objs of merged-away copies (kept out of byId on restore). */
  away: number[];
};

/** True when JSON keeps this value exactly (undefined is handled separately, one level deep). */
function jsonSafe(v: unknown, depth = 0): boolean {
  if (v === null) return true;
  switch (typeof v) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(v) && !Object.is(v, -0);
    case "object": {
      if (depth > 4) return false;
      if (Array.isArray(v)) return v.every((x) => x !== undefined && jsonSafe(x, depth + 1));
      if (Object.getPrototypeOf(v) !== Object.prototype) return false;
      for (const x of Object.values(v as Record<string, unknown>)) if (x === undefined || !jsonSafe(x, depth + 1)) return false;
      return true;
    }
    default:
      return false;
  }
}

/** Snapshot text, or null when the build holds something JSON cannot carry exactly (then no snapshot). */
export function serializeBuild(c: SnapshotSource): string | null {
  const objs: RawItem[] = [];
  const at = new Map<RawItem, number>();
  const u: [number, string][] = [];
  for (const it of c.byId.values()) {
    if (at.has(it)) continue;
    const i = objs.length;
    at.set(it, i);
    objs.push(it);
    for (const [k, v] of Object.entries(it)) {
      if (v === undefined) u.push([i, k]);
      else if (!jsonSafe(v)) return null;
    }
  }
  const away: number[] = [];
  for (const [id, it] of c.multi?.away || []) {
    const item = it as RawItem;
    if (item.id !== id || at.has(item) || c.byId.has(id)) return null;
    const i = objs.length;
    at.set(item, i);
    objs.push(item);
    away.push(i);
    for (const [k, v] of Object.entries(item)) {
      if (v === undefined) u.push([i, k]);
      else if (!jsonSafe(v)) return null;
    }
  }
  const idx = (list: RawItem[]): number[] | null => {
    const out: number[] = new Array(list.length);
    for (let i = 0; i < list.length; i++) {
      const n = at.get(list[i]);
      if (n === undefined) return null;
      out[i] = n;
    }
    return out;
  };
  const items = idx(c.items);
  const main = idx(c.mainSorted);
  const terbaru = idx(c.terbaruSorted);
  if (!items || !main || !terbaru) return null;
  const slugs: [string, number[]][] = [];
  for (const [slug, list] of c.bySlug) {
    const l = idx(list);
    if (!l) return null;
    slugs.push([slug, l]);
  }
  const order: [string, number[]][] = [];
  for (const [slug, list] of c.listOrder) {
    const l = idx(list);
    if (!l) return null;
    order.push([slug, l]);
  }
  // haystack is rebuilt from items on restore; refuse if it is not the plain items order.
  if (c.haystack.length !== c.items.length || c.haystack.some((h, i) => h.item !== c.items[i])) return null;
  for (const [, n] of c.videyNo) if (!Number.isFinite(n)) return null;
  if (!Number.isFinite(c.at)) return null;
  const wire: Wire = {
    s: SNAPSHOT_SCHEMA,
    at: c.at,
    objs,
    u,
    items,
    hidden: [...(c.hiddenIds || [])],
    vnt: [...(c.videyNoThumbIds || [])],
    vntNext: c.videyNoThumbNextAt || 0,
    videyNo: [...c.videyNo],
    main,
    terbaru,
    slugs,
    order,
    ms: [...(c.multi?.servers || [])].map(([main, ids]) => [main, ids.slice()]),
    away,
  };
  return JSON.stringify(wire);
}

/** Same haystack text as buildIndexes. */
export function hayOf(it: RawItem): string {
  return `${(it.title || "").toLowerCase()} ${it.id.toLowerCase()}`;
}

/** Rebuilds the indexes from snapshot text; null for anything unexpected (caller then builds). */
export function restoreBuild(text: string): RestoredParts | null {
  let w: Wire;
  try {
    w = JSON.parse(text) as Wire;
  } catch {
    return null;
  }
  if (!w || w.s !== SNAPSHOT_SCHEMA || !Array.isArray(w.objs)) return null;
  const objs = w.objs;
  const n = objs.length;
  for (const [i, k] of w.u) {
    if (!(i >= 0 && i < n)) return null;
    (objs[i] as Record<string, unknown>)[k] = undefined;
  }
  let bad = false;
  const pick = (ix: number[]): RawItem[] => {
    const out: RawItem[] = new Array(ix.length);
    for (let i = 0; i < ix.length; i++) {
      const it = objs[ix[i]];
      if (!it) bad = true;
      out[i] = it;
    }
    return out;
  };
  if (!Array.isArray(w.ms) || !Array.isArray(w.away)) return null;
  const awayIx = new Set(w.away);
  const byId = new Map<string, RawItem>();
  const multi = emptyMultiServer();
  for (let i = 0; i < n; i++) {
    const it = objs[i];
    if (!it || typeof it.id !== "string") return null;
    if (awayIx.has(i)) multi.away.set(it.id, it);
    else byId.set(it.id, it);
  }
  if (multi.away.size !== awayIx.size) return null;
  for (const [main, ids] of w.ms) {
    if (typeof main !== "string" || !Array.isArray(ids) || !byId.has(main)) return null;
    multi.servers.set(main, ids.slice());
    for (const id of ids) {
      if (id === main) continue;
      if (!multi.away.has(id)) return null;
      multi.mainOf.set(id, main);
    }
  }
  if (multi.mainOf.size !== multi.away.size) return null;
  const items = pick(w.items);
  const mainSorted = pick(w.main);
  const terbaruSorted = pick(w.terbaru);
  const bySlug = new Map<string, RawItem[]>();
  for (const [slug, ix] of w.slugs) bySlug.set(slug, pick(ix));
  const listOrder = new Map<string, RawItem[]>();
  for (const [slug, ix] of w.order) listOrder.set(slug, pick(ix));
  if (bad) return null;
  const haystack = items.map((item) => ({ item, hay: hayOf(item) }));
  return {
    at: w.at,
    items,
    videyNo: new Map(w.videyNo),
    byId,
    bySlug,
    mainSorted,
    terbaruSorted,
    listOrder,
    haystack,
    hiddenIds: new Set(w.hidden),
    videyNoThumbIds: new Set(w.vnt),
    videyNoThumbNextAt: w.vntNext || 0,
    multi,
  };
}
