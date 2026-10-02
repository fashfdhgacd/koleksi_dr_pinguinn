/**
 * Owner analytics owner stats + alerts.
 */
import { dbSource, getSql } from "@/lib/db";
import { resolveAnalyticsKV } from "@/lib/analytics-kv";
import {
  type DeviceKind,
  type OwnerStats,
  bumpPeakKv,
  dayKey,
  emptyHourly,
  emptyStats,
  mem,
  n,
  readDayStatsKv,
} from "@/lib/owner-analytics-shared";
import { countKvOnline, countMemoryOnline } from "@/lib/owner-analytics-presence";

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
      peakRows,
      views24,
      viewsToday,
      uniqueToday,
      views7d,
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
      sql.query<{ peak: number }>(`select peak from analytics_daily_peak where day_wib = $1::date`, [dk]),
      sql.query<{ n: number }>(
        `select count(*)::int as n from analytics_events where created_at >= now() - interval '24 hours' and event_type = 'pageview'`,
      ),
      sql.query<{ n: number }>(
        `select count(*)::int as n from analytics_events
         where created_at >= ($1::date)::timestamp - interval '7 hours'
           and created_at < ($1::date)::timestamp - interval '7 hours' + interval '1 day'
           and event_type = 'pageview'`,
        [dk],
      ),
      sql.query<{ n: number }>(
        `select count(distinct visitor_id)::int as n from analytics_events
         where created_at >= ($1::date)::timestamp - interval '7 hours'
           and created_at < ($1::date)::timestamp - interval '7 hours' + interval '1 day'
           and event_type = 'pageview'`,
        [dk],
      ),
      sql.query<{ n: number }>(
        `select count(*)::int as n from analytics_events where created_at >= now() - interval '7 days' and event_type = 'pageview'`,
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
         where created_at >= now() - interval '24 hours' and event_type = 'pageview'
         group by path order by views desc limit 15`,
      ),
      sql.query<{ ref: string; views: number }>(
        `select coalesce(referrer,'(direct)') as ref, count(*)::int as views from analytics_events
         where created_at >= now() - interval '24 hours' and event_type = 'pageview'
         group by 1 order by views desc limit 12`,
      ),
      sql.query<{ device: DeviceKind; views: number }>(
        `select coalesce(device_type,'other') as device, count(*)::int as views from analytics_events
         where created_at >= now() - interval '24 hours' and event_type = 'pageview'
         group by 1`,
      ),
      sql.query<{ host: string; views: number }>(
        `select coalesce(host,'(unknown)') as host, count(*)::int as views from analytics_events
         where created_at >= now() - interval '24 hours' and event_type = 'pageview'
         group by 1 order by views desc limit 6`,
      ),
    ]);

    dbOnline = n(onlineRows[0]?.n);
    const online = Math.max(memN, kvN, dbOnline);

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
      peakToday: Math.max(n(peakRows[0]?.peak), online),
      peakDay: dk,
      views24h: n(views24[0]?.n),
      viewsToday: n(viewsToday[0]?.n),
      uniqueToday: n(uniqueToday[0]?.n),
      views7d: n(views7d[0]?.n),
      views30d: n(views30d[0]?.n),
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
    void bumpPeakKv(online);
    let kvStats = { views: 0, unique: 0, peak: 0 };
    try {
      kvStats = await readDayStatsKv(dayKey());
    } catch {
      /* ignore */
    }
    const peakToday = Math.max(kvStats.peak, online);
    return emptyStats({
      online,
      count: online,
      peakToday,
      viewsToday: kvStats.views,
      uniqueToday: kvStats.unique,
      views24h: kvStats.views,
      storage: kvN > 0 || kvStats.views > 0 ? "kv" : "memory",
      persistOk: kvStats.views > 0,
      database: "error",
      analytics: online > 0 || kvStats.views > 0 ? "operational" : "unavailable",
      presence: kvN > 0 ? "kv" : "memory",
      hint:
        kvStats.views > 0
          ? "DB offline — Unik/Tayang dari KV (sementara)."
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
