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

/** Longest time (s) a cached HTML page counts as fresh. */
const HTML_FRESH_MAX = 180;
/** Longest stale window (s) for HTML when the page sets a larger stale-while-revalidate. */
const HTML_STALE_MAX = 86_400;
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
function cachePolicy(response) {
  if (response.status !== 200) return null;
  if (response.headers.has("set-cookie")) return null;
  const cc = response.headers.get("cache-control") || "";
  if (!/\bpublic\b/i.test(cc) || /\b(private|no-store|no-cache)\b/i.test(cc)) return null;
  const ttl = directive(cc, "s-maxage") ?? directive(cc, "max-age");
  if (!ttl || ttl <= 0) return null;
  const type = response.headers.get("content-type") || "";
  if (type.includes("text/html")) {
    const swr = directive(cc, "stale-while-revalidate") || 0;
    return { fresh: Math.min(ttl, HTML_FRESH_MAX), stale: Math.min(swr, HTML_STALE_MAX) };
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
  const policy = cachePolicy(response);
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

  if (hit) {
    const at = Number(hit.headers.get("x-edge-at") || 0);
    const fresh = Number(hit.headers.get("x-edge-fresh") || 0);
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
  if (!cachePolicy(response)) return response;
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
  if (!data?.ok || !/^[A-Za-z0-9_-]{3,64}$/.test(id) || (!data.title && !data.category)) return;
  const keys = purgeKeys(env, id, typeof data.category === "string" ? data.category : "");
  const run = () => Promise.all(keys.map((k) => cache.delete(k).catch(() => false)));
  context.waitUntil(
    run().then(() => new Promise((r) => setTimeout(r, 29_000))).then(run).catch(() => undefined),
  );
}

export default {
  ...nitroHandler,
  async fetch(request, env, context) {
    if (hasMalformedPath(request)) return badRequest();
    let url;
    try {
      url = new URL(request.url);
    } catch {
      return nitroHandler.fetch(request, env, context);
    }
    if (request.method === "POST" && (url.pathname === "/api/owner-videy" || url.pathname === "/api/owner-tools")) {
      const req = url.pathname === "/api/owner-tools" ? await brandEditRequest(request).catch(() => request) : request;
      const response = await nitroHandler.fetch(req, env, context);
      await purgeAfterEdit(request, response, env, context).catch(() => undefined);
      return response;
    }
    try {
      return await cachedFetch(request, env, context, url);
    } catch {
      return nitroHandler.fetch(request, env, context);
    }
  },
};
