/**
 * Dynamic sitemap for Google Search Console.
 * Nitro middleware (Cloudflare) — do not keep static public/sitemap*.xml or they shadow this.
 * URL list only (no video: title/description SEO copy).
 */
import { CATEGORY_LIST } from "../../src/lib/catalog/categories";
import { listSitemapWatchEntries } from "../../src/lib/catalog/sitemap-entries";
import { SITE_ORIGIN } from "../../src/lib/seo";

interface SitemapEvent {
  url: URL;
  req: { method: string; headers: Headers };
}

/** Soft chunk under Google's 50_000 URL / sitemap limit. */
const WATCH_CHUNK = 45_000;

const LEGAL_PATHS = ["/syarat", "/privasi", "/dmca", "/kontak"] as const;

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

function pageEntries(): string[] {
  const out: string[] = [
    urlEntry(`${SITE_ORIGIN}/`, { changefreq: "hourly", priority: "1.0" }),
    urlEntry(`${SITE_ORIGIN}/kategori`, { changefreq: "daily", priority: "0.8" }),
  ];
  for (const c of CATEGORY_LIST) {
    out.push(
      urlEntry(`${SITE_ORIGIN}/kategori/${encodeURIComponent(c.slug)}`, {
        changefreq: "daily",
        priority: c.slug === "jav" || c.slug === "ai-plus" ? "0.8" : "0.7",
      }),
    );
  }
  for (const path of LEGAL_PATHS) {
    out.push(urlEntry(`${SITE_ORIGIN}${path}`, { changefreq: "monthly", priority: "0.3" }));
  }
  return out;
}

function watchEntries(
  entries: Awaited<ReturnType<typeof listSitemapWatchEntries>>,
  start: number,
  end: number,
): string[] {
  return entries.slice(start, end).map((item) =>
    urlEntry(`${SITE_ORIGIN}/watch/${encodeURIComponent(item.id)}`, {
      changefreq: "weekly",
      priority: "0.6",
      lastmod: item.lastmod,
    }),
  );
}

function wrapUrlset(body: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body.join("\n")}\n</urlset>\n`;
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
  return wrapUrlset(pageEntries());
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

async function buildRootXml(): Promise<string> {
  const entries = await listSitemapWatchEntries();
  const pageCount = pageEntries().length;
  const total = pageCount + entries.length;
  const watchChunks = Math.max(1, Math.ceil(Math.max(entries.length, 1) / WATCH_CHUNK));

  // Single urlset when under the 50k limit; otherwise sitemap index.
  if (total <= 50_000 && watchChunks === 1) {
    return wrapUrlset([
      ...pageEntries(),
      ...watchEntries(entries, 0, entries.length),
    ]);
  }

  const latest = entries.find((e) => e.lastmod)?.lastmod;
  const locs: Array<{ loc: string; lastmod?: string }> = [
    { loc: `${SITE_ORIGIN}/sitemap-pages.xml` },
  ];
  if (watchChunks === 1) {
    locs.push({ loc: `${SITE_ORIGIN}/sitemap-watch.xml`, lastmod: latest });
  } else {
    for (let i = 1; i <= watchChunks; i++) {
      locs.push({ loc: `${SITE_ORIGIN}/sitemap-watch-${i}.xml`, lastmod: latest });
    }
  }
  return wrapIndex(locs);
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

  try {
    if (isPages) return xmlResponse(method, await buildPagesXml());
    if (isWatch) {
      const { xml } = await buildWatchXml(0);
      return xmlResponse(method, xml);
    }
    if (watchChunkMatch) {
      const n = Number(watchChunkMatch[1]);
      const { xml, chunks } = await buildWatchXml(n - 1);
      if (n < 1 || n > chunks) {
        return new Response("Not Found", { status: 404 });
      }
      return xmlResponse(method, xml);
    }
    return xmlResponse(method, await buildRootXml());
  } catch (err) {
    const message = err instanceof Error ? err.message : "sitemap error";
    return errorXml(method, message);
  }
}
