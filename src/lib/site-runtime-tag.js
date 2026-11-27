// Server-only: first-party copy of the Wynq anti-adblock tag (segment 0SBV0CWY9FC1A, banners
// 0SBV7RF557074 / 0SBV80XGCJ8C1 in grid slots 2 and 5). The Worker entry (scripts/cf-worker-entry.mjs)
// answers RUNTIME_TAG_PATH from here before Nitro starts; pages load it with one <script async src>.
//
// Why a first-party script instead of inlining into the HTML: pages are edge-cached for 10 min (home),
// 30 min (categories) and 6 h (watch, served stale up to 7 days), which would pin an old tag for hours,
// and the tag is ~0.5 MB, which would bloat every page. The script itself stays fresh for ~5 min:
//   - per isolate: module memo, TAG_TTL_S
//   - per data centre: Cache API (caches.default), keyed by the FULL upstream URL, TAG_TTL_S
//   - browser: Cache-Control max-age=TAG_TTL_S
// No KV, no env vars. Fail open: a failed / non-200 / empty fetch serves an empty script (short cache)
// and the previous good copy is not reused past its TTL.
// Nothing in this file's names reaches the browser except RUNTIME_TAG_PATH (neutral on purpose).

export const TAG_UPSTREAM_URL =
  "https://worker.rapidfire.cc/antiAdBlock?v=1&pubid=0SB9Y04YAH7RE&output=js&sids=0SBV0CWY9FC1A&im=inline";
/** Public path of the first-party script. Keep it neutral (no vendor / "ad" words); must not be under
 * /assets/ (that prefix is served immutable for a year by server/middleware/cache-headers.ts). */
export const RUNTIME_TAG_PATH = "/static/qv8m3k.js";
export const TAG_TTL_S = 300;
/** Empty-script cache after a failed fetch, so a short upstream outage retries soon. */
export const TAG_FAIL_TTL_S = 60;
const FETCH_TIMEOUT_MS = 5000;

/** @type {{ url: string, body: string, at: number } | null} */
let memo = null;

/** Test hook. */
export function resetTagMemo() {
  memo = null;
}

/**
 * Returns the current tag JS ("" when unavailable). Never throws.
 * @param {{ fetchImpl?: typeof fetch, cache?: Cache | null, now?: () => number, url?: string, waitUntil?: (p: Promise<unknown>) => void }} [opts]
 * @returns {Promise<string>}
 */
export async function getRuntimeTag(opts = {}) {
  const url = opts.url || TAG_UPSTREAM_URL;
  const now = opts.now || Date.now;
  const fetchImpl = opts.fetchImpl || fetch;
  const cache = opts.cache === undefined ? defaultCache() : opts.cache;
  if (memo && memo.url === url && now() - memo.at < TAG_TTL_S * 1000) return memo.body;

  const key = new Request(url, { method: "GET" });
  if (cache) {
    try {
      const hit = await cache.match(key);
      if (hit && hit.ok) {
        const body = await hit.text();
        const at = Number(hit.headers.get("x-tag-at")) || now();
        if (body && now() - at < TAG_TTL_S * 1000) {
          memo = { url, body, at };
          return body;
        }
      }
    } catch {
      /* cache miss */
    }
  }

  let body = "";
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(FETCH_TIMEOUT_MS) : undefined,
    });
    if (res.status === 200) body = (await res.text()).trim();
  } catch {
    body = "";
  }
  if (!body) {
    memo = null;
    return "";
  }
  const at = now();
  memo = { url, body, at };
  if (cache) {
    const put = cache
      .put(
        key,
        new Response(body, {
          status: 200,
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": `public, max-age=${TAG_TTL_S}`,
            "x-tag-at": String(at),
          },
        }),
      )
      .catch(() => undefined);
    if (opts.waitUntil) opts.waitUntil(put);
    else await put;
  }
  return body;
}

/**
 * Response for RUNTIME_TAG_PATH.
 * @param {Parameters<typeof getRuntimeTag>[0]} [opts]
 * @returns {Promise<Response>}
 */
export async function runtimeTagResponse(opts = {}) {
  const body = await getRuntimeTag(opts);
  const ttl = body ? TAG_TTL_S : TAG_FAIL_TTL_S;
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": `public, max-age=${ttl}`,
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex",
    },
  });
}

/** @returns {Cache | null} */
function defaultCache() {
  try {
    // caches.default is the Cloudflare Workers shared cache (not in the DOM CacheStorage type).
    const c = /** @type {any} */ (globalThis).caches;
    return c && c.default ? /** @type {Cache} */ (c.default) : null;
  } catch {
    return null;
  }
}
