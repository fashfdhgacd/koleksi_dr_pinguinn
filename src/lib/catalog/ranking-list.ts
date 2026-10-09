/**
 * Server-side ranking lists for /kategori/paling-ditonton and /kategori/paling-disukai.
 *  - Pool: the public catalog (loadItems().items already excludes hidden ids and respects the
 *    owner's Unhide list), Videy excluded. Pure ranking: no IndoAV page-1 rule.
 *  - Views: source views (video-stats.json). Likes: source likes + our own visitor likes (D1).
 *  - D1 likes are read as ONE aggregated query, cached in KV ("rank:likes:v1", refreshed at most every
 *    45 min) and in-isolate for 10 min, so page views never hit D1 directly.
 *  - Week/month: deltas from rank-periods.json (written by scripts/stats-snapshot.py). Our D1 likes
 *    join a period only when a D1 day snapshot exists for the period's start date.
 */
import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos } from "./types";
import { isVidey, type RawItem } from "./local-shared";
import { loadItems, pageOf } from "./local-cache";
import { periodAvailable, periodInfo, type RankKind, type RankPeriod } from "./rankings";

type PeriodData = { from: string; to: string; days: number; views: Record<string, number>; likes: Record<string, number> };
type Periods = { week: PeriodData | null; month: PeriodData | null };
type LikeMap = Record<string, number>;

const LIKES_KV = "rank:likes:v1";
const LIKES_DAY_KV = "rank:likes:day:";
const LIKES_FRESH_MS = 45 * 60_000;
const MEMO_MS = 10 * 60_000;

let periodsP: Promise<Periods> | null = null;
function loadPeriods(): Promise<Periods> {
  periodsP ??= import("./rank-periods.json")
    .then((m) => ((m as { default?: unknown }).default || m) as Periods)
    .catch(() => ({ week: null, month: null }));
  return periodsP;
}

function wibDay(ts = Date.now()): string {
  return new Date(ts + 7 * 3600_000).toISOString().slice(0, 10);
}

// import.meta.env.SSR guards keep the server-only KV/D1 modules out of the browser bundle.
async function kvGet(key: string): Promise<string | null> {
  if (!import.meta.env.SSR) return null;
  const { optionalKvGet } = await import("@/lib/owner-analytics-shared");
  return optionalKvGet(key);
}

async function kvPut(key: string, value: string, ttl: number): Promise<void> {
  if (!import.meta.env.SSR) return;
  const { optionalKvPut } = await import("@/lib/owner-analytics-shared");
  await optionalKvPut(key, value, ttl);
}

async function readD1Likes(): Promise<LikeMap | null> {
  if (!import.meta.env.SSR) return null;
  try {
    const { getD1 } = await import("@/lib/analytics-d1");
    const db = await getD1();
    if (!db) return null;
    const res = await db
      .prepare("select id, n from video_likes where n > 0 order by n desc limit 20000")
      .all<{ id: string; n: number }>();
    const out: LikeMap = {};
    for (const r of res.results || []) {
      const n = Math.floor(Number(r.n) || 0);
      if (r.id && n > 0) out[String(r.id)] = n;
    }
    return out;
  } catch {
    return null; // table not created yet / D1 unavailable
  }
}

let likesMemo: { at: number; likes: LikeMap } | null = null;
let likesInflight: Promise<LikeMap> | null = null;

/** Our own visitor likes per id (D1 aggregate via KV cache). Never throws. */
export async function siteLikes(): Promise<LikeMap> {
  const now = Date.now();
  if (likesMemo && now - likesMemo.at < MEMO_MS) return likesMemo.likes;
  if (likesInflight) return likesInflight;
  likesInflight = (async () => {
    let cached: { at: number; likes: LikeMap } | null = null;
    try {
      const raw = await kvGet(LIKES_KV);
      cached = raw ? (JSON.parse(raw) as { at: number; likes: LikeMap }) : null;
    } catch {
      cached = null;
    }
    if (cached && now - Number(cached.at) < LIKES_FRESH_MS) {
      likesMemo = { at: now, likes: cached.likes || {} };
      return likesMemo.likes;
    }
    const fresh = await readD1Likes();
    if (fresh) {
      await kvPut(LIKES_KV, JSON.stringify({ at: now, likes: fresh }), 6 * 3600);
      const dayKey = LIKES_DAY_KV + wibDay(now);
      if (!(await kvGet(dayKey))) await kvPut(dayKey, JSON.stringify(fresh), 45 * 86_400);
    }
    const likes = fresh || cached?.likes || {};
    likesMemo = { at: now, likes };
    return likes;
  })().finally(() => {
    likesInflight = null;
  });
  return likesInflight;
}

const dayMemo = new Map<string, LikeMap | null>();
async function siteLikesOnDay(day: string): Promise<LikeMap | null> {
  if (dayMemo.has(day)) return dayMemo.get(day) || null;
  let out: LikeMap | null = null;
  try {
    const raw = await kvGet(LIKES_DAY_KV + day);
    out = raw ? (JSON.parse(raw) as LikeMap) : null;
  } catch {
    out = null;
  }
  dayMemo.set(day, out);
  return out;
}

type Ranked = { item: RawItem; score: number };
const listMemo = new Map<string, { at: number; src: unknown; list: Ranked[] }>();

async function rankedList(kind: RankKind, period: RankPeriod): Promise<Ranked[]> {
  const cache = await loadItems();
  const key = `${kind}:${period}`;
  const now = Date.now();
  const hit = listMemo.get(key);
  if (hit && hit.src === cache && now - hit.at < MEMO_MS) return hit.list;

  const pool = cache.items.filter((it) => it?.id && !isVidey(it));
  const site = kind === "likes" ? await siteLikes() : {};
  let score: (it: RawItem) => number;
  if (period === "all") {
    score =
      kind === "views"
        ? (it) => (typeof it.views === "number" ? it.views : 0)
        : (it) => (typeof it.likes === "number" ? it.likes : 0) + (site[it.id] || 0);
  } else {
    const data = (await loadPeriods())[period];
    if (!data) return [];
    const src = kind === "views" ? data.views || {} : data.likes || {};
    const base = kind === "likes" ? await siteLikesOnDay(data.from) : null;
    score = (it) => {
      let s = src[it.id] || 0;
      if (base) s += Math.max(0, (site[it.id] || 0) - (base[it.id] || 0));
      return s;
    };
  }
  const list: Ranked[] = [];
  for (const it of pool) {
    const s = score(it);
    if (s > 0) list.push({ item: it, score: s });
  }
  list.sort(
    (a, b) =>
      b.score - a.score ||
      (Number(b.item.views) || 0) - (Number(a.item.views) || 0) ||
      a.item.id.localeCompare(b.item.id),
  );
  listMemo.set(key, { at: now, src: cache, list });
  return list;
}

/** One page of a ranking. Unavailable periods return an empty page (never estimated numbers). */
export async function listRanking(
  kind: RankKind,
  period: RankPeriod,
  page = 1,
  limit = DEFAULT_PAGE_SIZE,
): Promise<PagedVideos> {
  const { posters, videyNo } = await loadItems();
  if (!periodAvailable(period) || (period !== "all" && !periodInfo(period))) {
    return pageOf([], 1, limit, posters, videyNo);
  }
  const list = await rankedList(kind, period);
  const site = kind === "likes" ? await siteLikes() : {};
  const lastPage = Math.max(1, Math.ceil(list.length / Math.max(1, limit)));
  const res = pageOf(
    list.map((r) => r.item),
    Math.min(Math.max(1, page), lastPage),
    limit,
    posters,
    videyNo,
  );
  if (kind === "likes") {
    // Cards show the combined like count (source + our visitors).
    // siteLikes (12-hour snapshot) is cleared here so the card does not count our likes twice.
    res.items = res.items.map((c) => ({ ...c, likes: (c.likes || 0) + (site[c.id] || 0), siteLikes: null }));
  }
  return res;
}
