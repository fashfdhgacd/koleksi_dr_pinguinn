/**
 * Cloudflare D1 (SQLite) analytics backend — binding `ANALYTICS_DB`.
 *
 * Selection order used by owner-analytics: D1 (when bound) → Postgres (when
 * DATABASE_URL is set) → KV/memory fallback. All timestamps are INTEGER epoch
 * ms; WIB (UTC+7) calendar days are computed with
 * `date((created_at/1000)+25200,'unixepoch')`.
 */

/** Minimal D1 surface (avoids a dependency on @cloudflare/workers-types). */
export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<unknown[]>;
}

const BINDING = "ANALYTICS_DB";
const WIB_DAY = `date((created_at/1000)+25200,'unixepoch')`;
const DAY_MS = 86_400_000;
/** Max rows for "Video terpopuler hari ini". */
export const TOP_VIDEOS_LIMIT = 20;

function pickD1(obj: unknown): D1DatabaseLike | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const nested = (o.env as Record<string, unknown> | undefined) || {};
  const cand = o[BINDING] || nested[BINDING];
  if (
    cand &&
    typeof cand === "object" &&
    typeof (cand as D1DatabaseLike).prepare === "function" &&
    typeof (cand as D1DatabaseLike).batch === "function"
  ) {
    return cand as D1DatabaseLike;
  }
  return null;
}

async function fromCloudflareWorkersModule(): Promise<D1DatabaseLike | null> {
  try {
    const mod = (await import("cloudflare:workers")) as { env?: Record<string, unknown> };
    return pickD1(mod.env);
  } catch {
    return null;
  }
}

async function fromRequestEvent(): Promise<D1DatabaseLike | null> {
  try {
    const mod = await import("@tanstack/react-start/server");
    const getEvent =
      (mod as { getRequestEvent?: () => unknown }).getRequestEvent ||
      (mod as { getEvent?: () => unknown }).getEvent;
    if (typeof getEvent !== "function") return null;
    const event = getEvent() as {
      context?: Record<string, unknown>;
      nativeEvent?: { context?: Record<string, unknown> };
    } | null;
    if (!event) return null;
    const ctx = event.context || {};
    const native = event.nativeEvent?.context || {};
    return (
      pickD1(ctx.cloudflare) ||
      pickD1(ctx.env) ||
      pickD1(ctx) ||
      pickD1(native.cloudflare) ||
      pickD1(native.env)
    );
  } catch {
    return null;
  }
}

function fromGlobal(): D1DatabaseLike | null {
  const g = globalThis as unknown as Record<string, unknown>;
  return pickD1(g) || pickD1(g.env) || pickD1(g.__env__);
}

/** The ANALYTICS_DB binding, or null when not bound (same lookup as ANALYTICS_KV). */
export async function getD1(): Promise<D1DatabaseLike | null> {
  if (typeof window !== "undefined") return null;
  return fromGlobal() || (await fromCloudflareWorkersModule()) || (await fromRequestEvent());
}

const SCHEMA = [
  `create table if not exists analytics_events (
     id text primary key,
     event_type text not null default 'pageview',
     visitor_id text,
     session_id text,
     page text,
     path text,
     referrer text,
     user_agent text,
     device_type text,
     browser text,
     host text,
     created_at integer not null
   )`,
  `create index if not exists analytics_events_created_at_idx on analytics_events (created_at)`,
  `create table if not exists analytics_sessions (
     session_id text primary key,
     visitor_id text,
     last_seen_at integer not null
   )`,
  `create index if not exists analytics_sessions_last_seen_idx on analytics_sessions (last_seen_at)`,
  `create table if not exists analytics_hourly (
     hour_utc text primary key,
     page_views integer not null default 0,
     unique_visitors integer not null default 0,
     sessions integer not null default 0
   )`,
  `create table if not exists analytics_daily_peak (
     day_wib text primary key,
     peak integer not null default 0,
     updated_at integer not null
   )`,
];

const g = globalThis as typeof globalThis & { __d1SchemaPromise__?: Promise<void> };

/** CREATE TABLE IF NOT EXISTS for all analytics tables — once per isolate. */
export function ensureD1Schema(db: D1DatabaseLike): Promise<void> {
  g.__d1SchemaPromise__ ??= db
    .batch(SCHEMA.map((s) => db.prepare(s)))
    // Older tables lack the country column; SQLite has no "add column if not exists",
    // so the duplicate-column error on already-migrated tables is ignored.
    .then(() =>
      db
        .prepare(`alter table analytics_events add column country text`)
        .all()
        .catch(() => undefined),
    )
    .then(() => undefined)
    .catch((err) => {
      g.__d1SchemaPromise__ = undefined;
      throw err;
    });
  return g.__d1SchemaPromise__;
}

/** Tag an error as coming from D1 (so diagnostics don't blame DATABASE_URL). */
export function markD1Error(err: unknown): unknown {
  if (err && typeof err === "object") (err as { __d1?: boolean }).__d1 = true;
  else err = Object.assign(new Error(String(err)), { __d1: true });
  return err;
}

/** Schema-ready D1 handle, or null when unbound. Errors are tagged via markD1Error. */
export async function readyD1(): Promise<D1DatabaseLike | null> {
  const db = await getD1();
  if (!db) return null;
  try {
    await ensureD1Schema(db);
  } catch (err) {
    throw markD1Error(err);
  }
  return db;
}

async function all<T>(db: D1DatabaseLike, sql: string, ...params: unknown[]): Promise<T[]> {
  const st = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql);
  const res = await st.all<T>();
  return res.results || [];
}

async function count(db: D1DatabaseLike, sql: string, ...params: unknown[]): Promise<number> {
  const st = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql);
  const row = await st.first<{ n: number }>();
  return Number(row?.n || 0);
}

/** Start of a WIB calendar day ('YYYY-MM-DD') as epoch ms. */
export function wibDayStartMs(day: string): number {
  return Date.parse(`${day}T00:00:00+07:00`);
}

export function d1CountOnline(
  db: D1DatabaseLike,
  now = Date.now(),
  windowMs = 120_000,
): Promise<number> {
  return count(
    db,
    `select count(*) as n from analytics_sessions where last_seen_at >= ?`,
    now - windowMs,
  );
}

/** Upsert session, return D1 online count (last 2 min). */
export async function d1TouchSession(
  db: D1DatabaseLike,
  sid: string,
  now = Date.now(),
): Promise<number> {
  await db
    .prepare(
      `insert into analytics_sessions (session_id, visitor_id, last_seen_at)
       values (?1, ?2, ?3)
       on conflict (session_id) do update set last_seen_at = excluded.last_seen_at`,
    )
    .bind(sid, sid, now)
    .run();
  return d1CountOnline(db, now);
}

export async function d1BumpPeak(
  db: D1DatabaseLike,
  day: string,
  peak: number,
  now = Date.now(),
): Promise<void> {
  await db
    .prepare(
      `insert into analytics_daily_peak (day_wib, peak, updated_at)
       values (?1, ?2, ?3)
       on conflict (day_wib) do update
       set peak = max(analytics_daily_peak.peak, excluded.peak),
           updated_at = excluded.updated_at
       where excluded.peak > analytics_daily_peak.peak`,
    )
    .bind(day, peak, now)
    .run();
}

/** Today's (WIB `day`) pageviews, distinct visitors and recorded peak — for the KV daystats mirror. */
export async function d1TodayTotals(
  db: D1DatabaseLike,
  day: string,
): Promise<{ views: number; unique: number; peak: number }> {
  const t0 = wibDayStartMs(day);
  const [ev, pk] = await Promise.all([
    db
      .prepare(
        `select count(*) as views, count(distinct visitor_id) as uniq from analytics_events
          where created_at >= ?1 and created_at < ?2 and event_type = 'pageview'`,
      )
      .bind(t0, t0 + DAY_MS)
      .first<{ views: number; uniq: number }>(),
    db
      .prepare(`select peak from analytics_daily_peak where day_wib = ?1`)
      .bind(day)
      .first<{ peak: number }>(),
  ]);
  return {
    views: Math.max(0, Number(ev?.views) || 0),
    unique: Math.max(0, Number(ev?.uniq) || 0),
    peak: Math.max(0, Number(pk?.peak) || 0),
  };
}

export async function d1RecordHit(
  db: D1DatabaseLike,
  e: {
    id: string;
    eventType: string;
    visitorId: string | null;
    sessionId: string | null;
    path: string;
    ref: string;
    ua: string;
    device: string;
    browser: string;
    country?: string;
    host: string;
    now: number;
    hourUtc: string;
  },
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `insert into analytics_events
          (id, event_type, visitor_id, session_id, page, path, referrer, user_agent, device_type, browser, host, created_at, country)
         values (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
         on conflict (id) do nothing`,
      )
      .bind(
        e.id,
        e.eventType,
        e.visitorId,
        e.sessionId,
        e.path,
        e.path,
        e.ref,
        e.ua,
        e.device,
        e.browser,
        e.host,
        e.now,
        e.country || null,
      ),
    db
      .prepare(
        `insert into analytics_hourly (hour_utc, page_views, unique_visitors, sessions)
         values (?1, 1, 0, 0)
         on conflict (hour_utc) do update
         set page_views = analytics_hourly.page_views + 1`,
      )
      .bind(e.hourUtc),
  ]);
}

/**
 * Per-WIB-day rows (same semantics as the Postgres CTE): views, distinct
 * visitors, recorded peak, and max distinct visitors per 2-minute bucket.
 */
export function d1HistoryRows(
  db: D1DatabaseLike,
  today: string,
  days: number,
): Promise<{ day: string; views: number; uniq: number; peak: number; est: number }[]> {
  const startDay = new Date(wibDayStartMs(today) - (days - 1) * DAY_MS + 7 * 3600_000)
    .toISOString()
    .slice(0, 10);
  const startMs = wibDayStartMs(startDay);
  return all(
    db,
    `with ev as (
       select ${WIB_DAY} as d, count(*) as views, count(distinct visitor_id) as uniq
         from analytics_events
        where event_type = 'pageview' and created_at >= ?1
        group by 1
     ), win as (
       select d, max(c) as est from (
         select ${WIB_DAY} as d, created_at / 120000 as b, count(distinct visitor_id) as c
           from analytics_events
          where event_type = 'pageview' and created_at >= ?1
          group by 1, 2
       ) group by d
     )
     select ev.d as day, ev.views as views, ev.uniq as uniq,
            coalesce(p.peak, 0) as peak, coalesce(win.est, 0) as est
       from ev
       left join win on win.d = ev.d
       left join analytics_daily_peak p on p.day_wib = ev.d
     union all
     select p.day_wib as day, 0, 0, p.peak, 0
       from analytics_daily_peak p
      where p.day_wib >= ?2
        and not exists (select 1 from ev where ev.d = p.day_wib)`,
    startMs,
    startDay,
  );
}

/** Dashboard aggregates for the owner stats (shapes match the Postgres path). */
export async function d1StatsParts(db: D1DatabaseLike, today: string, now = Date.now()) {
  const t0 = wibDayStartMs(today);
  const t1 = t0 + DAY_MS;
  const TODAY = `created_at >= ?1 and created_at < ?2 and event_type = 'pageview'`;
  const [online, views24, views30d, hourlyRows, pathRows, refRows, deviceRows, hostRows, videoRows] =
    await Promise.all([
      d1CountOnline(db, now),
      count(
        db,
        `select count(*) as n from analytics_events where created_at >= ? and event_type = 'pageview'`,
        now - DAY_MS,
      ),
      count(
        db,
        `select count(*) as n from analytics_events where created_at >= ? and event_type = 'pageview'`,
        now - 30 * DAY_MS,
      ),
      all<{ hour_utc: string; page_views: number }>(
        db,
        `select hour_utc, page_views from analytics_hourly where hour_utc >= ?`,
        new Date(now - DAY_MS).toISOString(),
      ),
      all<{ path: string; views: number }>(
        db,
        `select path, count(*) as views from analytics_events where ${TODAY}
         group by path order by views desc limit 15`,
        t0,
        t1,
      ),
      all<{ ref: string; views: number }>(
        db,
        `select coalesce(referrer,'(direct)') as ref, count(*) as views from analytics_events where ${TODAY}
         group by 1 order by views desc limit 12`,
        t0,
        t1,
      ),
      all<{ device: string; views: number }>(
        db,
        `select coalesce(device_type,'other') as device, count(*) as views from analytics_events where ${TODAY}
         group by 1`,
        t0,
        t1,
      ),
      all<{ host: string; views: number }>(
        db,
        `select coalesce(host,'(unknown)') as host, count(*) as views from analytics_events where ${TODAY}
         group by 1 order by views desc limit 6`,
        t0,
        t1,
      ),
      // Video pages only (/watch/<id>) — separate from the mixed "Halaman" list.
      all<{ path: string; views: number; uniq: number }>(
        db,
        `select path, count(*) as views, count(distinct visitor_id) as uniq from analytics_events
          where ${TODAY} and path like '/watch/%'
          group by path order by views desc, uniq desc limit ?3`,
        t0,
        t1,
        TOP_VIDEOS_LIMIT,
      ),
    ]);
  // Browser/country lists are optional extras: a failure here must not break the stats.
  const [browserRows, countryRows] = await Promise.all([
    all<{ browser: string; views: number }>(
      db,
      `select coalesce(browser,'other') as browser, count(*) as views from analytics_events where ${TODAY}
       group by 1 order by views desc limit 8`,
      t0,
      t1,
    ).catch(() => []),
    all<{ country: string; views: number }>(
      db,
      `select coalesce(country,'') as country, count(*) as views from analytics_events where ${TODAY}
       group by 1 order by views desc limit 8`,
      t0,
      t1,
    ).catch(() => []),
  ]);
  return {
    online,
    views24,
    views30d,
    hourlyRows,
    pathRows,
    refRows,
    deviceRows,
    hostRows,
    videoRows,
    browserRows,
    countryRows,
  };
}

/** Events older than 90 days, sessions older than 2 days. */
export async function d1Prune(db: D1DatabaseLike, now = Date.now(), eventDays = 90): Promise<void> {
  await db.batch([
    db.prepare(`delete from analytics_events where created_at < ?`).bind(now - eventDays * DAY_MS),
    db.prepare(`delete from analytics_sessions where last_seen_at < ?`).bind(now - 2 * DAY_MS),
  ]);
}

/**
 * Pageviews per video id (/watch/<id>) for the last `days` days. ONE aggregate query; callers must
 * cache the result (ranking-list.ts keeps it in KV + isolate memory for ~1 h).
 */
export async function d1TopVideos(
  db: D1DatabaseLike,
  days: number,
  limit = 1000,
  now = Date.now(),
): Promise<Record<string, number>> {
  const rows = await all<{ path: string; n: number }>(
    db,
    `select path, count(*) as n from analytics_events
      where event_type = 'pageview' and created_at >= ? and path like '/watch/%'
      group by path order by n desc limit ?`,
    now - days * DAY_MS,
    limit,
  );
  const out: Record<string, number> = {};
  for (const r of rows) {
    let id = String(r.path || "").slice("/watch/".length).split(/[?#/]/)[0] || "";
    try {
      id = decodeURIComponent(id);
    } catch {
      /* keep raw id */
    }
    const n = Math.floor(Number(r.n) || 0);
    if (id && n > 0) out[id] = (out[id] || 0) + n;
  }
  return out;
}

export async function d1Ping(db: D1DatabaseLike): Promise<void> {
  await db.prepare("select 1 as ok").first();
}
