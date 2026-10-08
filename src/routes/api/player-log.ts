import { createFileRoute } from "@tanstack/react-router";
import { getD1, type D1DatabaseLike } from "@/lib/analytics-d1";
import { getDetail } from "@/lib/catalog/local";
import { applyUnhidden, loadItemsRaw } from "@/lib/catalog/local-cache";
import type { RawItem } from "@/lib/catalog/local-shared";
import { readUnhideState } from "@/lib/catalog/unhide-store";
import { readOwnerHideState, setOwnerHidden } from "@/lib/catalog/owner-hide-store";
import { isOwnerRequest, OWNER_KEY_HEADER } from "@/lib/owner-auth";
import deadSources from "@/lib/catalog/dead-sources.json";

/**
 * Player error logger + owner view.
 *
 * POST (visitor, navigator.sendBeacon): body {id, host, event}, plain JSON text, at most 300 bytes.
 *  Guards: same-site Origin (or Referer) only, strict id/host/event validation, id must be a public
 *  catalog video, per-IP in-memory rate limit (per isolate). The browser already sends each
 *  id+event at most once per session. Storage: D1 (ANALYTICS_DB) daily counters only
 *  (day, host, id, event, n) - no IP, no user agent, no visitor id. "start" is sampled 1 in 4 in the
 *  browser and counted x4 here, so the failure rate is an estimate.
 *
 * GET (owner, header x-online-key): 7-day failure rate per host, top 20 failing videos, videos the
 *  dead-video check marked "Dihapus oleh sumber" (src/lib/catalog/dead-sources.json), and the
 *  owner-hidden list.
 *
 * POST with header x-online-key (owner): {action:"owner-hide", id, hide:boolean}. Reversible hide
 *  through KV owner:hide:v1 (owner-hide-store.ts). Nothing is ever deleted.
 */

const SCHEMA = [
  `create table if not exists player_errors (
     day text not null,
     host text not null,
     id text not null,
     event text not null,
     n integer not null default 0,
     primary key (day, id, event)
   )`,
  `create index if not exists player_errors_day on player_errors (day)`,
];

const ALLOWED_ORIGINS = new Set(["https://koleksidrpinguin.com", "https://www.koleksidrpinguin.com"]);
const HOSTS = new Set(["IndoAV", "UserBokep", "Streamtape", "Putarin", "Videy", "Arsip", "Lainnya"]);
/** Weight per event ("start" is sampled 1/4 in the browser). */
const EVENTS: Record<string, number> = {
  start: 4,
  load_timeout: 1,
  st_error: 1,
  video_error: 1,
  retry: 1,
  open_source: 1,
  report: 1,
};
const FAIL_EVENTS = ["load_timeout", "st_error", "video_error"];
const ID_RE = /^[A-Za-z0-9_-]{3,64}$/;
const MAX_BODY = 300;
const KEEP_DAYS = 35;

const g = globalThis as typeof globalThis & { __playerLogSchema__?: Promise<void> };

async function logDb(): Promise<D1DatabaseLike | null> {
  const db = await getD1().catch(() => null);
  if (!db) return null;
  g.__playerLogSchema__ ??= db
    .batch(SCHEMA.map((s) => db.prepare(s)))
    .then(() => undefined)
    .catch((err) => {
      g.__playerLogSchema__ = undefined;
      throw err;
    });
  await g.__playerLogSchema__;
  return db;
}

function wibDay(ts = Date.now()): string {
  return new Date(ts + 7 * 3600_000).toISOString().slice(0, 10);
}

function noStore(status: number, data?: unknown): Response {
  if (data === undefined) return new Response(null, { status, headers: { "cache-control": "no-store" } });
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

function originOk(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin) return ALLOWED_ORIGINS.has(origin);
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return ALLOWED_ORIGINS.has(new URL(referer).origin);
  } catch {
    return false;
  }
}

function clientIp(request: Request): string {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "0";
  if (ip.includes(":")) return ip.split(":").slice(0, 4).join(":") + "::/64";
  return ip;
}

/** Per-IP limit inside one isolate: 40 events per 10 minutes. Never stored. */
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_MAX = 40;
const rate = new Map<string, { n: number; reset: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (rate.size > 10_000) rate.clear();
  const cur = rate.get(ip);
  if (!cur || now > cur.reset) {
    rate.set(ip, { n: 1, reset: now + RATE_WINDOW_MS });
    return false;
  }
  cur.n += 1;
  return cur.n > RATE_MAX;
}

/** Small per-isolate memo of public catalog ids. */
const knownIds = new Map<string, { ok: boolean; at: number }>();
async function isPublicId(id: string): Promise<boolean> {
  const now = Date.now();
  const hit = knownIds.get(id);
  if (hit && now - hit.at < 10 * 60_000) return hit.ok;
  let ok = false;
  try {
    await getDetail(id);
    ok = true;
  } catch {
    ok = false;
  }
  if (knownIds.size > 5000) knownIds.clear();
  knownIds.set(id, { ok, at: now });
  return ok;
}

let lastPrune = 0;
async function prune(db: D1DatabaseLike): Promise<void> {
  const now = Date.now();
  if (now - lastPrune < 6 * 3600_000) return;
  lastPrune = now;
  try {
    await db.prepare("delete from player_errors where day < ?").bind(wibDay(now - KEEP_DAYS * 86_400_000)).run();
  } catch {
    /* best effort */
  }
}

async function handleBeacon(request: Request): Promise<Response> {
  if (!originOk(request)) return noStore(403);
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY) return noStore(413);
  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BODY) return noStore(text ? 413 : 400);
  let body: { id?: unknown; host?: unknown; event?: unknown };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    return noStore(400);
  }
  const id = typeof body?.id === "string" ? body.id : "";
  const host = typeof body?.host === "string" ? body.host : "";
  const event = typeof body?.event === "string" ? body.event : "";
  if (!ID_RE.test(id) || !HOSTS.has(host) || !Object.prototype.hasOwnProperty.call(EVENTS, event)) {
    return noStore(400);
  }
  if (rateLimited(clientIp(request))) return noStore(429);
  if (!(await isPublicId(id))) return noStore(404);
  const db = await logDb().catch(() => null);
  if (!db) return noStore(503);
  try {
    await db
      .prepare(
        `insert into player_errors (day, host, id, event, n) values (?, ?, ?, ?, ?)
         on conflict (day, id, event) do update set n = player_errors.n + excluded.n, host = excluded.host`,
      )
      .bind(wibDay(), host, id, event, EVENTS[event])
      .run();
    await prune(db);
  } catch (err) {
    console.error("player-log failed:", err instanceof Error ? err.message.slice(0, 160) : "d1 error");
    return noStore(503);
  }
  return noStore(204);
}

function httpUrl(v: unknown): string | null {
  const s = String(v || "").trim();
  return /^https?:\/\//i.test(s) ? s : null;
}

/** Link to the video at its source (page when known, else the embed URL). */
function sourceLink(it: RawItem | undefined): string | null {
  if (!it) return null;
  const embed = httpUrl(it.embed) || httpUrl(it.direct);
  const direct = httpUrl(it.direct);
  const any = embed || direct || "";
  const host = any.match(/^(https?:\/\/[^/]+)\/e\/([A-Za-z0-9_-]+)/i);
  if (host && /indoav|userbokep/i.test(host[1])) return `${host[1]}/d/${host[2]}`;
  const st = any.match(/^https?:\/\/(?:www\.)?streamtape\.[a-z]+\/e\/([A-Za-z0-9]+)/i);
  if (st) return `https://streamtape.com/v/${st[1]}`;
  if (direct && /\/v\//.test(direct)) return direct;
  return embed || direct;
}

type GoneEntry = { host?: string; since?: string; status?: number };
type DeadFile = { checkedAt?: string | null; gone?: Record<string, GoneEntry>; suspect?: Record<string, unknown> };

async function rawById(): Promise<Map<string, RawItem>> {
  const cache = (await loadItemsRaw()) as { raw?: RawItem[]; items: RawItem[] };
  const map = new Map<string, RawItem>();
  for (const it of cache.raw || cache.items) if (it?.id && !map.has(it.id)) map.set(it.id, it);
  return map;
}

function row(id: string, items: Map<string, RawItem>, hidden: Set<string>, host = "") {
  const it = items.get(id);
  return {
    id,
    title: String(it?.title || id).slice(0, 140),
    host: host || String(it?.source || ""),
    sourceUrl: sourceLink(it),
    watchUrl: `/watch/${id}`,
    inCatalog: Boolean(it),
    hidden: hidden.has(id),
  };
}

async function handleOwnerView(): Promise<Response> {
  const db = await logDb().catch(() => null);
  const since = wibDay(Date.now() - 6 * 86_400_000);
  let hostRows: { host: string; event: string; n: number }[] = [];
  let topRows: { id: string; host: string; fails: number; starts: number; reports: number }[] = [];
  if (db) {
    try {
      hostRows =
        (
          await db
            .prepare("select host, event, sum(n) as n from player_errors where day >= ? group by host, event")
            .bind(since)
            .all<{ host: string; event: string; n: number }>()
        ).results || [];
      topRows =
        (
          await db
            .prepare(
              `select id, max(host) as host,
                 sum(case when event in ('load_timeout','st_error','video_error','report') then n else 0 end) as fails,
                 sum(case when event = 'start' then n else 0 end) as starts,
                 sum(case when event = 'report' then n else 0 end) as reports
               from player_errors where day >= ?
               group by id having fails > 0 order by fails desc, reports desc limit 20`,
            )
            .bind(since)
            .all<{ id: string; host: string; fails: number; starts: number; reports: number }>()
        ).results || [];
    } catch (err) {
      console.error("player-log owner view:", err instanceof Error ? err.message.slice(0, 160) : "d1 error");
    }
  }
  const byHost = new Map<string, { host: string; starts: number; fails: number; reports: number; retries: number; openSource: number }>();
  for (const r of hostRows) {
    const cur = byHost.get(r.host) || { host: r.host, starts: 0, fails: 0, reports: 0, retries: 0, openSource: 0 };
    const n = Number(r.n) || 0;
    if (r.event === "start") cur.starts += n;
    else if (FAIL_EVENTS.includes(r.event)) cur.fails += n;
    else if (r.event === "report") cur.reports += n;
    else if (r.event === "retry") cur.retries += n;
    else if (r.event === "open_source") cur.openSource += n;
    byHost.set(r.host, cur);
  }
  const hosts = [...byHost.values()]
    .map((h) => ({ ...h, rate: h.starts > 0 ? Math.min(1, h.fails / h.starts) : null }))
    .sort((a, b) => b.fails - a.fails || b.starts - a.starts);

  let hiddenIds: Record<string, { at: number }> = {};
  let hideReadable = true;
  try {
    hiddenIds = (await readOwnerHideState()).ids;
  } catch {
    hideReadable = false;
  }
  const hidden = new Set(Object.keys(hiddenIds));
  const items = await rawById();
  const dead = deadSources as DeadFile;
  const gone = Object.entries(dead.gone || {})
    .map(([id, e]) => ({ ...row(id, items, hidden, String(e?.host || "")), since: String(e?.since || "") }))
    .filter((r) => r.inCatalog)
    .sort((a, b) => b.since.localeCompare(a.since));
  const top = topRows.map((r) => ({
    ...row(r.id, items, hidden, r.host),
    fails: Number(r.fails) || 0,
    starts: Number(r.starts) || 0,
    reports: Number(r.reports) || 0,
    gone: Boolean(dead.gone?.[r.id]),
  }));
  const ownerHidden = Object.entries(hiddenIds)
    .sort((a, b) => b[1].at - a[1].at)
    .map(([id, v]) => ({ ...row(id, items, hidden), at: v.at || null }));

  return noStore(200, {
    ok: true,
    storage: db ? "d1" : "none",
    since,
    hosts,
    top,
    gone,
    suspect: Object.keys(dead.suspect || {}).length,
    checkedAt: dead.checkedAt || null,
    ownerHidden,
    hideReadable,
  });
}

async function handleOwnerHide(request: Request): Promise<Response> {
  let body: { action?: unknown; id?: unknown; hide?: unknown; key?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  if (!(await isOwnerRequest(request))) return noStore(403, { ok: false, error: "forbidden" });
  if (body.action !== "owner-hide") return noStore(400, { ok: false, error: "bad_action" });
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!ID_RE.test(id)) return noStore(400, { ok: false, error: "bad_id" });
  if (typeof body.hide !== "boolean") return noStore(400, { ok: false, error: "bad_hide" });
  const items = await rawById();
  if (body.hide && !items.has(id)) return noStore(404, { ok: false, error: "not_in_catalog" });
  try {
    const state = await setOwnerHidden(id, body.hide);
    let unhidden: string[] = [];
    try {
      unhidden = Object.keys((await readUnhideState()).ids);
      applyUnhidden(unhidden, Object.keys(state.ids));
    } catch {
      /* other isolates pick it up within 30 s */
    }
    knownIds.delete(id);
    return noStore(200, { ok: true, id, hidden: body.hide, total: Object.keys(state.ids).length });
  } catch (e) {
    return noStore(503, { ok: false, error: e instanceof Error ? e.message : "kv_error" });
  }
}

export const Route = createFileRoute("/api/player-log")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isOwnerRequest(request))) return noStore(403, { ok: false, error: "forbidden" });
        return handleOwnerView();
      },
      POST: async ({ request }) => {
        if (request.headers.get(OWNER_KEY_HEADER)) return handleOwnerHide(request);
        return handleBeacon(request);
      },
    },
  },
});
