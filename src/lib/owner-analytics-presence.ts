/**
 * Owner analytics presence + hit recording.
 */
import { getSql } from "@/lib/db";
import {
  ONLINE_KV_PREFIX,
  ONLINE_KV_TTL_SEC,
  ONLINE_WINDOW_MS,
  bumpPeakKv,
  classifyBrowser,
  classifyDevice,
  dayKey,
  getKV,
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

/** List active online:* keys from KV (shared across Workers isolates). */
export async function countKvOnline(now = Date.now()): Promise<number> {
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
    const kv = await resolveAnalyticsKV();
    return {
      database: "error",
      analytics: kv ? "operational" : "unavailable",
      storage: kv ? "kv" : "error",
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
    const total = Math.max(best, await countKvOnline(now));
    void bumpPeakKv(total);
    return total;
  } catch (err) {
    console.error("[analytics] touchOnline db failed — using memory/KV", err);
    const total = Math.max(countMemoryOnline(now), await countKvOnline(now));
    void bumpPeakKv(total);
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
    void recordHitKv({ visitorId, sessionId, path });
  } catch (err) {
    console.error("[analytics] recordHit failed", err);
    try {
      await recordHitKv({ visitorId, sessionId, path });
    } catch (e2) {
      console.error("[analytics] recordHitKv failed", e2);
    }
  }
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
}
