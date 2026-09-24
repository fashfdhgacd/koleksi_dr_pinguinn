/**
 * Owner analytics — online counter uses hybrid presence:
 *   1) in-memory Map (warm isolate)
 *   2) Cloudflare KV (shared across isolates) when bound
 *   3) Postgres sessions table when DATABASE_URL works
 * Postgres remains source of truth for historical pageviews.
 */

import { dbSource, getSql } from "@/lib/db";
import { resolveAnalyticsKV } from "@/lib/analytics-kv";

export type DeviceKind = "mobile" | "desktop" | "tablet" | "bot" | "other";

export type PageHit = {
  path: string;
  ref: string;
  device: DeviceKind;
  host: string;
  ts: number;
};

export type OwnerStats = {
  online: number;
  count: number;
  peakToday: number;
  peakDay: string;
  views24h: number;
  viewsToday: number;
  uniqueToday: number;
  views7d: number;
  views30d: number;
  hourly: { hour: string; views: number }[];
  topPaths: { path: string; views: number }[];
  topRefs: { ref: string; views: number }[];
  devices: { device: DeviceKind; views: number }[];
  hosts: { host: string; views: number }[];
  storage: "postgres" | "pglite" | "kv" | "kv-rest" | "memory" | "error";
  persistOk: boolean;
  database: "connected" | "error";
  analytics: "operational" | "unavailable";
  updatedAt: string;
  presence?: "memory" | "kv" | "postgres" | "hybrid";
  hint?: string;
};

/** Active window — UI says ±2 menit */
const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const ONLINE_KV_PREFIX = "online:";
const ONLINE_KV_TTL_SEC = 180; // 3 min TTL on KV keys

type MemState = {
  lastTelegramAlertAt: number;
  lastTelegramPeak: number;
  /** sessionId → lastSeen ms */
  presence: Map<string, number>;
};

declare global {
  // eslint-disable-next-line no-var
  var __drPinguinAnalyticsMem: MemState | undefined;
}

function mem(): MemState {
  if (!globalThis.__drPinguinAnalyticsMem) {
    globalThis.__drPinguinAnalyticsMem = {
      lastTelegramAlertAt: 0,
      lastTelegramPeak: 0,
      presence: new Map(),
    };
  }
  if (!globalThis.__drPinguinAnalyticsMem.presence) {
    globalThis.__drPinguinAnalyticsMem.presence = new Map();
  }
  return globalThis.__drPinguinAnalyticsMem;
}

function dayKey(ts = Date.now()): string {
  return new Date(ts + 7 * 3600_000).toISOString().slice(0, 10);
}

function hourUtcBucket(ts = Date.now()): Date {
  const d = new Date(ts);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

export function classifyDevice(ua: string): DeviceKind {
  const u = ua.toLowerCase();
  if (!u) return "other";
  if (/bot|crawl|spider|slurp|facebookexternalhit|preview/i.test(u)) return "bot";
  if (/ipad|tablet|kindle|playbook/i.test(u)) return "tablet";
  if (/mobi|android|iphone|ipod|phone/i.test(u)) return "mobile";
  if (/windows|macintosh|linux|cros/i.test(u)) return "desktop";
  return "other";
}

function classifyBrowser(ua: string): string {
  const u = ua.toLowerCase();
  if (/edg\//.test(u)) return "edge";
  if (/chrome|crios/.test(u)) return "chrome";
  if (/safari/.test(u) && !/chrome|crios/.test(u)) return "safari";
  if (/firefox|fxios/.test(u)) return "firefox";
  if (/opr\//.test(u)) return "opera";
  return "other";
}

function normalizePath(path: string): string {
  let p = (path || "/").trim().slice(0, 200);
  if (!p.startsWith("/")) p = "/" + p;
  const q = p.indexOf("?");
  if (q >= 0) p = p.slice(0, q);
  return p || "/";
}

function normalizeRef(ref: string): string {
  const r = (ref || "").trim().slice(0, 200);
  if (!r) return "(direct)";
  try {
    return new URL(r).hostname.replace(/^www\./, "");
  } catch {
    return r.slice(0, 80) || "(direct)";
  }
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

function emptyHourly(now = Date.now()): { hour: string; views: number }[] {
  const hourly: { hour: string; views: number }[] = [];
  for (let i = 23; i >= 0; i--) {
    const t = now - i * 3600_000;
    const label = new Date(t + 7 * 3600_000).toISOString().slice(11, 13);
    hourly.push({ hour: label, views: 0 });
  }
  return hourly;
}

function emptyStats(partial: Partial<OwnerStats> = {}): OwnerStats {
  const dk = dayKey();
  return {
    online: 0,
    count: 0,
    peakToday: 0,
    peakDay: dk,
    views24h: 0,
    viewsToday: 0,
    uniqueToday: 0,
    views7d: 0,
    views30d: 0,
    hourly: emptyHourly(),
    topPaths: [],
    topRefs: [],
    devices: [],
    hosts: [],
    storage: dbSource === "neon" ? "postgres" : "pglite",
    persistOk: dbSource === "neon",
    database: "connected",
    analytics: "operational",
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

async function optionalKvPut(key: string, value: string, ttl?: number): Promise<void> {
  try {
    const handle = await resolveAnalyticsKV();
    if (!handle?.kv) return;
    await handle.kv.put(key, value, ttl ? { expirationTtl: ttl } : undefined);
  } catch {
    /* KV is optional */
  }
}

export async function getKV() {
  try {
    const handle = await resolveAnalyticsKV();
    return handle?.kv || null;
  } catch {
    return null;
  }
}

/** Prune expired entries from in-memory presence map; return active count. */
function countMemoryOnline(now = Date.now()): number {
  const m = mem().presence;
  let n = 0;
  for (const [id, ts] of m) {
    if (now - ts > ONLINE_WINDOW_MS) m.delete(id);
    else n += 1;
  }
  return n;
}

function touchMemory(id: string, now = Date.now()): number {
  mem().presence.set(id, now);
  return countMemoryOnline(now);
}

/** List active online:* keys from KV (shared across Workers isolates). */
async function countKvOnline(now = Date.now()): Promise<number> {
  try {
    const kv = await getKV();
    if (!kv) return 0;
    let cursor: string | undefined;
    let total = 0;
    for (let page = 0; page < 10; page++) {
      const listed = await kv.list({
        prefix: ONLINE_KV_PREFIX,
        limit: 1000,
        cursor,
      });
      for (const k of listed.keys) {
        // Prefer TTL on keys; also verify value timestamp if present
        const raw = await kv.get(k.name);
        if (!raw) continue;
        const ts = Number(raw);
        if (Number.isFinite(ts) && now - ts > ONLINE_WINDOW_MS) continue;
        total += 1;
      }
      if (listed.list_complete) break;
      cursor = listed.cursor;
      if (!cursor) break;
    }
    return total;
  } catch {
    return 0;
  }
}

async function countDbOnline(): Promise<number> {
  try {
    const sql = await getSql();
    const rows = await sql.query<{ n: number }>(
      `select count(*)::int as n from analytics_sessions
       where last_seen_at >= now() - interval '2 minutes'`,
    );
    return Number(rows[0]?.n || 0);
  } catch {
    return 0;
  }
}

/** Best available online count across layers. */
export async function countOnline(): Promise<number> {
  const memN = countMemoryOnline();
  const [kvN, dbN] = await Promise.all([countKvOnline(), countDbOnline()]);
  return Math.max(memN, kvN, dbN);
}

export async function analyticsHealth(): Promise<{
  database: "connected" | "error";
  analytics: "operational" | "unavailable";
  storage: OwnerStats["storage"];
  timestamp: string;
}> {
  try {
    const sql = await getSql();
    await sql.query("select 1 as ok");
    return {
      database: "connected",
      analytics: "operational",
      storage: dbSource === "neon" ? "postgres" : "pglite",
      timestamp: new Date().toISOString(),
    };
  } catch {
    return {
      database: "error",
      analytics: "unavailable",
      storage: "error",
      timestamp: new Date().toISOString(),
    };
  }
}

export async function touchOnline(id: string): Promise<number> {
  const sid = safeId(id);
  if (!sid) return 0;
  const now = Date.now();

  // 1) Always update memory (works even if DB/KV down)
  touchMemory(sid, now);

  // 2) KV write-through (shared)
  void optionalKvPut(`${ONLINE_KV_PREFIX}${sid}`, String(now), ONLINE_KV_TTL_SEC);

  // 3) Postgres when available
  try {
    const sql = await getSql();
    await sql.query(
      `insert into analytics_sessions (session_id, visitor_id, last_seen_at)
       values ($1, $2, now())
       on conflict (session_id) do update set last_seen_at = now()`,
      [sid, sid],
    );
    const rows = await sql.query<{ n: number }>(
      `select count(*)::int as n from analytics_sessions
       where last_seen_at >= now() - interval '2 minutes'`,
    );
    const dbCount = Number(rows[0]?.n || 0);
    const dk = dayKey(now);
    const best = Math.max(dbCount, countMemoryOnline(now));
    await sql.query(
      `insert into analytics_daily_peak (day_wib, peak, updated_at)
       values ($1::date, $2, now())
       on conflict (day_wib) do update
       set peak = greatest(analytics_daily_peak.peak, excluded.peak),
           updated_at = now()`,
      [dk, best],
    );
    return Math.max(best, await countKvOnline(now));
  } catch (err) {
    console.error("[analytics] touchOnline db failed — using memory/KV", err);
    return Math.max(countMemoryOnline(now), await countKvOnline(now));
  }
}

export async function recordHit(input: {
  path: string;
  ref?: string;
  ua?: string;
  host?: string;
  visitorId?: string;
  sessionId?: string;
  eventId?: string;
  eventType?: string;
}): Promise<void> {
  const now = Date.now();
  const path = normalizePath(input.path);
  const ref = normalizeRef(input.ref || "");
  const device = classifyDevice(input.ua || "");
  const browser = classifyBrowser(input.ua || "");
  const host = (input.host || "").replace(/^www\./, "").slice(0, 80) || "(unknown)";
  const sessionId = safeId(input.sessionId || input.visitorId || "");
  const visitorId = safeId(input.visitorId || sessionId);
  const eventId =
    safeId(input.eventId || "") ||
    `${now.toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const eventType = (input.eventType || "pageview").slice(0, 32);

  // Keep presence warm on pageview too
  if (sessionId) {
    touchMemory(sessionId, now);
    void optionalKvPut(`${ONLINE_KV_PREFIX}${sessionId}`, String(now), ONLINE_KV_TTL_SEC);
  }

  try {
    const sql = await getSql();
    await sql.query(
      `insert into analytics_events
        (id, event_type, visitor_id, session_id, page, path, referrer, user_agent, device_type, browser, host, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       on conflict (id) do nothing`,
      [
        eventId,
        eventType,
        visitorId || null,
        sessionId || null,
        path,
        path,
        ref,
        (input.ua || "").slice(0, 300),
        device,
        browser,
        host,
      ],
    );
    const bucket = hourUtcBucket(now);
    await sql.query(
      `insert into analytics_hourly (hour_utc, page_views, unique_visitors, sessions)
       values ($1, 1, 0, 0)
       on conflict (hour_utc) do update
       set page_views = analytics_hourly.page_views + 1`,
      [bucket.toISOString()],
    );
    void optionalKvPut(
      `hit:${now}:${eventId.slice(0, 8)}`,
      JSON.stringify({ path, ref, device, host, ts: now }),
      86400,
    );
  } catch (err) {
    console.error("[analytics] recordHit failed", err);
  }
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
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
    return emptyStats({
      online,
      count: online,
      storage: kvN > 0 ? "kv" : "memory",
      persistOk: false,
      database: "error",
      analytics: online > 0 ? "operational" : "unavailable",
      presence: kvN > 0 ? "kv" : "memory",
      hint:
        online > 0
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
