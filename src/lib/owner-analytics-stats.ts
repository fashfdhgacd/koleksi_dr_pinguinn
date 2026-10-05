/**
 * Owner analytics owner stats + alerts.
 */
import { dbSource, getSql } from "@/lib/db";
import {
  type DayRow,
  type DeviceKind,
  type OwnerStats,
  HISTORY_DAYS,
  dayKey,
  emptyHourly,
  emptyStats,
  lastDayKeys,
  mem,
  n,
  readDayStatsHistoryKv,
} from "@/lib/owner-analytics-shared";
import { countKvOnline, countMemoryOnline } from "@/lib/owner-analytics-presence";

/** WIB calendar day of a timestamptz column (no tz-name dependency). */
const WIB_DAY = `((created_at at time zone 'UTC') + interval '7 hours')::date`;
/** Start of WIB day $1 as timestamptz. */
const WIB_START = `((($1::date)::timestamp - interval '7 hours') at time zone 'UTC')`;
/** Today's WIB window ($1 = today's WIB date). */
const TODAY_WINDOW = `created_at >= ${WIB_START} and created_at < ${WIB_START} + interval '1 day'`;

/**
 * Single source of truth for the dashboard: one row per WIB day from Postgres
 * pageview events. Top cards (today / yesterday / 7 days) are derived from these
 * same rows so the table and the cards can never disagree.
 *
 * Peak = max(recorded concurrent peak from presence, distinct visitors with a
 * pageview inside the same 2-minute window). The second term is a lower bound
 * on real concurrency and also back-fills days recorded before peak tracking.
 */
async function readHistoryPg(
  sql: Awaited<ReturnType<typeof getSql>>,
  today: string,
  days = HISTORY_DAYS,
): Promise<DayRow[]> {
  const rows = await sql.query<{ day: string; views: number; uniq: number; peak: number; est: number }>(
    `with ev as (
       select ${WIB_DAY} as day_wib,
              count(*)::int as views,
              count(distinct visitor_id)::int as uniq
         from analytics_events
        where event_type = 'pageview'
          and created_at >= ((($1::date - ($2::int - 1))::timestamp - interval '7 hours') at time zone 'UTC')
        group by 1
     ), win as (
       select day_wib, max(c)::int as est from (
         select ${WIB_DAY} as day_wib,
                floor(extract(epoch from created_at) / 120) as b,
                count(distinct visitor_id) as c
           from analytics_events
          where event_type = 'pageview'
            and created_at >= ((($1::date - ($2::int - 1))::timestamp - interval '7 hours') at time zone 'UTC')
          group by 1, 2
       ) t group by 1
     )
     select to_char(ev.day_wib, 'YYYY-MM-DD') as day, ev.views, ev.uniq,
            coalesce(p.peak, 0)::int as peak, coalesce(win.est, 0)::int as est
       from ev
       left join win on win.day_wib = ev.day_wib
       left join analytics_daily_peak p on p.day_wib = ev.day_wib
     union all
     select to_char(p.day_wib, 'YYYY-MM-DD') as day, 0, 0, p.peak::int, 0
       from analytics_daily_peak p
      where p.day_wib >= $1::date - ($2::int - 1)
        and not exists (select 1 from ev where ev.day_wib = p.day_wib)`,
    [today, days],
  );
  const byDay = new Map<string, DayRow>();
  for (const r of rows) {
    byDay.set(String(r.day), {
      day: String(r.day),
      views: n(r.views),
      unique: n(r.uniq),
      peak: Math.max(n(r.peak), n(r.est)),
    });
  }
  return lastDayKeys(days, Date.parse(`${today}T12:00:00+07:00`)).map(
    (day) => byDay.get(day) || { day, views: 0, unique: 0, peak: 0 },
  );
}

/** Derive the top cards from the history rows (newest first). */
function cardsFromDays(days: DayRow[], online: number) {
  const today = days[0] || { day: dayKey(), views: 0, unique: 0, peak: 0 };
  // Live online count is a real concurrent sample — fold it into today's peak
  // so the table row and the "puncak" card match.
  const peakToday = Math.max(today.peak, online);
  const fixed = days.length ? [{ ...today, peak: peakToday }, ...days.slice(1)] : [];
  return {
    days: fixed,
    viewsToday: today.views,
    uniqueToday: today.unique,
    peakToday,
    yesterdayViews: days[1]?.views || 0,
    yesterdayUnique: days[1]?.unique || 0,
    views7d: days.slice(0, 7).reduce((s, d) => s + d.views, 0),
  };
}

export async function getOwnerStats(): Promise<OwnerStats> {
  const now = Date.now();
  const dk = dayKey(now);

  // Online: always try hybrid first so UI is never stuck at 0 when pings work
  const memN = countMemoryOnline(now);
  let kvN = 0;
  let dbOnline = 0;
  try {
    kvN = await countKvOnline(now);
  } catch {
    /* ignore */
  }

  try {
    const sql = await getSql();
    const [
      onlineRows,
      history,
      views24,
      views30d,
      hourlyRows,
      pathRows,
      refRows,
      deviceRows,
      hostRows,
    ] = await Promise.all([
      sql.query<{ n: number }>(
        `select count(*)::int as n from analytics_sessions where last_seen_at >= now() - interval '2 minutes'`,
      ),
      readHistoryPg(sql, dk),
      sql.query<{ n: number }>(
        `select count(*)::int as n from analytics_events where created_at >= now() - interval '24 hours' and event_type = 'pageview'`,
      ),
      sql.query<{ n: number }>(
        `select count(*)::int as n from analytics_events where created_at >= now() - interval '30 days' and event_type = 'pageview'`,
      ),
      sql.query<{ hour_utc: string | Date; page_views: number }>(
        `select hour_utc, page_views from analytics_hourly
         where hour_utc >= now() - interval '24 hours'`,
      ),
      sql.query<{ path: string; views: number }>(
        `select path, count(*)::int as views from analytics_events
         where ${TODAY_WINDOW} and event_type = 'pageview'
         group by path order by views desc limit 15`,
        [dk],
      ),
      sql.query<{ ref: string; views: number }>(
        `select coalesce(referrer,'(direct)') as ref, count(*)::int as views from analytics_events
         where ${TODAY_WINDOW} and event_type = 'pageview'
         group by 1 order by views desc limit 12`,
        [dk],
      ),
      sql.query<{ device: DeviceKind; views: number }>(
        `select coalesce(device_type,'other') as device, count(*)::int as views from analytics_events
         where ${TODAY_WINDOW} and event_type = 'pageview'
         group by 1`,
        [dk],
      ),
      sql.query<{ host: string; views: number }>(
        `select coalesce(host,'(unknown)') as host, count(*)::int as views from analytics_events
         where ${TODAY_WINDOW} and event_type = 'pageview'
         group by 1 order by views desc limit 6`,
        [dk],
      ),
    ]);

    dbOnline = n(onlineRows[0]?.n);
    const online = Math.max(memN, kvN, dbOnline);
    const cards = cardsFromDays(history, online);

    const hourMap = new Map<string, number>();
    for (const row of hourlyRows) {
      const t = new Date(row.hour_utc).getTime();
      const label = new Date(t + 7 * 3600_000).toISOString().slice(11, 13);
      hourMap.set(label, n(row.page_views));
    }
    const hourly = emptyHourly(now).map((slot) => ({
      hour: slot.hour,
      views: hourMap.get(slot.hour) || 0,
    }));

    const persistOk = dbSource === "neon";
    const presence: OwnerStats["presence"] =
      dbOnline > 0 && (memN > 0 || kvN > 0)
        ? "hybrid"
        : dbOnline > 0
          ? "postgres"
          : kvN > 0
            ? "kv"
            : "memory";

    return emptyStats({
      online,
      count: online,
      ...cards,
      peakDay: dk,
      views24h: n(views24[0]?.n),
      views30d: n(views30d[0]?.n),
      historySource: "postgres",
      hourly,
      topPaths: pathRows.map((r) => ({ path: r.path || "/", views: n(r.views) })),
      topRefs: refRows.map((r) => ({ ref: r.ref || "(direct)", views: n(r.views) })),
      devices: deviceRows.map((r) => ({ device: r.device || "other", views: n(r.views) })),
      hosts: hostRows.map((r) => ({ host: r.host || "(unknown)", views: n(r.views) })),
      storage: dbSource === "neon" ? "postgres" : "pglite",
      persistOk,
      database: "connected",
      analytics: "operational",
      presence,
      hint: persistOk
        ? undefined
        : "DATABASE_URL belum di-set. Online pakai memory/KV; isi Neon URL agar history tahan redeploy.",
    });
  } catch (err) {
    console.error("[analytics] getOwnerStats failed", err);
    const online = Math.max(memN, kvN);
    let history: DayRow[] = [];
    try {
      history = await readDayStatsHistoryKv(HISTORY_DAYS, now);
    } catch {
      /* ignore */
    }
    const cards = cardsFromDays(history, online);
    const anyKv = history.some((d) => d.views > 0);
    return emptyStats({
      online,
      count: online,
      ...cards,
      views24h: cards.viewsToday,
      historySource: anyKv ? "kv" : "none",
      storage: kvN > 0 || anyKv ? "kv" : "memory",
      persistOk: anyKv,
      database: "error",
      analytics: online > 0 || anyKv ? "operational" : "unavailable",
      presence: kvN > 0 ? "kv" : "memory",
      hint: anyKv
        ? "DB offline — Unik/Tayang/riwayat dari KV (sementara)."
        : online > 0
          ? "DB offline — angka online dari memory/KV."
          : "Database tidak tersedia dan belum ada heartbeat. Buka katalog di tab lain (setelah age gate) lalu Refresh.",
    });
  }
}

export async function pruneAnalytics(rawDays = 60): Promise<void> {
  try {
    const sql = await getSql();
    await sql.query(`delete from analytics_events where created_at < now() - ($1 || ' days')::interval`, [
      String(rawDays),
    ]);
    await sql.query(`delete from analytics_sessions where last_seen_at < now() - interval '2 days'`);
  } catch (err) {
    console.error("[analytics] prune failed", err);
  }
}

export async function maybeTelegramAlert(online: number): Promise<void> {
  const threshold = Number(process.env.ONLINE_ALERT_THRESHOLD || "0");
  if (!threshold || online < threshold) return;
  const token = (process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chat =
    process.env.ONLINE_ALERT_CHAT_ID ||
    process.env.TELEGRAM_USER_ID ||
    process.env.TELEGRAM_ADMIN_ID ||
    "";
  if (!token || !chat) return;
  const s = mem();
  const now = Date.now();
  if (now - s.lastTelegramAlertAt < 30 * 60_000 && online <= s.lastTelegramPeak) return;
  s.lastTelegramAlertAt = now;
  s.lastTelegramPeak = online;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: `🟢 Dr. Pinguin online: *${online}* (threshold ${threshold})`,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* silent */
  }
}
