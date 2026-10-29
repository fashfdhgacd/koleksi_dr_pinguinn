/**
 * RSS 2.0 feed /rss.xml: 50 video terbaru dengan tanggal terbit asli + link balik ke halaman tonton.
 * Situs penyalin yang mengambil feed ini ikut membawa link ke koleksidrpinguin.com (atribusi).
 * Dibangun dari katalog in-memory, di-cache per colo (Cache API) 1 jam: tanpa KV/D1, tanpa timer.
 */
import { listSitemapWatchEntries } from "../../src/lib/catalog/sitemap-entries";
import { SITE_NAME, SITE_ORIGIN, cleanDisplayTitle, seoVideoThumbnail, videoSeoDescription } from "../../src/lib/seo";

interface RssEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

const FEED_SIZE = 50;
const CACHE_CONTROL = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function rfc822(day?: string): string | undefined {
  if (!day) return undefined;
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t).toUTCString() : undefined;
}

async function buildRss(): Promise<string> {
  const entries = (await listSitemapWatchEntries())
    .filter((e) => e.lastmod)
    .slice()
    .sort((a, b) => (b.lastmod || "").localeCompare(a.lastmod || "") || a.id.localeCompare(b.id))
    .slice(0, FEED_SIZE);
  const items = entries.map((e) => {
    const link = `${SITE_ORIGIN}/watch/${encodeURIComponent(e.id)}`;
    const title = cleanDisplayTitle(e.title || "") || "Video";
    const desc = videoSeoDescription({
      id: e.id,
      title,
      category: e.category || null,
      duration: e.duration ?? null,
      year: e.lastmod ? e.lastmod.slice(0, 4) : null,
    });
    const thumb = seoVideoThumbnail(e.id, e.thumbnail);
    const date = rfc822(e.lastmod);
    return [
      "    <item>",
      `      <title>${esc(title)}</title>`,
      `      <link>${esc(link)}</link>`,
      `      <guid isPermaLink="true">${esc(link)}</guid>`,
      date ? `      <pubDate>${date}</pubDate>` : "",
      `      <description>${esc(`${desc} Sumber asli: ${link}`)}</description>`,
      `      <enclosure url="${esc(thumb)}" type="image/jpeg" length="0"/>`,
      "    </item>",
    ]
      .filter(Boolean)
      .join("\n");
  });
  const last = rfc822(entries[0]?.lastmod) || new Date().toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE_NAME)} - Video Terbaru</title>
    <link>${SITE_ORIGIN}/</link>
    <atom:link href="${SITE_ORIGIN}/rss.xml" rel="self" type="application/rss+xml"/>
    <description>Video terbaru dari ${esc(SITE_NAME)}, situs resmi koleksidrpinguin.com. Konten 18+.</description>
    <language>id</language>
    <lastBuildDate>${last}</lastBuildDate>
${items.join("\n")}
  </channel>
</rss>
`;
}

type EdgeCache = { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> };

function edgeCache(): EdgeCache | undefined {
  return (globalThis as unknown as { caches?: { default?: EdgeCache } }).caches?.default;
}

function rssResponse(method: string, body: BodyInit | null, extra?: Record<string, string>): Response {
  return new Response(method === "HEAD" ? null : body, {
    status: 200,
    headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": CACHE_CONTROL, ...extra },
  });
}

export default async function rssMiddleware(
  event: RssEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const path = event.url.pathname;
  if (path !== "/rss.xml" && path !== "/feed.xml" && path !== "/feed") return next();
  const method = (event.req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return next();
  if (path !== "/rss.xml") {
    return new Response(null, { status: 301, headers: { location: `${SITE_ORIGIN}/rss.xml` } });
  }
  const edge = edgeCache();
  const key = new Request(`${SITE_ORIGIN}/rss.xml`);
  if (edge) {
    const hit = await edge.match(key).catch(() => undefined);
    if (hit) return rssResponse(method, hit.body, { "x-rss-cache": "HIT" });
  }
  try {
    const xml = await buildRss();
    if (edge) await edge.put(key, rssResponse("GET", xml)).catch(() => undefined);
    return rssResponse(method, xml);
  } catch {
    return new Response("feed error", { status: 503, headers: { "retry-after": "300" } });
  }
}
