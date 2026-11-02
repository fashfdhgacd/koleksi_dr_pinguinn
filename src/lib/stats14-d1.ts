/**
 * D1 side of "Statistik 14 hari" (/pemilik). Reads the existing analytics_events rows; nothing is
 * written per visit. Each WIB day is folded once into analytics_daily_breakdown (a few hundred small
 * rows) and marked in analytics_breakdown_days:
 *  - a past day is final once computed STATS14_SETTLE_MS after it ended (late pings), then never
 *    scanned again (it also survives the 90-day prune of analytics_events);
 *  - today is recomputed at most every STATS14_TODAY_MS, and only when the owner opens the section
 *    (the API response is cached at the edge for the same time).
 * So a normal read touches ~28 days × ~350 breakdown rows plus, at most every 10 minutes, one scan
 * of today's events. The first read back-fills up to 28 days once.
 */
import type { D1DatabaseLike } from "@/lib/analytics-d1";
import { wibDayStartMs } from "@/lib/analytics-d1";
import {
  type BreakdownRow,
  type DayTotal,
  type DimVisitorRow,
  type Stats14,
  PATHS_PER_DAY,
  STATS14_DAYS,
  buildStats14,
  foldDayRows,
  wibDayList,
} from "@/lib/stats14";

const DAY_MS = 86_400_000;
export const STATS14_TODAY_MS = 10 * 60_000;
const STATS14_SETTLE_MS = 15 * 60_000;
/** Days folded from raw events in one call (first call = one-time back-fill of 28 days). */
const MAX_COMPUTE = 28;
const W = "coalesce(w, 1)";

const SCHEMA = [
  `create table if not exists analytics_daily_breakdown (
     day_wib text not null,
     kind text not null,
     k text not null,
     views integer not null default 0,
     uniq integer not null default 0,
     primary key (day_wib, kind, k)
   )`,
  `create table if not exists analytics_breakdown_days (
     day_wib text primary key,
     updated_at integer not null
   )`,
];

const g = globalThis as typeof globalThis & { __stats14Schema__?: Promise<void> };

function ensureSchema(db: D1DatabaseLike): Promise<void> {
  g.__stats14Schema__ ??= db
    .batch(SCHEMA.map((s) => db.prepare(s)))
    .then(() => undefined)
    .catch((err) => {
      g.__stats14Schema__ = undefined;
      throw err;
    });
  return g.__stats14Schema__;
}

async function all<T>(db: D1DatabaseLike, sql: string, ...params: unknown[]): Promise<T[]> {
  const res = await db.prepare(sql).bind(...params).all<T>();
  return res.results || [];
}

/** Fold one WIB day of analytics_events into breakdown rows (2 indexed range scans). */
export async function computeDay(db: D1DatabaseLike, day: string): Promise<BreakdownRow[]> {
  const t0 = wibDayStartMs(day);
  const t1 = t0 + DAY_MS;
  const RANGE = `created_at >= ?1 and created_at < ?2 and event_type = 'pageview'`;
  const [dims, paths] = await Promise.all([
    all<DimVisitorRow>(
      db,
      `select coalesce(device_type,'other') as device, coalesce(referrer,'(direct)') as ref,
              coalesce(country,'') as country, coalesce(browser,'other') as browser,
              coalesce(visitor_id,'') as visitor, max(${W}) as vw, count(*) as n
         from analytics_events where ${RANGE}
        group by 1, 2, 3, 4, 5`,
      t0,
      t1,
    ),
    all<{ path: string; views: number; uniq: number }>(
      db,
      `select path, sum(vw * n) as views, sum(vw) as uniq from (
         select coalesce(path,'/') as path, visitor_id, max(${W}) as vw, count(*) as n
           from analytics_events where ${RANGE}
          group by 1, 2
       ) group by path order by views desc limit ?3`,
      t0,
      t1,
      PATHS_PER_DAY,
    ),
  ]);
  const rows = foldDayRows(day, dims);
  for (const p of paths) {
    rows.push({ day, kind: "path", key: String(p.path || "/").slice(0, 200), views: Number(p.views) || 0, uniq: Number(p.uniq) || 0 });
  }
  return rows;
}

/** Replace one day's breakdown rows and mark it computed (D1 allows 100 bound params per statement). */
async function storeDay(db: D1DatabaseLike, day: string, rows: BreakdownRow[], now: number): Promise<void> {
  const st = [db.prepare(`delete from analytics_daily_breakdown where day_wib = ?1`).bind(day)];
  const PER = 20;
  for (let i = 0; i < rows.length; i += PER) {
    const chunk = rows.slice(i, i + PER);
    const vals = chunk.map(() => "(?, ?, ?, ?, ?)").join(", ");
    const params = chunk.flatMap((r) => [day, r.kind, r.key, Math.round(r.views), Math.round(r.uniq)]);
    st.push(
      db
        .prepare(
          `insert into analytics_daily_breakdown (day_wib, kind, k, views, uniq) values ${vals}
           on conflict (day_wib, kind, k) do update set views = excluded.views, uniq = excluded.uniq`,
        )
        .bind(...params),
    );
  }
  st.push(
    db
      .prepare(
        `insert into analytics_breakdown_days (day_wib, updated_at) values (?1, ?2)
         on conflict (day_wib) do update set updated_at = excluded.updated_at`,
      )
      .bind(day, now),
  );
  await db.batch(st);
}

/** Days whose breakdown must be (re)computed, newest first. */
export function staleDays(list: string[], today: string, done: Map<string, number>, now: number): string[] {
  return list
    .filter((d) => {
      const at = done.get(d);
      if (at === undefined) return true;
      if (d >= today) return now - at >= STATS14_TODAY_MS;
      return at < wibDayStartMs(d) + DAY_MS + STATS14_SETTLE_MS;
    })
    .reverse();
}

/** 28 WIB days of breakdown rows (computing missing / stale days) + daily totals → panel payload. */
export async function readStats14(db: D1DatabaseLike, today: string, now = Date.now()): Promise<Stats14> {
  await ensureSchema(db);
  const list = wibDayList(today, STATS14_DAYS * 2);
  const first = list[0];
  const doneRows = await all<{ day_wib: string; updated_at: number }>(
    db,
    `select day_wib, updated_at from analytics_breakdown_days where day_wib >= ?1 and day_wib <= ?2`,
    first,
    today,
  );
  const done = new Map(doneRows.map((r) => [String(r.day_wib), Number(r.updated_at) || 0]));
  for (const d of staleDays(list, today, done, now).slice(0, MAX_COMPUTE)) {
    try {
      await storeDay(db, d, await computeDay(db, d), now);
    } catch (err) {
      // One past day failing must not break the panel; it is retried on the next read.
      if (d >= today) throw err;
      console.error("[stats14] day failed", d, err);
    }
  }
  const [rows, sums] = await Promise.all([
    all<{ day_wib: string; kind: BreakdownRow["kind"]; k: string; views: number; uniq: number }>(
      db,
      `select day_wib, kind, k, views, uniq from analytics_daily_breakdown where day_wib >= ?1 and day_wib <= ?2`,
      first,
      today,
    ),
    all<{ day_wib: string; views: number; unique_visitors: number }>(
      db,
      `select day_wib, views, unique_visitors from analytics_daily_summary where day_wib >= ?1 and day_wib <= ?2`,
      first,
      today,
    ).catch(() => []),
  ]);
  const breakdown: BreakdownRow[] = rows.map((r) => ({
    day: String(r.day_wib),
    kind: r.kind,
    key: String(r.k),
    views: Number(r.views) || 0,
    uniq: Number(r.uniq) || 0,
  }));
  // Daily totals: the summary table (same numbers as "Riwayat 14 hari"); a day without a summary row
  // falls back to the breakdown's device rows (every pageview has exactly one device).
  const fromSummary = new Map<string, DayTotal>();
  for (const s of sums) {
    const day = String(s.day_wib);
    fromSummary.set(day, { day, views: Number(s.views) || 0, uniq: Number(s.unique_visitors) || 0 });
  }
  const fromDevices = new Map<string, DayTotal>();
  for (const r of breakdown) {
    if (r.kind !== "device") continue;
    const t = fromDevices.get(r.day) || { day: r.day, views: 0, uniq: 0 };
    t.views += r.views;
    t.uniq += r.uniq;
    fromDevices.set(r.day, t);
  }
  const totals = list
    .map((d) => fromSummary.get(d) || fromDevices.get(d))
    .filter((t): t is DayTotal => Boolean(t));
  return buildStats14(today, breakdown, totals, now);
}
