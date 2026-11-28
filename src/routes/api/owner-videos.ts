import { createFileRoute } from "@tanstack/react-router";
import { isOwnerKey, ownerKeyFrom, ownerSecret } from "@/lib/owner-auth";
import { readyD1, wibDayStartMs, type D1DatabaseLike } from "@/lib/analytics-d1";
import { POP_ALL_IN, POP_SUMS, readPopDays } from "@/lib/stats14-d1";
import { PERIOD_KEYS, periodDays, type PeriodKey } from "@/lib/stats14";
import { wibDayKey } from "@/lib/traffic-valve";
import { mergeWatched, pageWatched, type WatchedList, type WatchedVideo } from "@/lib/owner-videos";

/**
 * Owner-only "Video ditonton" (/pemilik → Statistik): every video page opened in the period, with
 * opens, distinct visitors and popunder tabs per video, plus period totals.
 *
 * Read-only on existing data, nothing is written per visit:
 *  - opens / visitors: analytics_events pageviews on /watch/<id> (one grouped read per period);
 *  - popunders: player-log daily counters player_errors (events pop_n1..n6 = tabs opened, pop_x1..x6 = of
 *    those opened by the ExoClick fallback, pop_f1/f2 = neither brand opened, tap_e / tap_r = first play taps; keyed by video id);
 *  - title / thumbnail / category / server / upload date: the in-memory catalog (no DB read).
 * The full list per period is computed at most once per CACHE_SEC per data centre and kept in the Cache
 * API under /api/owner… (never served publicly); search, sort and the 10-row pages are cut from that
 * cached copy. Loaded only when the owner opens the Statistik tab; no polling.
 */
const CACHE_SEC = 600;
const CACHE_PATH = "/api/owner-videos-cache-v2";
const DAY_MS = 86_400_000;
const W = "coalesce(w, 1)";
const TITLE_LOOKUP_TIMEOUT_MS = 2500;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

function edgeCache(): Cache | null {
  try {
    return (caches as unknown as { default?: Cache }).default || null;
  } catch {
    return null;
  }
}

async function all<T>(db: D1DatabaseLike, sql: string, ...params: unknown[]): Promise<T[]> {
  const res = await db.prepare(sql).bind(...params).all<T>();
  return res.results || [];
}

/** Title, thumbnail, category, server and upload time from the catalog (best effort). */
async function withCatalog(rows: WatchedVideo[]): Promise<WatchedVideo[]> {
  if (!rows.length) return rows;
  try {
    const [{ runtime, toCard }, { loadItems }, { itemDate }] = await Promise.all([
      import("@/lib/catalog/local-shared"),
      import("@/lib/catalog/local-cache"),
      import("@/lib/catalog/feed-order"),
    ]);
    const bag =
      runtime.cache ??
      (await Promise.race([
        loadItems(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), TITLE_LOOKUP_TIMEOUT_MS)),
      ]));
    if (!bag) return rows;
    return rows.map((r) => {
      const item = bag.byId.get(r.id);
      if (!item) return r;
      try {
        const card = toCard(item, bag.posters, bag.videyNo);
        const t = itemDate(item);
        const up = t > 0 && t < 1e12 ? t * 1000 : t;
        return { ...r, title: card.title || "", thumb: card.thumbnail || "", cat: card.category || "", server: card.creator || "", up: up > 0 ? up : 0 };
      } catch {
        return r;
      }
    });
  } catch {
    return rows;
  }
}

async function compute(db: D1DatabaseLike, period: PeriodKey): Promise<WatchedList> {
  const today = wibDayKey();
  const { cur, prev } = periodDays(today, period);
  const c0 = wibDayStartMs(cur[0]);
  const c1 = wibDayStartMs(cur[cur.length - 1]) + DAY_MS;
  const p0 = prev.length ? wibDayStartMs(prev[0]) : c0;
  const [viewRows, prevRow, popRows, popDays] = await Promise.all([
    all<{ path: string; views: number; uniq: number }>(
      db,
      `select path, sum(vw * n) as views, sum(vw) as uniq from (
         select path, visitor_id, max(${W}) as vw, count(*) as n from analytics_events
          where created_at >= ?1 and created_at < ?2 and event_type = 'pageview' and path like '/watch/%'
          group by path, visitor_id
       ) group by path`,
      c0,
      c1,
    ),
    db
      .prepare(
        `select coalesce(sum(${W}), 0) as n from analytics_events
          where created_at >= ?1 and created_at < ?2 and event_type = 'pageview' and path like '/watch/%'`,
      )
      .bind(p0, c0)
      .first<{ n: number }>(),
    all<{ id: string; n: number; exo: number; fail: number }>(
      db,
      `select id, ${POP_SUMS} from player_errors
        where day >= ?1 and day <= ?2 and event in (${POP_ALL_IN}) group by id`,
      cur[0],
      cur[cur.length - 1],
    ).catch(() => [] as { id: string; n: number; exo: number; fail: number }[]),
    readPopDays(db, prev[0] || cur[0], cur[cur.length - 1]).catch(() => []),
  ]);
  const curSet = new Set(cur);
  const prevSet = new Set(prev);
  const pops = { videy: 0, other: 0, prevVidey: 0, prevOther: 0, exo: 0, prevExo: 0, fail: 0, prevFail: 0, tap: 0, prevTap: 0, revisit: 0, prevRevisit: 0 };
  for (const r of popDays) {
    const v = r.host === "Videy";
    if (curSet.has(r.day)) {
      if (v) pops.videy += r.n;
      else pops.other += r.n;
      pops.exo += r.exo || 0;
      pops.fail += r.fail || 0;
      pops.tap += r.tap || 0;
      pops.revisit += r.revisit || 0;
    } else if (prevSet.has(r.day)) {
      if (v) pops.prevVidey += r.n;
      else pops.prevOther += r.n;
      pops.prevExo += r.exo || 0;
      pops.prevFail += r.fail || 0;
      pops.prevTap += r.tap || 0;
      pops.prevRevisit += r.revisit || 0;
    }
  }
  const rows = await withCatalog(mergeWatched(viewRows, popRows));
  return {
    period,
    rows,
    totals: {
      views: rows.reduce((a, r) => a + r.views, 0),
      prevViews: Math.round(Number(prevRow?.n) || 0),
      pops,
    },
    updatedAt: new Date().toISOString(),
  };
}

async function load(origin: string, period: PeriodKey): Promise<WatchedList> {
  const cache = edgeCache();
  const key = new Request(`${origin}${CACHE_PATH}/${period}`);
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit) return (await hit.json()) as WatchedList;
    } catch {
      /* fall through */
    }
  }
  const db = await readyD1();
  if (!db) throw new Error("d1_not_bound");
  const data = await compute(db, period);
  if (cache) {
    try {
      await cache.put(
        key,
        new Response(JSON.stringify(data), {
          headers: { "content-type": "application/json", "cache-control": `public, max-age=${CACHE_SEC}` },
        }),
      );
    } catch {
      /* cache optional */
    }
  }
  return data;
}

export const Route = createFileRoute("/api/owner-videos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!ownerSecret()) return json({ ok: false, error: "not_configured" }, 503);
        if (!(await isOwnerKey(ownerKeyFrom(request)))) return json({ ok: false, error: "forbidden" }, 403);
        const u = new URL(request.url);
        const p = u.searchParams.get("p") || "today";
        const period = ((PERIOD_KEYS as readonly string[]).includes(p) ? p : "today") as PeriodKey;
        try {
          const list = await load(u.origin, period);
          return json(
            pageWatched(list, {
              q: u.searchParams.get("q") || "",
              sort: u.searchParams.get("sort") || "views",
              dir: u.searchParams.get("dir") || "desc",
              page: Number(u.searchParams.get("page")) || 1,
            }),
          );
        } catch (err) {
          console.error("[owner-videos] failed", err);
          return json({ ok: false, error: "busy", hint: "Data video sibuk, coba lagi sebentar." }, 503);
        }
      },
    },
  },
});
