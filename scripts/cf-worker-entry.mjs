/**
 * Cloudflare Worker entry (Nitro `entry` option, set in nitro.config.ts).
 *
 * Wraps Nitro's stock cloudflare-module handler with two layers:
 *
 * 1. A request whose path is not valid percent-encoding (e.g. "/%", "/kategori/%ff") used to throw
 *    `URIError: URI malformed` inside h3's H3Event constructor, before any middleware could run, so
 *    Cloudflare answered with error 1101 (500). Such requests now get a plain 400.
 *
 * 2. An edge cache (Cache API, per data centre) in front of the whole app. A Worker always runs
 *    before Cloudflare's CDN cache, so the `s-maxage` headers the routes already send were never
 *    used: every page view re-rendered the page, and every one of the ~35 thumbnails per page booted
 *    the full router just to reach the thumb route's own cache lookup. Cacheable GETs are now answered
 *    straight from the cache before Nitro starts.
 *    - Only anonymous GETs: requests carrying the owner key or an Authorization header, /pemilik and
 *      /api/online always go to the app.
 *    - Only responses the app itself marks public (s-maxage or max-age, no private/no-store, no
 *      Set-Cookie, status 200) are stored, so owner and per-user responses are never shared.
 *    - HTML is fresh for at most HTML_FRESH_MAX seconds, so new uploads and hidden videos show up
 *      within a few minutes. After that it is served stale (up to its stale-while-revalidate) while
 *      one background render refreshes it.
 *
 *    - Pages and data are cached per deploy: the key carries the deploy's version id (binding
 *      CF_VERSION_METADATA, added by scripts/cf-patch-wrangler.mjs). Without it, HTML cached before a
 *      deploy kept pointing to hashed /assets files the new deploy no longer has (JS 404, dead page)
 *      for up to HTML_FRESH_MAX seconds plus the stale window. Images and other static files keep a
 *      version-free key so a deploy does not empty their cache. Without the binding the key has no
 *      version (old behaviour).
 *
 * 3. Owner title/category edits (/api/owner-videy save, /api/owner-tools edit) purge the cached pages
 *    that show that video in this data centre: /watch/<id>, /, /kategori/videy and the edited
 *    category, on both hosts. A second purge ~29 s later catches a page another isolate rendered
 *    before its 30 s owner-edit sync. Only owner POSTs are read for this; visitors pay nothing.
 *
 * 4. /pemilik "Edit" (POST /api/owner-tools, action edit-video): the typed title gets exactly one
 *    " - koleksidrpinguin.com" (other site/Telegram branding at the end removed) before the app sees
 *    it, the same brandUploadTitle() as bot uploads and the Videy panel. The app's own checks
 *    (owner key, minor-lock, length) then run on that final title.
 *
 * nitro is pinned to an exact version in package.json, so this internal path is stable; if a future
 * nitro moves it, `vite build` fails loudly instead of deploying something broken.
 */
import nitroHandler from "../node_modules/nitro/dist/presets/cloudflare/runtime/cloudflare-module.mjs";
import { brandUploadTitle } from "../src/lib/bot/title-brand.js";
import { fetchJsonFromGithub, upsertVideosBatch } from "../src/lib/bot/github.js";

/**
 * Longest time (s) a cached HTML page counts as fresh. 600 s (Oct 2026, cost cut, was 180): new uploads
 * still show at once because every upload lands through a GitHub commit + deploy, and the cache key
 * carries the deploy version; owner edits are purged (purgeAfterEdit). Only an owner hide waits up to
 * this long (then the stale copy is dropped when the refresh no longer gets a 200).
 */
const HTML_FRESH_MAX = 600;
/**
 * Busy-day freshness (s) for cached pages/JSON while the traffic valve samples analytics
 * (src/lib/traffic-valve.ts; the rate this isolate last read is on globalThis.__kdpValve__). On a
 * viral day most views hit a few popular URLs, so an hour of freshness turns almost every view into a
 * cache hit (~1–2 ms CPU instead of a full render). Uploads still show at once (deploy = new key).
 */
const BUSY_FRESH = 3600;
function valveBusy() {
  try {
    return Number(globalThis.__kdpValve__?.n || 1) > 1;
  } catch {
    return false;
  }
}
/** Longest stale window (s) for HTML when the page sets a larger stale-while-revalidate. */
const HTML_STALE_MAX = 86_400;
/**
 * Longer edge freshness (Oct 2026, TTFB): a watch page only changes on a deploy (new cache key),
 * an owner edit or an owner hide (both purged, see purgeAfterEdit), so it may stay fresh 6 h and be
 * served stale up to 7 days while one background render refreshes it. Category lists 30 min / 1 day.
 * Home and every other page keep HTML_FRESH_MAX.
 */
const WATCH_FRESH_MAX = 21_600;
const WATCH_STALE_MAX = 604_800;
const CATEGORY_FRESH_MAX = 1_800;
function htmlLimits(path) {
  if (path.startsWith("/watch/")) return [WATCH_FRESH_MAX, WATCH_STALE_MAX];
  if (path === "/kategori" || path.startsWith("/kategori/")) return [CATEGORY_FRESH_MAX, HTML_STALE_MAX];
  return [HTML_FRESH_MAX, HTML_STALE_MAX];
}
/** Longest time (s) any other cached response (images, xml, json) is kept. */
const OTHER_TTL_MAX = 86_400;
/** Background refreshes in flight in this isolate, so one stale page triggers one render. */
const refreshing = new Set();

function badRequest() {
  return new Response("Bad Request", {
    status: 400,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "x-robots-tag": "noindex",
      "x-content-type-options": "nosniff",
    },
  });
}

function hasMalformedPath(request) {
  try {
    decodeURI(new URL(request.url).pathname);
    return false;
  } catch {
    return true;
  }
}

function edgeCache() {
  try {
    return typeof caches !== "undefined" && caches.default ? caches.default : null;
  } catch {
    return null;
  }
}

/** Whether this request may be answered from / stored in the shared cache. */
function cacheableRequest(request, url) {
  if (request.method !== "GET") return false;
  if (request.headers.has("x-online-key") || request.headers.has("authorization")) return false;
  const p = url.pathname;
  if (p === "/pemilik" || p.startsWith("/pemilik/")) return false;
  if (p === "/api/online" || p.startsWith("/api/owner") || p.startsWith("/api/analytics")) return false;
  if (p.startsWith("/cdn-cgi/")) return false;
  return true;
}

/** Paths whose cached copy does not depend on the deploy (images, hashed or static files). */
const VERSION_FREE =
  /^\/(?:assets\/|thumb\/|videy-thumbs\/|api\/(?:img-proxy|tape-thumb|embed-thumb|puterin-thumb|og|frame)\b)|\.(?:jpe?g|png|webp|gif|avif|svg|ico|woff2?|css|js|mp4)$/i;

function deployVersion(env) {
  const id = env?.CF_VERSION_METADATA?.id;
  return typeof id === "string" && id ? id.slice(0, 12) : "";
}

/** Cache key: the URL, plus the deploy version for pages and data. */
function cacheKey(url, env) {
  const v = VERSION_FREE.test(url.pathname) ? "" : deployVersion(env);
  if (!v) return new Request(url.toString(), { method: "GET" });
  const k = new URL(url.toString());
  k.searchParams.set("__edge_v", v);
  return new Request(k.toString(), { method: "GET" });
}

function directive(cc, name) {
  const m = cc.match(new RegExp(`(?:^|,)\\s*${name}\\s*=\\s*(\\d+)`, "i"));
  return m ? Number(m[1]) : null;
}

/** Fresh/stale seconds for a response, or null when it must not be shared. */
function cachePolicy(response, path = "") {
  if (response.status !== 200) return null;
  if (response.headers.has("set-cookie")) return null;
  // /thumb placeholder (no poster yet): kept only briefly, so a real image takes over soon.
  if (response.headers.has("x-thumb-fallback")) return { fresh: 300, stale: 0 };
  const cc = response.headers.get("cache-control") || "";
  if (!/\bpublic\b/i.test(cc) || /\b(private|no-store|no-cache)\b/i.test(cc)) return null;
  const ttl = directive(cc, "s-maxage") ?? directive(cc, "max-age");
  if (!ttl || ttl <= 0) return null;
  const type = response.headers.get("content-type") || "";
  if (type.includes("text/html")) {
    const swr = directive(cc, "stale-while-revalidate") || 0;
    const [freshMax, staleMax] = htmlLimits(path);
    return { fresh: Math.min(ttl, freshMax), stale: Math.min(swr, staleMax) };
  }
  // Catalog JSON feeds the same lists as the pages, so it follows the HTML freshness limit.
  if (type.includes("json")) return { fresh: Math.min(ttl, HTML_FRESH_MAX), stale: 0 };
  return { fresh: Math.min(ttl, OTHER_TTL_MAX), stale: 0 };
}

/** Stores a copy of `response` under `key`; the client copy keeps the app's own headers. */
function store(cache, key, response, policy, context) {
  const headers = new Headers(response.headers);
  headers.set("x-edge-cc", response.headers.get("cache-control") || "");
  headers.set("x-edge-at", String(Date.now()));
  headers.set("x-edge-fresh", String(policy.fresh));
  headers.set("cache-control", `public, max-age=${policy.fresh + policy.stale}`);
  headers.delete("cdn-cache-control");
  const copy = new Response(response.clone().body, { status: 200, headers });
  const put = cache.put(key, copy).catch(() => undefined);
  if (context?.waitUntil) context.waitUntil(put);
}

/** Cached entry → client response, restoring the app's cache-control and tagging the hit. */
function fromCache(hit, state) {
  const headers = new Headers(hit.headers);
  const original = headers.get("x-edge-cc");
  if (original) headers.set("cache-control", original);
  headers.delete("x-edge-cc");
  headers.delete("x-edge-at");
  headers.delete("x-edge-fresh");
  headers.set("x-edge-cache", state);
  return new Response(hit.body, { status: hit.status, headers });
}

async function renderAndStore(request, env, context, cache, key) {
  const response = await nitroHandler.fetch(request, env, context);
  const policy = cachePolicy(response, new URL(request.url).pathname);
  if (policy) store(cache, key, response, policy, context);
  // No longer cacheable (e.g. a video was hidden and now 404s): drop the old copy right away.
  else if (context?.waitUntil) context.waitUntil(cache.delete(key).catch(() => undefined));
  return response;
}

async function cachedFetch(request, env, context, url) {
  const cache = edgeCache();
  if (!cache || !cacheableRequest(request, url)) return nitroHandler.fetch(request, env, context);
  const key = cacheKey(url, env);

  let hit = null;
  try {
    hit = (await cache.match(key)) || null;
  } catch {
    hit = null;
  }

  // Placeholder stored with the old 1 h lifetime: ignore it and render again.
  if (hit && hit.headers.has("x-thumb-fallback") && Number(hit.headers.get("x-edge-fresh") || 0) > 300) hit = null;

  if (hit) {
    const at = Number(hit.headers.get("x-edge-at") || 0);
    const stored = Number(hit.headers.get("x-edge-fresh") || 0);
    // Busy day: keep cached pages fresh longer (only entries this wrapper stored, never /thumb placeholders).
    const fresh = at && stored > 0 && !hit.headers.has("x-thumb-fallback") && valveBusy() ? Math.max(stored, BUSY_FRESH) : stored;
    // Entries written by a route itself (e.g. /thumb) carry no x-edge-at: their own max-age governs.
    if (!at || Date.now() - at < fresh * 1000) return fromCache(hit, "HIT");
    // Stale but within its stale window (the cache drops it after that): serve it, refresh once.
    const href = key.url;
    if (!refreshing.has(href) && context?.waitUntil) {
      refreshing.add(href);
      context.waitUntil(
        renderAndStore(new Request(request), env, context, cache, key)
          .then((r) => r.body?.cancel?.())
          .catch(() => undefined)
          .finally(() => refreshing.delete(href)),
      );
    }
    return fromCache(hit, "STALE");
  }

  const response = await renderAndStore(request, env, context, cache, key);
  if (!cachePolicy(response, url.pathname)) return response;
  const headers = new Headers(response.headers);
  headers.set("x-edge-cache", "MISS");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Owner Edit: brand the typed title. Any parsing problem leaves the request untouched. */
async function brandEditRequest(request) {
  if (!request.headers.has("x-online-key")) return request;
  let text = "";
  try {
    text = await request.clone().text();
  } catch {
    return request;
  }
  if (!text || text.length > 20_000) return request;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return request;
  }
  if (body?.action !== "edit-video" || typeof body.title !== "string") return request;
  const typed = body.title.replace(/\s+/g, " ").trim();
  if (!typed) return request;
  const branded = brandUploadTitle(typed);
  if (!branded || branded.length > 200) return request;
  return new Request(request, { body: JSON.stringify({ ...body, title: branded }) });
}

/**
 * /thumb/<id> placeholder (the route found no poster): a Videy video has its own frame as a static
 * file (public/videy-thumbs/<id>.jpg, videy-thumbs workflow), so that is served instead; anything
 * else gets the pixel-art penguin brand poster (/brand-poster-v2.jpg, same as the header logo and
 * og image). Both come from the static assets binding, only on placeholder answers.
 */
async function realThumb(env, url, response) {
  if (!response.headers.has("x-thumb-fallback") || !env?.ASSETS?.fetch) return response;
  const id = decodeURIComponent(url.pathname.slice("/thumb/".length)).replace(/\.(jpe?g|webp|png)$/i, "");
  const tries = /^[A-Za-z0-9]{4,40}$/.test(id)
    ? [[`/videy-thumbs/${id}.jpg`, "public, max-age=2592000, stale-while-revalidate=604800", "videy"]]
    : [];
  tries.push(["/brand-poster-v2.jpg", "public, max-age=300", "brand"]);
  for (const [path, cc, tag] of tries) {
    try {
      const res = await env.ASSETS.fetch(new Request(new URL(path, url.origin).toString()));
      if (!res.ok || !/image\/jpe?g/i.test(res.headers.get("content-type") || "")) continue;
      const headers = new Headers({ "content-type": "image/jpeg", "cache-control": cc, "x-thumb-src": tag });
      const edge = response.headers.get("x-edge-cache");
      if (edge) headers.set("x-edge-cache", edge);
      if (tag === "brand") headers.set("x-thumb-fallback", "1");
      return new Response(res.body, { status: 200, headers });
    } catch {
      /* next */
    }
  }
  return response;
}

const PURGE_HOSTS = ["https://koleksidrpinguin.com", "https://www.koleksidrpinguin.com"];

function purgeKeys(env, id, category) {
  const paths = [`/watch/${id}`, "/", "/kategori/videy"];
  if (category && /^[A-Za-z0-9_-]{1,60}$/.test(category)) paths.push(`/kategori/${category}`);
  const keys = [];
  for (const origin of PURGE_HOSTS) for (const p of paths) keys.push(cacheKey(new URL(p, origin), env));
  return keys;
}

/** After a successful owner edit: drop the cached pages that show the edited video. */
async function purgeAfterEdit(request, response, env, context) {
  const cache = edgeCache();
  if (!cache || !context?.waitUntil || response.status !== 200) return;
  let data = null;
  try {
    data = await response.clone().json();
  } catch {
    return;
  }
  const id = typeof data?.id === "string" ? data.id : "";
  const hideChange = typeof data?.hidden === "boolean";
  if (!data?.ok || !/^[A-Za-z0-9_-]{3,64}$/.test(id) || (!data.title && !data.category && !hideChange)) return;
  const keys = purgeKeys(env, id, typeof data.category === "string" ? data.category : "");
  const run = () => Promise.all(keys.map((k) => cache.delete(k).catch(() => false)));
  context.waitUntil(
    run().then(() => new Promise((r) => setTimeout(r, 29_000))).then(run).catch(() => undefined),
  );
}

/** Cron heartbeat (step 1 of the upload queue): only records the last run in KV. */
const CRON_LAST_KEY = "cron:last";
const FLUSH_LAST_KEY = "cron:flush:last";
const FLUSH_REAL_KEY = "cron:flush:realAt";
const FLUSH_EVERY_MS = 55 * 60_000;
const QUEUE_FLAG_KEY = "bot:queue:on";
const QUEUE_DEFAULT_MODE = "1"; // must match src/lib/bot/upload-handler.js

async function queueMode(env) {
  try {
    const v = String((await env?.ANALYTICS_KV?.get(QUEUE_FLAG_KEY)) ?? "").trim();
    return v || QUEUE_DEFAULT_MODE;
  } catch {
    return "0";
  }
}

/**
 * Step 2 dry-run flush: reads the shadow copies (bot:qdry:*) of real Videy uploads, groups them per
 * feed file and checks each against GitHub (read-only). Commits nothing. Report -> cron:flush:last.
 */
async function dryFlush(env) {
  const kv = env?.ANALYTICS_KV;
  if (!kv?.list) return;
  const listed = await kv.list({ prefix: "bot:qdry:", limit: 200 });
  const keys = (listed?.keys || []).map((k) => k.name);
  const byFile = new Map();
  let bad = 0;
  for (const name of keys) {
    try {
      const v = JSON.parse((await kv.get(name)) || "null");
      if (!v?.record?.id) {
        bad += 1;
        continue;
      }
      const f = String(v.fileName || "videos.json");
      byFile.set(f, [...(byFile.get(f) || []), v.record]);
    } catch {
      bad += 1;
    }
  }
  const files = {};
  for (const [f, recs] of byFile) {
    const got = await fetchJsonFromGithub(env, f === "videos.json" ? "videos-latest.json" : f);
    const ids = new Set((got.items || []).map((x) => String(x?.id || "").toLowerCase()));
    const inGithub = recs.filter((r) => ids.has(String(r.id).toLowerCase())).length;
    files[f] = { queued: recs.length, inGithub, wouldCreate: recs.length - inGithub, readOk: Boolean(got.ok) };
  }
  await kv.put(
    FLUSH_LAST_KEY,
    JSON.stringify({ at: new Date().toISOString(), mode: "dry", entries: keys.length, bad, files }),
  );
  for (const name of keys) await kv.delete(name).catch(() => undefined);
}

/** Telegram text to a chat (bot token from the existing Worker secrets). Never throws. */
async function tgText(env, chatId, text) {
  const token = String(env?.BOT_TOKEN || env?.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 3900), disable_web_page_preview: true }),
    });
  } catch {
    /* report only */
  }
}

/** Ask GitHub to run videy-thumbs.yml now (same token as the bot). Never throws. */
async function triggerThumbs(env) {
  const token = String(env?.GITHUB_TOKEN || env?.GH_TOKEN || "").trim();
  if (!token) return "no-token";
  try {
    const r = await fetch(
      "https://api.github.com/repos/fashfdhgacd/koleksi_dr_pinguinn/actions/workflows/videy-thumbs.yml/dispatches",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "kdp-telegram-bot",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: "main" }),
      },
    );
    return String(r.status);
  } catch {
    return "error";
  }
}

/**
 * Real flush (mode "1"): all queued Videy records -> ONE upsertVideosBatch per feed file (one commit,
 * one deploy). Entries are deleted only after GitHub accepted them; on failure they stay for the next
 * run and the uploader is told. Each chat gets a final report.
 */
async function realFlush(env) {
  const kv = env?.ANALYTICS_KV;
  if (!kv?.list) return;
  const listed = await kv.list({ prefix: "bot:q:", limit: 500 });
  const keys = (listed?.keys || []).map((k) => k.name);
  // At most one real flush (= one commit + one deploy) per ~hour, whatever the cron schedule is
  // (a deploy may keep an older */10 trigger).
  const lastReal = Number((await kv.get(FLUSH_REAL_KEY)) || 0);
  if (keys.length && Date.now() - lastReal < FLUSH_EVERY_MS) {
    await kv.put(
      FLUSH_LAST_KEY,
      JSON.stringify({ at: new Date().toISOString(), mode: "1", entries: keys.length, waiting: true, nextAfter: new Date(lastReal + FLUSH_EVERY_MS).toISOString() }),
    );
    return;
  }
  if (keys.length) await kv.put(FLUSH_REAL_KEY, String(Date.now()));
  if (!keys.length) {
    await kv.put(FLUSH_LAST_KEY, JSON.stringify({ at: new Date().toISOString(), mode: "1", entries: 0 }));
    return;
  }
  const byFile = new Map();
  for (const name of keys) {
    try {
      const v = JSON.parse((await kv.get(name)) || "null");
      if (!v?.record?.id) continue;
      const f = String(v.fileName || "videos.json");
      byFile.set(f, [...(byFile.get(f) || []), { name, ...v }]);
    } catch {
      /* unreadable entry: leave it */
    }
  }
  // Videy only: re-check each queued file right before it goes live; dead (404 on 3 tries) -> stored hidden.
  for (const entries of byFile.values()) {
    for (const x of entries) {
      if (String(x.record?.category || "") !== "videy" || x.record.hidden) continue;
      try {
        if (await isDeadVideyFile(x.record.id)) x.record = { ...x.record, hidden: true, hidden_reason: DEAD_VIDEY_REASON };
      } catch {
        /* treat as alive */
      }
    }
  }
  const files = {};
  const perChat = new Map();
  let committed = 0;
  for (const [f, entries] of byFile) {
    let result;
    try {
      result = await upsertVideosBatch(env, f, entries.map((x) => x.record));
    } catch (err) {
      result = { ok: false, errors: [String(err?.message || err)] };
    }
    files[f] = { queued: entries.length, ok: Boolean(result?.ok), created: result?.created || 0, skipped: result?.skipped || 0, errors: (result?.errors || []).slice(0, 3) };
    const created = new Set((result?.records || []).map((r) => String(r.id || "").toLowerCase()));
    for (const x of entries) {
      const chat = String(x.chatId || "");
      const lines = perChat.get(chat) || [];
      if (!result?.ok) lines.push(`⚠️ ${x.record.id} — ${x.title || ""} (gagal, dicoba lagi flush berikutnya)`);
      else if (created.has(String(x.record.id).toLowerCase()) && x.record.hidden_reason === DEAD_VIDEY_REASON)
        lines.push(`🙈 ${x.record.id} — ${x.title || ""} · disembunyikan: video mati`);
      else if (created.has(String(x.record.id).toLowerCase())) lines.push(`✅ ${x.record.id} — ${x.title || ""}`);
      else lines.push(`⏭️ ${x.record.id} — ${x.title || ""} (sudah ada)`);
      perChat.set(chat, lines);
    }
    if (result?.ok) {
      committed += result.created || 0;
      for (const x of entries) await kv.delete(x.name).catch(() => undefined);
    }
  }
  const thumbs = committed > 0 ? await triggerThumbs(env) : "skip";
  await kv.put(
    FLUSH_LAST_KEY,
    JSON.stringify({ at: new Date().toISOString(), mode: "1", entries: keys.length, committed, thumbs, files }),
  );
  for (const [chat, lines] of perChat) {
    await tgText(env, chat, [`Flush antrean selesai: ${lines.filter((l) => l.startsWith("✅")).length} tayang setelah deploy (±3 menit).`, "", ...lines].join("\n"));
  }
}

/**
 * Videy thumbnails without relying on GitHub's (unreliable) schedule:
 *  - every ~2 h the cron dispatches videy-thumbs.yml (it skips ffmpeg when nothing is missing);
 *  - commits made by that workflow (github-actions[bot]) do not trigger a Cloudflare deploy, so when
 *    a new thumbs commit shows up, the cron writes a tiny stamp file with the bot token
 *    (data/.thumbs-deploy.json), which does deploy. At most one such commit per new thumbs commit.
 */
const THUMBS_DISPATCH_KEY = "thumbs:dispatchAt";
const THUMBS_SEEN_KEY = "thumbs:deployedSha";
const THUMBS_STATUS_KEY = "thumbs:status";
const THUMBS_EVERY_MS = 115 * 60_000;
const REPO_API = "https://api.github.com/repos/fashfdhgacd/koleksi_dr_pinguinn";

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "kdp-telegram-bot",
    "Content-Type": "application/json",
  };
}

const DEAD_VIDEY_REASON = "dead-videy-mp4";

function videyFileUrl(id) {
  const s = String(id || "");
  return `https://cdn.videy.co/${s}.${s.length === 9 && s.endsWith("2") ? "mov" : "mp4"}`;
}

/** True only when cdn.videy.co answers 404/410 on 3 tries (cache-busted, ~1.5 s apart). */
async function isDeadVideyFile(id) {
  if (!/^[A-Za-z0-9]{4,40}$/.test(String(id || ""))) return false;
  for (let t = 0; t < 3; t++) {
    if (t) await new Promise((r) => setTimeout(r, 1500));
    try {
      const r = await fetch(`${videyFileUrl(id)}?cb=${Date.now()}${t}`, {
        headers: { Range: "bytes=0-1", "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
      });
      try {
        await r.body?.cancel();
      } catch {
        /* ignore */
      }
      if (r.status !== 404 && r.status !== 410) return false;
    } catch {
      return false;
    }
  }
  return true;
}


async function thumbsTick(env) {
  const kv = env?.ANALYTICS_KV;
  const token = String(env?.GITHUB_TOKEN || env?.GH_TOKEN || "").trim();
  if (!kv || !token) return;
  const status = {};
  const lastDispatch = Number((await kv.get(THUMBS_DISPATCH_KEY)) || 0);
  if (Date.now() - lastDispatch > THUMBS_EVERY_MS) {
    status.dispatch = await triggerThumbs(env);
    await kv.put(THUMBS_DISPATCH_KEY, String(Date.now()));
  }
  // Latest commit touching public/videy-thumbs.
  const [r, rh] = await Promise.all(
    ["public/videy-thumbs", "src/lib/catalog/hidden-ids.js"].map((p) =>
      fetch(`${REPO_API}/commits?path=${p}&per_page=1&sha=main`, { headers: ghHeaders(token) }),
    ),
  );
  if (r.ok && rh.ok) {
    const [c] = await r.json();
    const [ch] = await rh.json();
    // Only bot (workflow) commits need the stamp; user-token commits deploy on their own.
    const bot = (x) => /github-actions/i.test(String(x?.author?.login || x?.commit?.author?.name || ""));
    const pick = [c, ch].filter(bot).sort((a, b) => String(b?.commit?.committer?.date || "").localeCompare(String(a?.commit?.committer?.date || "")))[0];
    const sha = String(pick?.sha || (await kv.get(THUMBS_SEEN_KEY)) || "");
    const seen = String((await kv.get(THUMBS_SEEN_KEY)) || "");
    status.thumbsSha = sha.slice(0, 7);
    if (sha && sha !== seen) {
      const p = `${REPO_API}/contents/data/.thumbs-deploy.json`;
      const cur = await fetch(`${p}?ref=main`, { headers: ghHeaders(token) });
      const curSha = cur.ok ? (await cur.json())?.sha : undefined;
      const body = {
        message: "chore: deploy new Videy thumbnails",
        content: btoa(JSON.stringify({ thumbsCommit: sha, at: new Date().toISOString() }) + "\n"),
        branch: "main",
        ...(curSha ? { sha: curSha } : {}),
      };
      const put = await fetch(p, { method: "PUT", headers: ghHeaders(token), body: JSON.stringify(body) });
      status.stamp = String(put.status);
      if (put.ok) await kv.put(THUMBS_SEEN_KEY, sha);
    }
  } else {
    status.commits = String(r.status);
  }
  await kv.put(THUMBS_STATUS_KEY, JSON.stringify({ at: new Date().toISOString(), ...status }));
}

async function cronStatus(env) {
  let last = null;
  let flush = null;
  let thumbs = null;
  try {
    last = (await env?.ANALYTICS_KV?.get(CRON_LAST_KEY)) || null;
    flush = (await env?.ANALYTICS_KV?.get(FLUSH_LAST_KEY)) || null;
    thumbs = (await env?.ANALYTICS_KV?.get(THUMBS_STATUS_KEY)) || null;
  } catch {
    last = null;
  }
  const mode = await queueMode(env);
  return new Response(JSON.stringify({ ok: true, last, mode, flush, thumbs }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export default {
  ...nitroHandler,
  async scheduled(event, env, context) {
    try {
      await env?.ANALYTICS_KV?.put(
        CRON_LAST_KEY,
        JSON.stringify({ at: new Date().toISOString(), cron: event?.cron || "" }),
      );
    } catch {
      /* heartbeat only */
    }
    try {
      const mode = await queueMode(env);
      if (mode === "dry") await dryFlush(env);
      else if (mode === "1") {
        // Shadow copies left from dry mode are no longer needed.
        await dryFlush(env).catch(() => undefined);
        await realFlush(env);
      }
    } catch (err) {
      try {
        await env?.ANALYTICS_KV?.put(
          FLUSH_LAST_KEY,
          JSON.stringify({ at: new Date().toISOString(), error: String(err?.message || err).slice(0, 200) }),
        );
      } catch {
        /* ignore */
      }
    }
    try {
      await thumbsTick(env);
    } catch (err) {
      try {
        await env?.ANALYTICS_KV?.put(THUMBS_STATUS_KEY, JSON.stringify({ at: new Date().toISOString(), error: String(err?.message || err).slice(0, 200) }));
      } catch {
        /* ignore */
      }
    }
    if (typeof nitroHandler.scheduled === "function") {
      try {
        await nitroHandler.scheduled(event, env, context);
      } catch {
        /* keep cron alive */
      }
    }
  },
  async fetch(request, env, context) {
    if (hasMalformedPath(request)) return badRequest();
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return nitroHandler.fetch(request, env, context);
    }
    if (url.pathname === "/api/cron-status" && request.method === "GET") return cronStatus(env);
    if (request.method === "POST" && (url.pathname === "/api/owner-videy" || url.pathname === "/api/owner-tools")) {
      const req = url.pathname === "/api/owner-tools" ? await brandEditRequest(request).catch(() => request) : request;
      const response = await nitroHandler.fetch(req, env, context);
      await purgeAfterEdit(request, response, env, context).catch(() => undefined);
      return response;
    }
    // Owner hide/unhide (POST /api/player-log, action owner-hide): purge the cached watch page so a
    // hidden video disappears now instead of after the 6 h watch freshness. Only owner requests
    // (key header) are inspected; visitor logs pass straight through.
    if (request.method === "POST" && url.pathname === "/api/player-log" && request.headers.has("x-online-key")) {
      const response = await nitroHandler.fetch(request, env, context);
      await purgeAfterEdit(request, response, env, context).catch(() => undefined);
      return response;
    }
    if (url.pathname.startsWith("/thumb/") && request.method === "GET") {
      let res;
      try {
        res = await cachedFetch(request, env, context, url);
      } catch {
        res = await nitroHandler.fetch(request, env, context);
      }
      return realThumb(env, url, res).catch(() => res);
    }
    try {
      return await cachedFetch(request, env, context, url);
    } catch {
      return nitroHandler.fetch(request, env, context);
    }
  },
};
