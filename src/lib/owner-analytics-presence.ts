/**
 * Owner analytics presence + hit recording.
 *
 * KV write budget: with D1 (ANALYTICS_DB) ready, D1 is the only per-request store. The KV daystats
 * fallback (daystats:<day>) is refreshed from D1 at most once per DAYSTATS_MIRROR_MS (shared through
 * the `at` field in the KV value), instead of 1–2 KV writes per pageview (daystats + uv marker) and a
 * KV read per heartbeat. Without D1, or when a D1 call fails, the old per-hit KV path is used.
 */
import { getDbSource, getSql } from "@/lib/db";
import { resolveAnalyticsKV } from "@/lib/analytics-kv";
import {
  d1BumpPeak,
  d1CountOnline,
  d1Ping,
  d1RecordHit,
  d1TodayTotals,
  d1TouchSession,
  getD1,
  readyD1,
  type D1DatabaseLike,
} from "@/lib/analytics-d1";
import { kvCountOnline } from "@/lib/kv-live";
import {
  ONLINE_KV_PREFIX,
  ONLINE_KV_TTL_SEC,
  ONLINE_WINDOW_MS,
  type OwnerStats,
  bumpPeakKv,
  classifyBrowser,
  classifyDevice,
  normalizeCountry,
  dayKey,
  hourUtcBucket,
  mem,
  normalizePath,
  normalizeRef,
  optionalKvPut,
  readDayStatsKv,
  recordHitKv,
  safeId,
  writeDayStatsKv,
} from "@/lib/owner-analytics-shared";

/** How often today's KV daystats fallback is refreshed from D1 (whole site, not per isolate). */
const DAYSTATS_MIRROR_MS = 15 * 60_000;
const mirrorState = globalThis as typeof globalThis & { __kvDayMirrorAt__?: number };

/**
 * Copy today's D1 totals (views, unique visitors, peak) into KV daystats:<day> so the owner panel
 * still has a recent history if D1 goes down. Isolate memory gates the KV read; the `at` stamp in
 * the KV value gates the D1 query + KV write across isolates. Counts never go down.
 */
async function mirrorDayStatsKv(d1: D1DatabaseLike, now = Date.now()): Promise<void> {
  if (now - (mirrorState.__kvDayMirrorAt__ || 0) < DAYSTATS_MIRROR_MS) return;
  mirrorState.__kvDayMirrorAt__ = now;
  const dk = dayKey(now);
  const prev = await readDayStatsKv(dk);
  if (prev.at && now - prev.at < DAYSTATS_MIRROR_MS) return;
  const t = await d1TodayTotals(d1, dk);
  const next = {
    views: Math.max(prev.views, t.views),
    unique: Math.max(prev.unique, t.unique),
    peak: Math.max(prev.peak, t.peak),
    at: now,
  };
  await writeDayStatsKv(dk, next);
}

/** Prune expired entries from in-memory presence map; return active count. */
export function countMemoryOnline(now = Date.now()): number {
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

/**
 * Active online:* keys in KV (shared across Workers isolates). One cached list()
 * call — the old per-key get() loop cost N KV reads per heartbeat and ignored
 * keys written by kv-live (value "1" instead of a timestamp).
 */
export async function countKvOnline(_now = Date.now()): Promise<number> {
  try {
    return await kvCountOnline();
  } catch {
    return 0;
  }
}

async function countDbOnline(): Promise<number> {
  try {
    const d1 = await readyD1();
    if (d1) return await d1CountOnline(d1);
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

/** Non-secret DB failure category for diagnostics (never includes the URL/host). */
export type DbProblem = "ok" | "not_configured" | "connect_error" | "query_error" | "error";

export function describeDbError(err: unknown): { db: DbProblem; code?: string } {
  if ((err as { __d1?: boolean } | null)?.__d1) return { db: "error", code: "d1" };
  if (getDbSource() === "none") return { db: "not_configured" };
  const raw = (err as { code?: unknown } | null)?.code;
  let code = typeof raw === "string" && /^[A-Za-z0-9_]{1,24}$/.test(raw) ? raw : undefined;
  if (!code) {
    // Map well-known messages to fixed tokens — the message itself is never echoed.
    const msg = String((err as { message?: unknown } | null)?.message || "").toLowerCase();
    if (msg.includes("different request")) code = "cross_request_io";
    else if (msg.includes("password authentication")) code = "auth_failed";
    else if (msg.includes("getaddrinfo") || msg.includes("enotfound")) code = "dns";
    else if (msg.includes("timeout") || msg.includes("timed out")) code = "timeout";
    else if (msg.includes("does not exist")) code = "missing_object";
    else if (msg.includes("endpoint") && msg.includes("disabled")) code = "endpoint_disabled";
    else if (msg.includes("quota") || msg.includes("limit")) code = "quota";
    else if (msg.includes("ssl") || msg.includes("tls")) code = "tls";
  }
  // SQLSTATE class 42 (undefined table/column, syntax) => query problem; else connection/auth.
  const db: DbProblem =
    code && (/^42/.test(code) || code === "missing_object") ? "query_error" : "connect_error";
  return { db, code };
}

export async function analyticsHealth(): Promise<{
  database: "connected" | "error";
  analytics: "operational" | "unavailable";
  storage: OwnerStats["storage"];
  db: DbProblem;
  code?: string;
  timestamp: string;
}> {
  const d1 = await getD1();
  if (d1) {
    try {
      await d1Ping(d1);
      return {
        database: "connected",
        analytics: "operational",
        storage: "d1",
        db: "ok",
        timestamp: new Date().toISOString(),
      };
    } catch {
      const kv = await resolveAnalyticsKV();
      return {
        database: "error",
        analytics: kv ? "operational" : "unavailable",
        storage: kv ? "kv" : "error",
        db: "error",
        code: "d1",
        timestamp: new Date().toISOString(),
      };
    }
  }
  try {
    const sql = await getSql();
    await sql.query("select 1 as ok");
    return {
      database: "connected",
      analytics: "operational",
      storage: getDbSource() === "neon" ? "postgres" : "pglite",
      db: "ok",
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    const kv = await resolveAnalyticsKV();
    return {
      database: "error",
      analytics: kv ? "operational" : "unavailable",
      storage: kv ? "kv" : "error",
      ...describeDbError(err),
      timestamp: new Date().toISOString(),
    };
  }
}

export async function touchOnline(id: string, opts: { skipKv?: boolean } = {}): Promise<number> {
  const sid = safeId(id);
  if (!sid) return 0;
  const now = Date.now();

  // 1) Always update memory (works even if DB/KV down)
  touchMemory(sid, now);

  // 2) KV presence key: only when D1 can't hold presence. skipKv = the caller (kvTouchLive) already
  //    wrote online:<id> this request (it does so only when D1 is unavailable).
  let kvWritten = Boolean(opts.skipKv);
  const kvPresence = async () => {
    if (kvWritten) return;
    kvWritten = true;
    await optionalKvPut(`${ONLINE_KV_PREFIX}${sid}`, String(now), ONLINE_KV_TTL_SEC);
  };

  // 3) D1 when bound, else Postgres when available
  try {
    const d1 = await readyD1();
    if (d1) {
      // D1 sessions are shared across isolates: online count + peak need no KV.
      const dbCount = await d1TouchSession(d1, sid, now);
      const best = Math.max(dbCount, countMemoryOnline(now));
      await d1BumpPeak(d1, dayKey(now), best, now);
      return best;
    }
    await kvPresence();
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
    // Real concurrent visitors: PG sessions seen in the last 2 min (all isolates).
    const best = Math.max(dbCount, countMemoryOnline(now));
    await sql.query(
      `insert into analytics_daily_peak (day_wib, peak, updated_at)
       values ($1::date, $2, now())
       on conflict (day_wib) do update
       set peak = greatest(analytics_daily_peak.peak, excluded.peak),
           updated_at = now()`,
      [dk, best],
    );
    const total = Math.max(best, await countKvOnline(now));
    // Mirror into KV daystats so the KV fallback history keeps a real peak too.
    await bumpPeakKv(total);
    return total;
  } catch (err) {
    console.error("[analytics] touchOnline db failed — using memory/KV", err);
    // D1/Postgres failed: keep presence visible to other isolates through KV.
    await kvPresence();
    const total = Math.max(countMemoryOnline(now), await countKvOnline(now));
    await bumpPeakKv(total);
    return total;
  }
}

const pgCountryState = globalThis as typeof globalThis & { __pgCountryReady__?: Promise<boolean> };

/**
 * Adds analytics_events.country on Postgres once per isolate (idempotent).
 * Resolves false when the column can't be added, so hits are still recorded without it.
 */
function ensurePgCountry(sql: { query: (q: string, p: unknown[]) => Promise<unknown> }): Promise<boolean> {
  pgCountryState.__pgCountryReady__ ??= sql
    .query(`alter table analytics_events add column if not exists country text`, [])
    .then(() => true)
    .catch(() => false);
  return pgCountryState.__pgCountryReady__;
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
  country?: string;
}): Promise<void> {
  const now = Date.now();
  const path = normalizePath(input.path);
  const ref = normalizeRef(input.ref || "");
  const device = classifyDevice(input.ua || "");
  const browser = classifyBrowser(input.ua || "");
  const country = normalizeCountry(input.country);
  const host = (input.host || "").replace(/^www\./, "").slice(0, 80) || "(unknown)";
  const sessionId = safeId(input.sessionId || input.visitorId || "");
  const visitorId = safeId(input.visitorId || sessionId);
  const eventId =
    safeId(input.eventId || "") || `${now.toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const eventType = (input.eventType || "pageview").slice(0, 32);

  // Keep presence warm on pageview too (KV online:<id> is written by the caller's
  // presence touch — writing the same key again here hit KV's 1 write/s/key limit).
  if (sessionId) touchMemory(sessionId, now);

  try {
    const d1 = await readyD1();
    if (d1) {
      await d1RecordHit(d1, {
        id: eventId,
        eventType,
        visitorId: visitorId || null,
        sessionId: sessionId || null,
        path,
        ref,
        ua: (input.ua || "").slice(0, 300),
        device,
        browser,
        country,
        host,
        now,
        hourUtc: hourUtcBucket(now).toISOString(),
      });
      // KV daystats fallback: refreshed from D1 every DAYSTATS_MIRROR_MS, not per hit.
      await mirrorDayStatsKv(d1, now).catch(() => undefined);
      return;
    }
    const sql = await getSql();
    const withCountry = await ensurePgCountry(sql);
    const baseParams = [
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
    ];
    if (withCountry) {
      await sql.query(
        `insert into analytics_events
          (id, event_type, visitor_id, session_id, page, path, referrer, user_agent, device_type, browser, host, created_at, country)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now(), $12)
         on conflict (id) do nothing`,
        [...baseParams, country || null],
      );
    } else {
      await sql.query(
        `insert into analytics_events
          (id, event_type, visitor_id, session_id, page, path, referrer, user_agent, device_type, browser, host, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
         on conflict (id) do nothing`,
        baseParams,
      );
    }
    const bucket = hourUtcBucket(now);
    await sql.query(
      `insert into analytics_hourly (hour_utc, page_views, unique_visitors, sessions)
       values ($1, 1, 0, 0)
       on conflict (hour_utc) do update
       set page_views = analytics_hourly.page_views + 1`,
      [bucket.toISOString()],
    );
    // KV daystats mirror = fallback history if Postgres goes down later today.
    // Awaited: un-awaited promises are cancelled once a Worker returns its response.
    await recordHitKv({ visitorId, sessionId, path }).catch(() => undefined);
  } catch (err) {
    console.error("[analytics] recordHit failed", err);
    try {
      await recordHitKv({ visitorId, sessionId, path });
    } catch (e2) {
      console.error("[analytics] recordHitKv failed", e2);
    }
  }
}
