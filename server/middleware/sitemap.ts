/**
 * Dynamic sitemap for Google Search Console.
 * Nitro middleware (Cloudflare) — do not keep static public/sitemap*.xml or they shadow this.
 * Includes Google video sitemap extension (video:video) for /watch entries.
 */
import { DEFAULT_PAGE_SIZE, type CategoryInfo } from "../../src/lib/catalog/types";
import { listListedCategories } from "../../src/lib/catalog/local";
import { listSitemapWatchEntries } from "../../src/lib/catalog/sitemap-entries";
import { RANKINGS, RANK_PERIODS, rankPeriodAvailable } from "../../src/lib/catalog/rankings";
import { SITE_ORIGIN, cleanDisplayTitle, seoVideoThumbnail, videoSeoDescription } from "../../src/lib/seo";

interface SitemapEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

/** Small child sitemaps (≤1000 URLs) so Google fetches/processes each quickly. */
const WATCH_CHUNK = 1_000;

const LEGAL_PATHS = ["/tentang", "/syarat", "/privasi", "/2257", "/dmca", "/kontak"] as const;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(loc: string, opts?: { changefreq?: string; priority?: string; lastmod?: string }): string {
  const parts = [`  <url>`, `    <loc>${escapeXml(loc)}</loc>`];
  if (opts?.lastmod) parts.push(`    <lastmod>${escapeXml(opts.lastmod)}</lastmod>`);
  if (opts?.changefreq) parts.push(`    <changefreq>${opts.changefreq}</changefreq>`);
  if (opts?.priority) parts.push(`    <priority>${opts.priority}</priority>`);
  parts.push(`  </url>`);
  return parts.join("\n");
}

/**
 * lastmod per listing page = upload date of the newest public video on it (the page content changes
 * when a video lands), so crawlers can tell which category pages actually changed.
 */
function listingLastmods(entries: Array<{ category?: string; lastmod?: string }>): { all?: string; bySlug: Map<string, string> } {
  const bySlug = new Map<string, string>();
  let all: string | undefined;
  for (const e of entries) {
    if (!e.lastmod) continue;
    if (!all || e.lastmod > all) all = e.lastmod;
    const slug = (e.category || "").toLowerCase();
    if (!slug) continue;
    const prev = bySlug.get(slug);
    if (!prev || e.lastmod > prev) bySlug.set(slug, e.lastmod);
  }
  return { all, bySlug };
}

function pageEntries(categories: CategoryInfo[], mods: { all?: string; bySlug: Map<string, string> }): string[] {
  const out: string[] = [
    urlEntry(`${SITE_ORIGIN}/`, { changefreq: "hourly", priority: "1.0", lastmod: mods.all }),
    urlEntry(`${SITE_ORIGIN}/kategori`, { changefreq: "daily", priority: "0.8", lastmod: mods.all }),
    // Ranking pages (src/lib/catalog/rankings.ts), refreshed with the 12-hourly stats.
    urlEntry(`${SITE_ORIGIN}/kategori/paling-ditonton`, { changefreq: "daily", priority: "0.8" }),
    urlEntry(`${SITE_ORIGIN}/kategori/paling-disukai`, { changefreq: "daily", priority: "0.8" }),
  ];
  // Minggu/Bulan ini tabs only once that period has data (until then they are noindex).
  for (const p of RANK_PERIODS) {
    if (!p.key) continue;
    for (const r of RANKINGS) {
      if (!rankPeriodAvailable(r.kind, p.period)) continue;
      out.push(urlEntry(`${SITE_ORIGIN}/kategori/${r.slug}?periode=${p.key}`, { changefreq: "daily", priority: "0.6" }));
    }
  }
  for (const c of categories) {
    out.push(
      urlEntry(`${SITE_ORIGIN}/kategori/${encodeURIComponent(c.slug)}`, {
        changefreq: "daily",
        priority: c.slug === "jav" || c.slug === "ai-plus" ? "0.8" : "0.7",
        lastmod: mods.bySlug.get(c.slug.toLowerCase()),
      }),
    );
  }
  // AI+ is the top landing page: its pagination pages 2..5 are indexable (same cap as
  // DEEP_PAGE_NOINDEX on the category route), so list them while they exist.
  const aiPlus = categories.find((c) => c.slug === "ai-plus");
  const aiPages = aiPlus && typeof aiPlus.count === "number" ? Math.min(5, Math.ceil(aiPlus.count / DEFAULT_PAGE_SIZE)) : 1;
  for (let n = 2; n <= aiPages; n++) {
    out.push(urlEntry(`${SITE_ORIGIN}/kategori/ai-plus?page=${n}`, { changefreq: "daily", priority: "0.5", lastmod: mods.bySlug.get("ai-plus") }));
  }
  for (const path of LEGAL_PATHS) {
    out.push(urlEntry(`${SITE_ORIGIN}${path}`, { changefreq: "monthly", priority: "0.3" }));
  }
  return out;
}

function videoBlock(item: Awaited<ReturnType<typeof listSitemapWatchEntries>>[number]): string {
  const pageUrl = `${SITE_ORIGIN}/watch/${encodeURIComponent(item.id)}`;
  const title = cleanDisplayTitle(item.title || "") || "Video";
  // id/duration/year make each description its own (seeded variants + real facts), not one template.
  const desc = videoSeoDescription({
    id: item.id,
    title,
    category: item.category || null,
    duration: item.duration ?? null,
    year: item.lastmod ? item.lastmod.slice(0, 4) : null,
  });
  const thumb = seoVideoThumbnail(item.id, item.thumbnail);
  const player = item.embed || pageUrl;
  const parts = [
    `    <video:video>`,
    `      <video:thumbnail_loc>${escapeXml(thumb)}</video:thumbnail_loc>`,
    `      <video:title>${escapeXml(title.slice(0, 100))}</video:title>`,
    `      <video:description>${escapeXml(desc.slice(0, 2048))}</video:description>`,
    `      <video:player_loc>${escapeXml(player)}</video:player_loc>`,
  ];
  if (item.duration && item.duration <= 28800) parts.push(`      <video:duration>${item.duration}</video:duration>`);
  if (item.lastmod) parts.push(`      <video:publication_date>${escapeXml(item.lastmod)}</video:publication_date>`);
  parts.push(`      <video:family_friendly>no</video:family_friendly>`, `    </video:video>`);
  return parts.join("\n");
}

function watchEntries(
  entries: Awaited<ReturnType<typeof listSitemapWatchEntries>>,
  start: number,
  end: number,
): string[] {
  return entries.slice(start, end).map((item) => {
    const base = urlEntry(`${SITE_ORIGIN}/watch/${encodeURIComponent(item.id)}`, {
      changefreq: "weekly",
      priority: "0.6",
      lastmod: item.lastmod,
    });
    return base.replace(/\n  <\/url>$/, `\n${videoBlock(item)}\n  </url>`);
  });
}

function wrapUrlset(body: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${body.join("\n")}\n</urlset>\n`;
}

function wrapIndex(locs: Array<{ loc: string; lastmod?: string }>): string {
  const rows = locs.map((x) => {
    const bits = [`  <sitemap>`, `    <loc>${escapeXml(x.loc)}</loc>`];
    if (x.lastmod) bits.push(`    <lastmod>${escapeXml(x.lastmod)}</lastmod>`);
    bits.push(`  </sitemap>`);
    return bits.join("\n");
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</sitemapindex>\n`;
}

function xmlResponse(method: string, xml: string): Response {
  return new Response(method === "HEAD" ? null : xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

function errorXml(method: string, message: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><!-- ${escapeXml(message)} --></urlset>\n`;
  return new Response(method === "HEAD" ? null : xml, {
    status: 500,
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}

async function buildPagesXml(): Promise<string> {
  const [categories, entries] = await Promise.all([listListedCategories({ sitemap: true }), listSitemapWatchEntries()]);
  return wrapUrlset(pageEntries(categories, listingLastmods(entries)));
}

async function buildWatchXml(chunkIndex?: number): Promise<{ xml: string; total: number; chunks: number }> {
  const entries = await listSitemapWatchEntries();
  const chunks = Math.max(1, Math.ceil(entries.length / WATCH_CHUNK));
  const idx = chunkIndex == null ? 0 : chunkIndex;
  if (idx < 0 || idx >= chunks) {
    return { xml: wrapUrlset([]), total: entries.length, chunks };
  }
  const start = idx * WATCH_CHUNK;
  const end = Math.min(entries.length, start + WATCH_CHUNK);
  return {
    xml: wrapUrlset(watchEntries(entries, start, end)),
    total: entries.length,
    chunks,
  };
}

function maxLastmod(list: Array<{ lastmod?: string }>): string | undefined {
  let best: string | undefined;
  for (const e of list) if (e.lastmod && (!best || e.lastmod > best)) best = e.lastmod;
  return best;
}

async function buildRootXml(): Promise<string> {
  // Always a sitemap index: pages + watch chunks of ≤1000 URLs, ordered by popularity.
  const entries = await listSitemapWatchEntries();
  const watchChunks = Math.max(1, Math.ceil(Math.max(entries.length, 1) / WATCH_CHUNK));
  const locs: Array<{ loc: string; lastmod?: string }> = [
    { loc: `${SITE_ORIGIN}/sitemap-pages.xml`, lastmod: maxLastmod(entries) },
  ];
  for (let i = 1; i <= watchChunks; i++) {
    const slice = entries.slice((i - 1) * WATCH_CHUNK, i * WATCH_CHUNK);
    locs.push({ loc: `${SITE_ORIGIN}/sitemap-watch-${i}.xml`, lastmod: maxLastmod(slice) });
  }
  return wrapIndex(locs);
}

type EdgeCache = { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> };

function edgeCache(): EdgeCache | undefined {
  return (globalThis as unknown as { caches?: { default?: EdgeCache } }).caches?.default;
}

export default async function sitemapMiddleware(
  event: SitemapEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return next();

  const path = event.url.pathname;
  const isRoot = path === "/sitemap.xml";
  const isPages = path === "/sitemap-pages.xml";
  const isWatch = path === "/sitemap-watch.xml";
  const watchChunkMatch = path.match(/^\/sitemap-watch-(\d+)\.xml$/);
  if (!isRoot && !isPages && !isWatch && !watchChunkMatch) return next();

  // Edge cache (Cache API, per colo, 1 jam): bots hitting the sitemap don't rebuild it each time.
  const edge = edgeCache();
  const key = new Request(`${SITE_ORIGIN}${path}`);
  if (edge) {
    const hit = await edge.match(key).catch(() => undefined);
    if (hit) {
      return new Response(method === "HEAD" ? null : hit.body, {
        status: 200,
        headers: {
          "content-type": "application/xml; charset=utf-8",
          "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
          "x-sitemap-cache": "HIT",
        },
      });
    }
  }

  try {
    let xml: string;
    if (isPages) xml = await buildPagesXml();
    else if (isWatch) xml = (await buildWatchXml(0)).xml;
    else if (watchChunkMatch) {
      const n = Number(watchChunkMatch[1]);
      const built = await buildWatchXml(n - 1);
      if (n < 1 || n > built.chunks) return new Response("Not Found", { status: 404 });
      xml = built.xml;
    } else xml = await buildRootXml();
    if (edge) await edge.put(key, xmlResponse("GET", xml)).catch(() => undefined);
    return xmlResponse(method, xml);
  } catch (err) {
    const message = err instanceof Error ? err.message : "sitemap error";
    return errorXml(method, message);
  }
}
