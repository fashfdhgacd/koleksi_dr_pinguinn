import { createFileRoute } from "@tanstack/react-router";
import { resolvePostersBucket } from "@/lib/poster-r2";
import { fixDmmCover, javCoverFromTitle } from "@/lib/catalog/local-shared";
import { checkImage, isPlaceholderMd5 } from "@/lib/image-guard";
import { resolvePuterinImage } from "@/lib/puterin-poster";
import { bysePosterUrls, isDeadPosterUrl, luluPosterUrls, metaImage, mxdropFromHtml, typedPosterKey } from "@/lib/poster-sources.js";

/** Putarin item for an id (putarin-latest feed), loaded lazily only on a full miss. */
async function putarinItem(id: string): Promise<{ id?: string; title?: string; category?: string } | null> {
  if (!/^[A-Za-z0-9]{6,20}$/.test(id)) return null;
  const feed = (await import("../../data/putarin-latest.json").then((m) => m.default).catch(() => [])) as unknown;
  const list = (Array.isArray(feed) ? feed : ((feed as { items?: unknown[] })?.items ?? [])) as Array<{ id?: string; title?: string; category?: string }>;
  return list.find((it) => it?.id === id) || null;
}

// Poster maps are large: load them lazily (only on an edge-cache + R2 miss) instead of parsing
// them in every isolate at boot.
async function sourceFor(id: string): Promise<string> {
  const [posters, javPosters, latestPosters, folderBatch20261007, drpBokepBatch, itemOverrides] = await Promise.all([
    import("@/lib/catalog/posters.json").then((m) => m.default),
    import("@/lib/catalog/jav-posters.json").then((m) => m.default),
    import("../../data/latest-posters.json").then((m) => m.default),
    import("@/lib/catalog/folder-batch-20261007.json").then((m) => m.default),
    import("../../data/drp-bokep.json").then((m) => m.default),
    import("@/lib/catalog/overrides.json").then((m) => m.default),
  ]);
  const maps = [posters, javPosters, latestPosters] as Array<Record<string, string>>;
  for (const map of maps) {
    const url = map?.[id];
    if (typeof url === "string" && url.startsWith("http")) return fixDmmCover(url);
  }
  const ov = (itemOverrides as Record<string, { poster?: string }>)[id];
  if (ov && typeof ov.poster === "string" && ov.poster.startsWith("http")) return ov.poster;
  // Folder-ingest batches (and the /kategori/bokep import) carry their poster on the item itself.
  for (const it of [
    ...(folderBatch20261007 as Array<{ id?: string; poster?: string }>),
    ...(drpBokepBatch as Array<{ id?: string; poster?: string }>),
  ]) {
    if (it?.id === id && typeof it.poster === "string" && it.poster.startsWith("http")) return it.poster;
  }
  return "";
}

function keyFor(id: string): string {
  return typedPosterKey(id);
}

const PAGE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function pageHtml(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { accept: "text/html", "user-agent": PAGE_UA },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";
    const text = await res.text();
    if (/Just a moment|challenge-platform/i.test(text.slice(0, 600))) return "";
    return text.slice(0, 400_000);
  } catch {
    return "";
  }
}

/** Poster URLs /thumb can resolve from the id alone when the stored map has nothing live. */
async function extraPosterUrls(id: string): Promise<string[]> {
  const mx = id.match(/^mx-([A-Za-z0-9]{4,40})$/);
  if (mx) {
    const { poster } = mxdropFromHtml(await pageHtml(`https://mxdrop.click/e/${mx[1]}`));
    return poster ? [poster] : [];
  }
  const lu = id.match(/^lu-([A-Za-z0-9]{4,40})$/);
  if (lu) return luluPosterUrls(lu[1]);
  const by = id.match(/^by-([A-Za-z0-9]{4,40})$/);
  if (by) return bysePosterUrls(by[1]);
  const dd = id.match(/^dd-([A-Za-z0-9]{4,40})$/);
  if (dd) {
    const image = metaImage(await pageHtml(`https://playmogo.com/e/${dd[1]}`));
    return image ? [image] : [];
  }
  return [];
}

async function posterIngestKey(): Promise<string> {
  try {
    const mod = (await import("cloudflare:workers")) as { env?: Record<string, unknown> };
    const v = mod.env?.PUTARIN_API_KEY;
    if (typeof v === "string" && v.trim()) return v.trim();
  } catch {
    /* node */
  }
  return String(process.env.PUTARIN_API_KEY || "").trim();
}

async function sameSecret(given: string, expect: string): Promise<boolean> {
  if (!given || !expect) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expect)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function sniffType(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf.slice(0, 16));
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return "image/webp";
  return "";
}

function imageResponse(body: BodyInit, type: string): Response {
  return new Response(body, {
    headers: {
      "content-type": type,
      // Saved in R2 once, never changes for an id: keep it for 30 days in browser and edge cache.
      "cache-control": "public, max-age=2592000, stale-while-revalidate=604800",
    },
  });
}

/**
 * No stored/remote poster (or the host is dead): redirect to the site's own brand poster
 * (public/brand-poster-6x5.jpg, a static asset served without the Worker) instead of a 404, so
 * Google's video indexing never sees an unreachable thumbnail. The card (thumb.tsx) sees the
 * redirected URL and draws the logo centered (object-contain) instead of cropping it as a photo.
 * Short cache + not saved to R2, so a real poster added later still takes over.
 */
async function fallback(request: Request): Promise<Response> {
  return new Response(null, {
    status: 302,
    headers: {
      location: new URL("/brand-poster-6x5.jpg", request.url).toString(),
      "cache-control": "public, max-age=300",
      "x-thumb-fallback": "1",
    },
  });
}

/** Fallback redirect kept in the edge cache (5 min) so repeated misses skip R2 and the poster lookup. */
async function cachedFallback(request: Request): Promise<Response> {
  const res = await fallback(request);
  try {
    await caches.default.put(request, res.clone());
  } catch {
    /* cache optional */
  }
  return res;
}

/**
 * Videy videos have no remote poster: their frame is a static file grabbed by the videy-thumbs
 * workflow (public/videy-thumbs/<id>.jpg). /thumb/<id> (e.g. /pemilik "Upload terbaru") serves
 * that file through the static assets binding instead of the brand placeholder.
 */
async function videyStatic(id: string, request: Request): Promise<Response | null> {
  if (!/^[A-Za-z0-9]{4,40}$/.test(id)) return null;
  try {
    const mod = (await import("cloudflare:workers")) as { env?: { ASSETS?: { fetch: (r: Request | string) => Promise<Response> } } };
    const assets = mod.env?.ASSETS;
    if (!assets) return null;
    const res = await assets.fetch(new Request(new URL(`/videy-thumbs/${id}.jpg`, request.url).toString()));
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 800 || sniffType(buf) !== "image/jpeg") return null;
    return imageResponse(buf, "image/jpeg");
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/thumb/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        try {
          const id = String(params.id || "").replace(/\.(jpg|jpeg|webp|png)$/i, "");
          if (!id) return new Response(null, { status: 404 });
          let hit: Response | null = null;
          try {
            hit = (await caches.default.match(request)) || null;
          } catch {
            hit = null;
          }
          if (hit) return hit;

          const bucket = await resolvePostersBucket().catch(() => null);
          const key = keyFor(id);
          if (!key) return new Response(null, { status: 404 });
          if (bucket) {
            const saved = await bucket.get(key).catch(() => null);
            // Self-heal: a copy whose md5 (R2 etag) is a known placeholder is deleted and re-resolved.
            if (saved && isPlaceholderMd5((saved as { etag?: string }).etag)) {
              await (bucket as { delete?: (k: string) => Promise<unknown> }).delete?.(key).catch(() => undefined);
            } else if (saved) {
              const res = imageResponse(saved.body, saved.httpMetadata?.contentType || "image/jpeg");
              try {
                await caches.default.put(request, res.clone());
              } catch {
                /* cache optional */
              }
              return res;
            }
          }

          let source = await sourceFor(id);
          // A stored anipop (or other dead-host) URL used to win here and skip every later source.
          if (isDeadPosterUrl(source)) source = "";
          // Multi-server main page without a poster of its own: the poster borrowed from another copy
          // of the same video (local-cache.ts buildIndexes). Stored in R2 under this id like any other.
          if (!source) {
            source = await import("@/lib/catalog/local-cache")
              .then((m) => m.mergedPosterOf(id))
              .catch(() => "");
            if (isDeadPosterUrl(source)) source = "";
          }
          // Putarin uploads carry no poster: try the DMM cover from a JAV code in the title, else the
          // embed's own player.image (same decrypt as /api/puterin-thumb). Stored to R2 once.
          const pItem = source ? null : await putarinItem(id);
          if (pItem) {
            const dmm = javCoverFromTitle(String(pItem.title || ""));
            if (dmm) source = dmm;
            else {
              const pt = await resolvePuterinImage(id);
              if (pt && !isDeadPosterUrl(pt.url)) {
                if (bucket) await bucket.put(key, pt.buf, { httpMetadata: { contentType: pt.type } }).catch(() => undefined);
                const res = imageResponse(pt.buf, pt.type);
                try {
                  await caches.default.put(request, res.clone());
                } catch {
                  /* cache optional */
                }
                return res;
              }
            }
          }
          const tryUrls = [source, ...(source ? [] : await extraPosterUrls(id))].filter((url) => url && !isDeadPosterUrl(url));
          for (const url of tryUrls.slice(0, 3)) {
            const remote = await fetch(url, {
              headers: { "user-agent": "kdp-poster/1" },
              signal: AbortSignal.timeout(8000),
            }).catch(() => null);
            // DMM answers a missing cover with a redirect to its "NOW PRINTING" image: never save that.
            if (!remote?.ok) continue;
            const buf = await remote.arrayBuffer().catch(() => null);
            // Central guard (image-guard.ts): placeholder URL/md5, < 3 KB, non-image never reach R2.
            const verdict = await checkImage(buf, remote.url || url);
            if (!buf || !verdict.ok) continue;
            if (bucket) {
              await bucket.put(key, buf, { httpMetadata: { contentType: verdict.type } }).catch(() => undefined);
            }
            const res = imageResponse(buf, verdict.type);
            try {
              await caches.default.put(request, res.clone());
            } catch {
              /* cache optional */
            }
            return res;
          }
          const vy = await videyStatic(id, request);
          if (!vy) return await cachedFallback(request);
          try {
            await caches.default.put(request, vy.clone());
          } catch {
            /* cache optional */
          }
          return vy;
        } catch {
          return fallback(request);
        }
      },
      // GitHub poster backfill only. Same R2 key as GET. Auth is the Putarin key the Worker already has.
      POST: async ({ params, request }) => {
        const id = String(params.id || "").replace(/\.(jpg|jpeg|webp|png)$/i, "");
        const key = keyFor(id);
        if (!key) return new Response(null, { status: 404 });
        const header = String(request.headers.get("authorization") || "");
        const given = header.replace(/^Bearer\s+/i, "").trim();
        if (!(await sameSecret(given, await posterIngestKey()))) return new Response(null, { status: 404 });
        const len = Number(request.headers.get("content-length") || 0);
        if (len > 500_000) return Response.json({ ok: false, error: "too-big" }, { status: 413, headers: { "cache-control": "no-store" } });
        const buf = await request.arrayBuffer().catch(() => null);
        if (!buf || buf.byteLength > 500_000) return Response.json({ ok: false, error: "too-big" }, { status: 413, headers: { "cache-control": "no-store" } });
        const verdict = await checkImage(buf, "");
        if (!verdict.ok) return Response.json({ ok: false, error: verdict.reason }, { status: 422, headers: { "cache-control": "no-store" } });
        const bucket = await resolvePostersBucket().catch(() => null);
        if (!bucket) return Response.json({ ok: false, error: "r2_unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
        await bucket.put(key, buf, { httpMetadata: { contentType: verdict.type } });
        return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
