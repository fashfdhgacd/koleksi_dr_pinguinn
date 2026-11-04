import { createFileRoute, notFound } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { SafeBoundary } from "@/components/safe-boundary";
import { VideoGrid } from "@/components/video/video-grid";
import { findCategory } from "@/lib/catalog/categories";
import { LANDINGS, LANDING_MIN_VIDEOS, findLanding } from "@/lib/catalog/landing";
import { queryCatalog } from "@/lib/catalog/service";
import type { VideoCard } from "@/lib/catalog/types";
import { jsonLdString } from "@/lib/json-ld";
import { DEFAULT_OG, HOME_CANONICAL, SITE_NAME, SITE_ORIGIN, breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/seo";

/** /cari/<slug>: search landing pages from the hand-reviewed allowlist in src/lib/catalog/landing.ts. */
export const Route = createFileRoute("/cari/$slug")({
  beforeLoad: ({ params }) => {
    if (!findLanding(params.slug)) throw notFound();
  },
  loader: async ({ params }) => queryCatalog({ type: "landing", q: params.slug }),
  head: ({ params, loaderData }) => {
    const def = findLanding(params.slug);
    if (!def) {
      return {
        meta: [
          { title: "Halaman Tidak Ditemukan | koleksidrpinguin.com" },
          { name: "robots", content: "noindex,follow" },
        ],
      };
    }
    const url = `${SITE_ORIGIN}/cari/${def.slug}`;
    const ld = loaderData as { ok?: boolean; total?: number } | undefined;
    // Thin page guard: fewer than LANDING_MIN_VIDEOS clean videos -> noindex,follow, no JSON-LD.
    const indexable = Boolean(ld && ld.ok && typeof ld.total === "number" && ld.total >= LANDING_MIN_VIDEOS);
    const cat = findCategory(def.category);
    return {
      meta: [
        { title: def.title },
        { name: "description", content: def.description },
        { property: "og:title", content: def.title },
        { property: "og:description", content: def.description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { property: "og:image", content: DEFAULT_OG },
        { name: "twitter:card", content: "summary_large_image" },
        ...(!indexable
          ? [
              { name: "robots", content: "noindex,follow" },
              { name: "googlebot", content: "noindex,follow" },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: indexable
        ? [
            {
              type: "application/ld+json",
              children: jsonLdString(collectionPageJsonLd({ name: def.h1, url, description: def.description })),
            },
            {
              type: "application/ld+json",
              children: jsonLdString(
                breadcrumbJsonLd([
                  { name: SITE_NAME, url: HOME_CANONICAL },
                  { name: cat?.label || "Kategori", url: `${SITE_ORIGIN}/kategori/${def.category}` },
                  { name: def.h1, url },
                ]),
              ),
            },
          ]
        : [],
    };
  },
  component: LandingPage,
});

function LandingPage() {
  const { slug } = Route.useParams();
  const def = findLanding(slug);
  const data = Route.useLoaderData();
  if (!def) return null;
  const cat = findCategory(def.category);
  const items = data && data.ok && data.type === "landing" ? (data.items as VideoCard[]) : [];
  const others = LANDINGS.filter((l) => l.slug !== def.slug);

  return (
    <Shell>
      <section>
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-zinc-100">{def.h1}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">{def.intro}</p>
          {items.length ? <p className="mt-1 text-sm text-zinc-500">{items.length} video terpopuler</p> : null}
        </div>

        {data && !data.ok ? (
          <ErrorState message={(data as { error?: string }).error || "Gagal memuat"} onRetry={() => window.location.reload()} />
        ) : !items.length ? (
          <EmptyState title="Video segera hadir" description="Belum ada video untuk halaman ini. Cek lagi nanti ya." />
        ) : (
          <SafeBoundary>
            <VideoGrid items={items} ads />
          </SafeBoundary>
        )}

        <div className="mt-6 space-y-3">
          <a
            href={`/kategori/${def.category}`}
            className="inline-flex h-9 items-center rounded-full border border-teal-400/50 px-4 text-sm text-teal-300 hover:border-teal-300 hover:text-teal-200"
          >
            Lihat semua video {cat?.label || def.category} (terbaru) →
          </a>
          <nav aria-label="Pencarian populer lain">
            <p className="mb-2 text-xs text-zinc-500">Pencarian populer lain</p>
            <div className="flex flex-wrap gap-2">
              {others.map((l) => (
                <a
                  key={l.slug}
                  href={`/cari/${l.slug}`}
                  className="inline-flex h-8 items-center rounded-full border border-white/10 px-3 text-sm text-zinc-300 hover:border-white/40 hover:text-white"
                >
                  {l.h1}
                </a>
              ))}
            </div>
          </nav>
        </div>
      </section>
    </Shell>
  );
}
