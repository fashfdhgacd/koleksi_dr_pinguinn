/**
 * Server-side ranking lists for /kategori/paling-ditonton and /kategori/paling-disukai.
 *  - Pool: the public catalog (loadItems().items already excludes hidden ids and respects the
 *    owner's Unhide list), Videy excluded. Pure ranking: no IndoAV page-1 rule.
 *  - Views: source views (video-stats.json). Likes: source likes + our own visitor likes (D1).
 *  - D1 likes are read as ONE aggregated query, cached in KV ("rank:likes:v1", refreshed at most every
 *    45 min) and in-isolate for 10 min, so page views never hit D1 directly.
 *  - Views week/month: our own /watch/<id> pageviews (D1 analytics_events), ONE aggregate query per
 *    period, cached in KV ("rank:views:v1:<period>", refreshed at most every 60 min) and in-isolate for
 *    10 min. Videy is included in these two tabs.
 *  - Likes week/month: our own visitors' likes inside the period, from the dated D1 like rows
 *    (video_like_guard, kept 32 days; sum(liked) per id) or the delta against the oldest KV day snapshot in
 *    the period, whichever is larger; plus source-like deltas from rank-periods.json when present. ONE
 *    aggregate query per period, cached in KV ("rank:likes:p1:<period>", refreshed at most every 60 min).
 *    After the period-liked videos come the newest catalog videos by total likes, so the tab never runs dry.
 */
import { DEFAULT_PAGE_SIZE } from "./types";
import type { PagedVideos } from "./types";
import { isVidey, type RawItem } from "./local-shared";
import { loadItems, pageOf } from "./local-cache";
import { rankPeriodAvailable, rankPeriodInfo, type RankKind, type RankPeriod } from "./rankings";

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

/** Live D1 likes for /api/likes-live (that endpoint is edge-cached ~60 s). null = D1 unavailable. */
export async function siteLikesLive(): Promise<LikeMap | null> {
  return readD1Likes();
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

const LIKES_PERIOD_KV = "rank:likes:p1:";
const LIKES_PERIOD_FRESH_MS = 60 * 60_000;

async function readD1LikesSince(day: string): Promise<LikeMap | null> {
  if (!import.meta.env.SSR) return null;
  try {
    const { getD1 } = await import("@/lib/analytics-d1");
    const db = await getD1();
    if (!db) return null;
    const res = await db
      .prepare(
        "select id, sum(liked) as n from video_like_guard where day >= ? group by id having n > 0 order by n desc limit 20000",
      )
      .bind(day)
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

/** Oldest KV like snapshot on or after `from` (and before today), with its day. */
async function oldestSnapshotSince(from: string, today: string): Promise<LikeMap | null> {
  let t = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${today}T00:00:00Z`);
  for (let i = 0; i < 31 && t < end; i++, t += 86_400_000) {
    const snap = await siteLikesOnDay(new Date(t).toISOString().slice(0, 10));
    if (snap) return snap;
  }
  return null;
}

const likesPeriodMemo = new Map<string, { at: number; likes: LikeMap }>();
const likesPeriodInflight = new Map<string, Promise<LikeMap>>();

/** Our own visitor likes per id within the week/month range (D1 + KV snapshots via KV cache). Never throws. */
async function siteLikesPeriod(period: "week" | "month", from: string): Promise<LikeMap> {
  const now = Date.now();
  const memo = likesPeriodMemo.get(period);
  if (memo && now - memo.at < MEMO_MS) return memo.likes;
  const running = likesPeriodInflight.get(period);
  if (running) return running;
  const p = (async () => {
    let cached: { at: number; from?: string; likes: LikeMap } | null = null;
    try {
      const raw = await kvGet(LIKES_PERIOD_KV + period);
      cached = raw ? (JSON.parse(raw) as { at: number; from?: string; likes: LikeMap }) : null;
    } catch {
      cached = null;
    }
    if (cached && cached.from === from && now - Number(cached.at) < LIKES_PERIOD_FRESH_MS) {
      likesPeriodMemo.set(period, { at: now, likes: cached.likes || {} });
      return cached.likes || {};
    }
    const rows = await readD1LikesSince(from);
    let likes: LikeMap | null = rows ? { ...rows } : null;
    const base = await oldestSnapshotSince(from, wibDay(now)).catch(() => null);
    if (base) {
      const site = await siteLikes();
      likes ??= {};
      for (const [id, n] of Object.entries(site)) {
        const d = n - (base[id] || 0);
        if (d > (likes[id] || 0)) likes[id] = d;
      }
    }
    if (likes) await kvPut(LIKES_PERIOD_KV + period, JSON.stringify({ at: now, from, likes }), 6 * 3600);
    const out = likes || cached?.likes || {};
    likesPeriodMemo.set(period, { at: now, likes: out });
    return out;
  })().finally(() => {
    likesPeriodInflight.delete(period);
  });
  likesPeriodInflight.set(period, p);
  return p;
}

/** How many of the newest catalog videos pad the likes week/month tabs after the period-liked ones. */
const RECENT_PAD = { week: 240, month: 960 } as const;

const VIEWS_KV = "rank:views:v2:";
const VIEWS_FRESH_MS = 60 * 60_000;

async function readD1Views(days: number): Promise<LikeMap | null> {
  if (!import.meta.env.SSR) return null;
  try {
    const { readyD1, d1TopVideos } = await import("@/lib/analytics-d1");
    const db = await readyD1();
    if (!db) return null;
    return await d1TopVideos(db, days, 20000);
  } catch {
    return null;
  }
}

const viewsMemo = new Map<string, { at: number; views: LikeMap }>();
const viewsInflight = new Map<string, Promise<LikeMap>>();

/** Our own visitor pageviews per id for the last 7/30 days (D1 aggregate via KV cache). Never throws. */
async function siteViews(period: "week" | "month" | "all"): Promise<LikeMap> {
  const now = Date.now();
  const memo = viewsMemo.get(period);
  if (memo && now - memo.at < MEMO_MS) return memo.views;
  const running = viewsInflight.get(period);
  if (running) return running;
  const p = (async () => {
    let cached: { at: number; views: LikeMap } | null = null;
    try {
      const raw = await kvGet(VIEWS_KV + period);
      cached = raw ? (JSON.parse(raw) as { at: number; views: LikeMap }) : null;
    } catch {
      cached = null;
    }
    if (cached && now - Number(cached.at) < VIEWS_FRESH_MS) {
      viewsMemo.set(period, { at: now, views: cached.views || {} });
      return cached.views || {};
    }
    const fresh = await readD1Views(period === "week" ? 7 : period === "month" ? 30 : 90);
    if (fresh) await kvPut(VIEWS_KV + period, JSON.stringify({ at: now, views: fresh }), 6 * 3600);
    const views = fresh || cached?.views || {};
    viewsMemo.set(period, { at: now, views });
    return views;
  })().finally(() => {
    viewsInflight.delete(period);
  });
  viewsInflight.set(period, p);
  return p;
}

/**
 * View counts on cards: IndoAV and UserBokep keep their source counts; every other source (Videy,
 * Puterin/Jav, Streamtape, FC2, ...) shows our own /watch/<id> pageviews (D1 keeps 90 days, so "all"
 * = everything recorded), 0 when none. Same KV/isolate cache as the ranking tabs (one D1 aggregate
 * per hour at most).
 */
const SOURCE_COUNT_CREATORS = new Set(["IndoAV", "UserBokep"]);
export async function withVideyViews<T extends { id: string; creator?: string | null; views?: number | null }>(
  cards: T[],
): Promise<T[]> {
  if (!import.meta.env.SSR || !cards.some((c) => c && !SOURCE_COUNT_CREATORS.has(String(c.creator || ""))))
    return cards;
  const views = await siteViews("all").catch(() => ({}) as LikeMap);
  return cards.map((c) =>
    c && !SOURCE_COUNT_CREATORS.has(String(c.creator || "")) ? { ...c, views: views[c.id] || 0 } : c,
  );
}

type Ranked = { item: RawItem; score: number };
const listMemo = new Map<string, { at: number; src: unknown; list: Ranked[] }>();

async function rankedList(kind: RankKind, period: RankPeriod): Promise<Ranked[]> {
  const cache = await loadItems();
  const key = `${kind}:${period}`;
  const now = Date.now();
  const hit = listMemo.get(key);
  if (hit && hit.src === cache && now - hit.at < MEMO_MS) return hit.list;

  const ownViews = kind === "views" && period !== "all";
  // Videy joins only the views week/month tabs (our own pageviews); other rankings stay Videy-free.
  const pool = cache.items.filter((it) => it?.id && (ownViews || !isVidey(it)));
  const site = kind === "likes" ? await siteLikes() : {};
  let score: (it: RawItem) => number;
  if (ownViews) {
    const views = await siteViews(period as "week" | "month");
    score = (it) => views[it.id] || 0;
  } else if (period === "all") {
    score =
      kind === "views"
        ? (it) => (typeof it.views === "number" ? it.views : 0)
        : (it) => (typeof it.likes === "number" ? it.likes : 0) + (site[it.id] || 0);
  } else if (kind === "likes") {
    const info = rankPeriodInfo(kind, period);
    if (!info) return [];
    const data = (await loadPeriods())[period];
    const src = data?.likes || {};
    const own = await siteLikesPeriod(period as "week" | "month", info.from);
    score = (it) => (src[it.id] || 0) + (own[it.id] || 0);
    const list: Ranked[] = [];
    const seen = new Set<string>();
    for (const it of pool) {
      const s = score(it);
      if (s > 0) {
        list.push({ item: it, score: s });
        seen.add(it.id);
      }
    }
    list.sort(
      (a, b) =>
        b.score - a.score ||
        (Number(b.item.likes) || 0) - (Number(a.item.likes) || 0) ||
        a.item.id.localeCompare(b.item.id),
    );
    // Pad with the newest public videos by total likes (source + ours), so the tab is never near-empty.
    const poolIds = new Set(pool.map((it) => it.id));
    const total = (it: RawItem) => (typeof it.likes === "number" ? it.likes : 0) + (site[it.id] || 0);
    const recent = cache.mainSorted
      .filter((it) => it?.id && poolIds.has(it.id) && !seen.has(it.id))
      .slice(0, RECENT_PAD[period as "week" | "month"])
      .filter((it) => total(it) > 0)
      .map((it) => ({ item: it, score: 0, t: total(it) }))
      .sort((a, b) => b.t - a.t || a.item.id.localeCompare(b.item.id));
    for (const r of recent) list.push({ item: r.item, score: 0 });
    listMemo.set(key, { at: now, src: cache, list });
    return list;
  } else {
    const data = (await loadPeriods())[period];
    if (!data) return [];
    const src = data.views || {};
    score = (it) => src[it.id] || 0;
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
  if (!rankPeriodAvailable(kind, period) || (period !== "all" && !rankPeriodInfo(kind, period))) {
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
  if (kind === "views" && period !== "all") {
    // Week/month cards show our own pageviews for the period (same cached siteViews map, no extra D1).
    const views = await siteViews(period as "week" | "month");
    const label = period === "week" ? "minggu ini" : "bulan ini";
    res.items = res.items.map((c) => ({ ...c, periodViews: views[c.id] || 0, periodLabel: label }));
  }
  if (kind === "likes") {
    // Cards show the combined like count (source likes + our visitors). Our part goes in siteLikes
    // (current KV/D1 value, not the 12-hour snapshot) so the card can swap it for the live count.
    res.items = res.items.map((c) => ({ ...c, siteLikes: site[c.id] || null }));
  }
  return res;
}
