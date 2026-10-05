/**
 * Owner analytics presence + hit recording.
 */
import { getDbSource, getSql } from "@/lib/db";
import { resolveAnalyticsKV } from "@/lib/analytics-kv";
import { kvCountOnline } from "@/lib/kv-live";
import {
  ONLINE_KV_PREFIX,
  ONLINE_KV_TTL_SEC,
  ONLINE_WINDOW_MS,
  type OwnerStats,
  bumpPeakKv,
  classifyBrowser,
  classifyDevice,
  dayKey,
  hourUtcBucket,
  mem,
  normalizePath,
  normalizeRef,
  optionalKvPut,
  recordHitKv,
  safeId,
} from "@/lib/owner-analytics-shared";

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
export type DbProblem = "ok" | "not_configured" | "connect_error" | "query_error";

export function describeDbError(err: unknown): { db: DbProblem; code?: string } {
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

  // 2) KV write-through (shared). /api/online already wrote online:<id> via kvTouchLive.
  if (!opts.skipKv) {
    await optionalKvPut(`${ONLINE_KV_PREFIX}${sid}`, String(now), ONLINE_KV_TTL_SEC);
  }

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
    const total = Math.max(countMemoryOnline(now), await countKvOnline(now));
    await bumpPeakKv(total);
    return total;
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

  // Keep presence warm on pageview too (KV online:<id> is written by the caller's
  // presence touch — writing the same key again here hit KV's 1 write/s/key limit).
  if (sessionId) touchMemory(sessionId, now);

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
