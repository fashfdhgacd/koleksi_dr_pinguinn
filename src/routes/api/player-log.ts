import { createFileRoute } from "@tanstack/react-router";
import { getD1, type D1DatabaseLike } from "@/lib/analytics-d1";
import { getDetail } from "@/lib/catalog/local";
import { applyUnhidden, loadItemsRaw } from "@/lib/catalog/local-cache";
import { sourceLabel, type RawItem } from "@/lib/catalog/local-shared";
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
 *  (day, host, id, event, n) - no IP, no user agent, no visitor id.
 *
 *  Events v2 (2026-10-09, player.tsx), all unsampled so the ratios are exact:
 *   start2  visitor tapped play (once per video per session)
 *   slow2   no sign of life after 20 s, but the player came up later (or the visitor stayed 60 s+)
 *   fail2   the visitor acted (Coba lagi / Buka sumber / Lapor / Coba server lain), Streamtape
 *           reported an error, a direct file failed, or the visitor left after the 20 s hint
 *           without the player ever answering
 *   retry2 / open2 / report2 / alt2   the action itself
 *  v1 events (start sampled 1/4 x4, load_timeout after 8/12 s) are still accepted from old cached
 *  bundles but no longer shown: load_timeout fired on players that were working.
 *
 * GET (owner, header x-online-key): 7-day v2 numbers per host, the same numbers for today and
 *  yesterday (WIB calendar days, split from the same daily rows in the same grouped read - no extra
 *  query, no extra write), top 20 failing videos, videos the
 *  dead-video check marked "Dihapus oleh sumber" (src/lib/catalog/dead-sources.json), and the
 *  owner-hidden list. The player only names IndoAV/UserBokep/Streamtape/Putarin/Videy/Arsip and
 *  sends everything else as "Lainnya"; this owner read splits those rows by the video's catalog
 *  source (Byse, LuluStream, DoodStream, ...) so the panel shows them per host. Read-only, only
 *  when the owner opens the panel; the visitor beacon (and player.tsx) is unchanged.
 *
 * GET ?alt=<id> (public): another public catalog video with the same title or JAV code from a
 *  different host, for the player's "Coba server lain" button. Read-only, cacheable.
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
/** Weight per event. v1 "start" was sampled 1/4 in the browser; v2 events are all unsampled. */
const EVENTS: Record<string, number> = {
  start: 4,
  load_timeout: 1,
  st_error: 1,
  video_error: 1,
  retry: 1,
  open_source: 1,
  report: 1,
  start2: 1,
  slow2: 1,
  fail2: 1,
  retry2: 1,
  open2: 1,
  report2: 1,
  alt2: 1,
  // Videy popunder (ts-videy-popunder.tsx): tap handler ran / ad tab opened / open blocked.
  pop_fire: 1,
  pop_ok: 1,
  pop_block: 1,
  // Catalog card-click popunder (card-popunder.ts), once per session: same three steps.
  popc_fire: 1,
  popc_ok: 1,
  popc_block: 1,
  // Videy VAST pre-roll (videy-preroll.ts): requested / ad returned / played to the end.
  pre_req: 1,
  pre_fill: 1,
  pre_done: 1,
  pre_skip: 1,
};
const V2_EVENTS = ["start2", "slow2", "fail2", "retry2", "open2", "report2", "alt2"];
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

/**
 * Per-IP limit inside one isolate: 120 events per 10 minutes (mobile carriers put many visitors
 * behind one IP, and v2 sends "start2" for every play). Never stored.
 */
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_MAX = 120;
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
  const today = wibDay();
  const yesterday = wibDay(Date.now() - 86_400_000);
  let hostRows: { day: string; host: string; event: string; n: number }[] = [];
  let topRows: { id: string; host: string; fails: number; starts: number; reports: number }[] = [];
  if (db) {
    try {
      hostRows =
        (
          await db
            .prepare(
              `select day, host, event, sum(n) as n from player_errors
               where day >= ? and event in ('start2','slow2','fail2','retry2','open2','report2','alt2')
               group by day, host, event`,
            )
            .bind(since)
            .all<{ day: string; host: string; event: string; n: number }>()
        ).results || [];
      topRows =
        (
          await db
            .prepare(
              `select id, max(host) as host,
                 sum(case when event = 'fail2' then n else 0 end) as fails,
                 sum(case when event = 'start2' then n else 0 end) as starts,
                 sum(case when event = 'report2' then n else 0 end) as reports
               from player_errors where day >= ? and event in ('fail2','start2','report2')
               group by id having fails > 0 order by fails desc, reports desc limit 20`,
            )
            .bind(since)
            .all<{ id: string; host: string; fails: number; starts: number; reports: number }>()
        ).results || [];
    } catch (err) {
      console.error("player-log owner view:", err instanceof Error ? err.message.slice(0, 160) : "d1 error");
    }
  }
  // Videy popunder counters for today / yesterday (one small grouped read on the owner view).
  type Pop = { fire: number; ok: number; block: number; cardFire: number; cardOk: number; cardBlock: number; preReq: number; preFill: number; preDone: number; preSkip: number };
  const emptyPop = (): Pop => ({ fire: 0, ok: 0, block: 0, cardFire: 0, cardOk: 0, cardBlock: 0, preReq: 0, preFill: 0, preDone: 0, preSkip: 0 });
  const popunder: Record<string, Pop> = {};
  if (db) {
    try {
      const rows =
        (
          await db
            .prepare(
              `select day, event, sum(n) as n from player_errors
               where day >= ? and event in ('pop_fire','pop_ok','pop_block','popc_fire','popc_ok','popc_block','pre_req','pre_fill','pre_done','pre_skip') group by day, event`,
            )
            .bind(yesterday)
            .all<{ day: string; event: string; n: number }>()
        ).results || [];
      for (const r of rows) {
        const cur = (popunder[r.day] ||= emptyPop());
        const n = Number(r.n) || 0;
        const key = ({ pop_fire: "fire", pop_ok: "ok", pop_block: "block", popc_fire: "cardFire", popc_ok: "cardOk", popc_block: "cardBlock", pre_req: "preReq", pre_fill: "preFill", pre_done: "preDone", pre_skip: "preSkip" } as const)[
          r.event as "pop_fire"
        ];
        if (key) cur[key] += n;
      }
    } catch {
      /* optional */
    }
  }
  const items = await rawById();
  // "Lainnya" per video, so it can be split by catalog source (one small grouped read).
  let otherRows: { day: string; id: string; event: string; n: number }[] | null = null;
  if (db && hostRows.some((r) => r.host === "Lainnya")) {
    try {
      otherRows =
        (
          await db
            .prepare(
              `select day, id, event, sum(n) as n from player_errors
               where day >= ? and host = 'Lainnya'
                 and event in ('start2','slow2','fail2','retry2','open2','report2','alt2')
               group by day, id, event`,
            )
            .bind(since)
            .all<{ day: string; id: string; event: string; n: number }>()
        ).results || [];
    } catch (err) {
      otherRows = null;
      console.error("player-log owner split:", err instanceof Error ? err.message.slice(0, 160) : "d1 error");
    }
  }
  const realHost = (id: string, host: string): string => {
    if (host !== "Lainnya") return host;
    const it = items.get(id);
    const label = it ? sourceLabel(it) : "";
    return label && label !== "Unknown" ? label : "Lainnya";
  };
  const eventRows: { day: string; host: string; event: string; n: number }[] = otherRows
    ? [
        ...hostRows.filter((r) => r.host !== "Lainnya"),
        ...otherRows.map((r) => ({ day: r.day, host: realHost(r.id, "Lainnya"), event: r.event, n: Number(r.n) || 0 })),
      ]
    : hostRows;
  type HostRow = {
    host: string;
    starts: number;
    slow: number;
    fails: number;
    reports: number;
    retries: number;
    openSource: number;
    alt: number;
  };
  /** Per-host totals for one WIB day, or for the whole 7-day window when day is omitted. */
  const hostsFor = (day?: string) => {
    const byHost = new Map<string, HostRow>();
    for (const r of eventRows) {
      if (!V2_EVENTS.includes(r.event)) continue;
      if (day && r.day !== day) continue;
      const cur =
        byHost.get(r.host) || { host: r.host, starts: 0, slow: 0, fails: 0, reports: 0, retries: 0, openSource: 0, alt: 0 };
      const n = Number(r.n) || 0;
      if (r.event === "start2") cur.starts += n;
      else if (r.event === "slow2") cur.slow += n;
      else if (r.event === "fail2") cur.fails += n;
      else if (r.event === "report2") cur.reports += n;
      else if (r.event === "retry2") cur.retries += n;
      else if (r.event === "open2") cur.openSource += n;
      else if (r.event === "alt2") cur.alt += n;
      byHost.set(r.host, cur);
    }
    return [...byHost.values()]
      .map((h) => ({ ...h, rate: h.starts > 0 ? Math.min(1, h.fails / h.starts) : null }))
      .sort((a, b) => b.fails - a.fails || b.starts - a.starts);
  };
  const hosts = hostsFor();

  let hiddenIds: Record<string, { at: number }> = {};
  let hideReadable = true;
  try {
    hiddenIds = (await readOwnerHideState()).ids;
  } catch {
    hideReadable = false;
  }
  const hidden = new Set(Object.keys(hiddenIds));
  const dead = deadSources as DeadFile;
  const gone = Object.entries(dead.gone || {})
    .map(([id, e]) => ({ ...row(id, items, hidden, String(e?.host || "")), since: String(e?.since || "") }))
    .filter((r) => r.inCatalog)
    .sort((a, b) => b.since.localeCompare(a.since));
  const top = topRows.map((r) => ({
    ...row(r.id, items, hidden, realHost(r.id, r.host)),
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
    version: 2,
    storage: db ? "d1" : "none",
    since,
    hosts,
    today: { day: today, hosts: hostsFor(today) },
    yesterday: { day: yesterday, hosts: hostsFor(yesterday) },
    popunder: {
      today: popunder[today] || emptyPop(),
      yesterday: popunder[yesterday] || emptyPop(),
    },
    top,
    gone,
    suspect: Object.keys(dead.suspect || {}).length,
    checkedAt: dead.checkedAt || null,
    ownerHidden,
    hideReadable,
  });
}

/* ---------- "Coba server lain": same video from another host ---------- */

const NOT_JAV =
  /^(?:EPS?|EPISODE|PART|MP|HD|FHD|UHD|SD|VOL|NO|TAHUN|THN|JAM|MENIT|SMA|SMP|SMU|SMK|KELAS|UMUR|USIA|IDR|RP|INDO|BOKEP|VIRAL|TIKTOK|VIDEO|VID|IMG|DSC|MOV|PIC|TOP|NEW|LIVE|COL|SET|TER|BIGO|ONLY|OF|PAP|PJS|FULL)$/;

/** JAV code like "SSIS-123", "IPX456", "FC2-PPV-1234567" (same rules as owner-tools); null when none. */
function javCodeOf(title: string): string | null {
  const t = String(title || "");
  const fc2 = t.match(/\bFC2[-_ ]?(?:PPV[-_ ]?)?(\d{6,7})\b/i);
  if (fc2) return `FC2-PPV-${fc2[1]}`;
  for (const m of t.matchAll(/\b([A-Za-z]{2,6})([-_ ]?)(\d{3,5})\b/g)) {
    const prefix = m[1].toUpperCase();
    if (NOT_JAV.test(prefix)) continue;
    const sep = m[2];
    if (sep !== "-" && m[1] !== prefix) continue;
    if (sep !== "-" && /^(?:19|20)\d\d$/.test(m[3])) continue;
    return `${prefix}-${m[3]}`;
  }
  return null;
}

/** Title key without the brand suffix, case and punctuation; "" when too short to be a safe match. */
function titleKey(title: string): string {
  const key = String(title || "")
    .replace(/\(?\s*koleksi\s+dr\.?\s*pinguin[^)]*\)?/gi, " ")
    .replace(/koleksidrpinguin\.com/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return key.length >= 14 ? key : "";
}

/** Host family from the embed URL (IndoAV and UserBokep share one player stack). */
function hostOf(it: RawItem): string {
  const u = `${String(it.embed || "")} ${String(it.direct || "")}`.toLowerCase();
  if (/indoav/.test(u)) return "IndoAV";
  if (/userbokep/.test(u)) return "UserBokep";
  if (/streamtape|strcloud|streamta\.pe|tapecontent/.test(u)) return "Streamtape";
  if (/putarin|puterin/.test(u)) return "Putarin";
  return "";
}

/** Preferred alternative: a different player stack first (Putarin, then Streamtape or IndoAV). */
function altRank(from: string, to: string): number {
  const family = (h: string) => (h === "IndoAV" || h === "UserBokep" ? "tv1" : h);
  if (family(from) === family(to)) return to === from ? 99 : 5;
  if (to === "Putarin") return 0;
  return 1;
}

type AltIndex = { at: number; byKey: Map<string, RawItem[]> };
let altIndex: AltIndex | null = null;

async function altIndexNow(): Promise<AltIndex> {
  const cache = (await loadItemsRaw()) as { at: number; items: RawItem[] };
  if (altIndex && altIndex.at === cache.at) return altIndex;
  const byKey = new Map<string, RawItem[]>();
  const add = (k: string, it: RawItem) => {
    const list = byKey.get(k);
    if (list) list.push(it);
    else byKey.set(k, [it]);
  };
  for (const it of cache.items) {
    if (!it?.id || !hostOf(it)) continue;
    const tk = titleKey(String(it.title || ""));
    if (tk) add(`t:${tk}`, it);
    const jav = javCodeOf(String(it.title || ""));
    if (jav) add(`j:${jav}`, it);
  }
  altIndex = { at: cache.at, byKey };
  return altIndex;
}

const altMemo = new Map<string, { at: number; alt: { id: string; host: string; title: string } | null }>();

async function handleAlt(id: string): Promise<Response> {
  const pub = (status: number, data: unknown) =>
    Response.json(data, {
      status,
      headers: { "cache-control": status === 200 ? "public, max-age=600, s-maxage=3600" : "no-store" },
    });
  if (!ID_RE.test(id)) return pub(400, { ok: false, error: "bad_id" });
  const now = Date.now();
  const memo = altMemo.get(id);
  if (memo && now - memo.at < 30 * 60_000) return pub(200, { ok: true, alt: memo.alt });
  const index = await altIndexNow();
  const cache = (await loadItemsRaw()) as { byId?: Map<string, RawItem>; items: RawItem[] };
  const self = cache.byId?.get(id) || cache.items.find((it) => it.id === id);
  if (!self) return pub(404, { ok: false, error: "not_found" });
  const from = hostOf(self);
  const keys: string[] = [];
  const tk = titleKey(String(self.title || ""));
  if (tk) keys.push(`t:${tk}`);
  const jav = javCodeOf(String(self.title || ""));
  if (jav) keys.push(`j:${jav}`);
  const gone = (deadSources as DeadFile).gone || {};
  const candidates: RawItem[] = [];
  for (const k of keys) for (const it of index.byKey.get(k) || []) if (it.id !== id && !gone[it.id]) candidates.push(it);
  candidates.sort((a, b) => altRank(from, hostOf(a)) - altRank(from, hostOf(b)));
  let alt: { id: string; host: string; title: string } | null = null;
  for (const it of candidates) {
    const to = hostOf(it);
    if (!to || to === from) continue;
    if (!(await isPublicId(it.id))) continue;
    alt = { id: it.id, host: to, title: String(it.title || "").slice(0, 140) };
    break;
  }
  if (altMemo.size > 5000) altMemo.clear();
  altMemo.set(id, { at: now, alt });
  return pub(200, { ok: true, alt });
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
        const alt = new URL(request.url).searchParams.get("alt");
        if (alt !== null) return handleAlt(alt.trim());
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
