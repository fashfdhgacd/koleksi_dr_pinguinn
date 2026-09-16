import { createFileRoute } from "@tanstack/react-router";
import { CATEGORY_LIST } from "@/lib/catalog/categories";
import { listLatest } from "@/lib/catalog/local";
import { SITE_ORIGIN } from "@/lib/seo";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(loc: string, changefreq: string, priority: string): string {
  return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

async function buildSitemapXml(): Promise<string> {
  const staticUrls = [
    urlEntry(`${SITE_ORIGIN}/`, "hourly", "1.0"),
    urlEntry(`${SITE_ORIGIN}/kategori", "daily", "0.8"),
    ...CATEGORY_LIST.map((c) =>
      urlEntry(`${SITE_ORIGIN}/?category=${encodeURIComponent(c.slug)}`, "daily", "0.7"),
    ),
  ];

  // One catalog load; high limit OK server-side (public API caps at 48).
  const latest = await listLatest(1, 50_000);
  const watchUrls = latest.items.map((item) =>
    urlEntry(`${SITE_ORIGIN}/watch/${encodeURIComponent(item.id)}`, "weekly", "0.6"),
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...watchUrls].join("\n")}
</urlset>
`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const xml = await buildSitemapXml();
          return new Response(xml, {
            status: 200,
            headers: {
              "content-type": "application/xml; charset=utf-8",
              "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "sitemap error";
          return new Response(`<!-- ${escapeXml(message)} -->`, {
            status: 500,
            headers: { "content-type": "application/xml; charset=utf-8" },
          });
        }
      },
    },
  },
});
