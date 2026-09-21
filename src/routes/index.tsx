import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { Hero } from "@/components/video/hero";
import { InfiniteSentinel } from "@/components/video/infinite-sentinel";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { findCategory } from "@/lib/catalog/categories";
import { useCatalogFeed } from "@/hooks/use-catalog";
import { SITE_ORIGIN, homeSeo, websiteJsonLd } from "@/lib/seo";

type HomeSearch = {
  q?: string;
  category?: string;
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    q: typeof search.q === "string" && search.q.trim() ? search.q.trim() : undefined,
    category:
      typeof search.category === "string" && search.category.trim()
        ? search.category.trim()
        : undefined,
  }),
  head: ({ match }) => {
    const q = typeof match.search.q === "string" ? match.search.q : undefined;
    const category = typeof match.search.category === "string" ? match.search.category : undefined;
    const seo = homeSeo(q, category);
    const url = q
      ? `${SITE_ORIGIN}/?q=${encodeURIComponent(q)}`
      : category
        ? `${SITE_ORIGIN}/?category=${encodeURIComponent(category)}`
        : SITE_ORIGIN;
    const jsonLd = !q && !category ? websiteJsonLd() : null;
    return {
      meta: [
        { title: seo.title },
        { name: "description", content: seo.description },
        { name: "keywords", content: seo.keywords },
        { property: "og:title", content: seo.title },
        { property: "og:description", content: seo.description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { name: "robots", content: "index,follow" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: jsonLd
        ? [{ type: "application/ld+json", children: JSON.stringify(jsonLd) }]
        : [],
    };
  },
  component: HomePage,
});

function HomePage() {
  const { q, category } = Route.useSearch();
  const mode = q ? "search" : category ? "category" : "home";
  const feed = useCatalogFeed({ mode, q, category });
  const cat = findCategory(category);
  const heroVideos = !q && !category ? feed.featured : [];
  const heroIds = new Set(heroVideos.map((v) => v.id));
  const gridItems = heroIds.size
    ? feed.items.filter((item) => !heroIds.has(item.id))
    : feed.items;

  const title = q ? `Hasil untuk “${q}”` : cat ? `Bokep Indo ${cat.label}` : "Koleksi Dr. Pinguin Bokep";
  const subtitle = feed.total ? `${feed.total.toLocaleString("id-ID")} judul · M.S.B.` : "M.S.B. — Koleksi Dr. Pinguin";

  return (
    <Shell query={q} category={category}>
      {feed.loading && !feed.items.length ? (
        <div className="space-y-8">
          {!q && !category ? <div className="skeleton-shimmer aspect-[16/9] rounded-[28px]" /> : null}
          <VideoGridSkeleton count={12} />
        </div>
      ) : feed.status === "error" && !feed.items.length ? (
        <ErrorState message={feed.error ?? "Gagal memuat katalog."} onRetry={feed.retry} />
      ) : (
        <div className="space-y-10">
          {heroVideos.length ? <Hero videos={heroVideos} /> : null}

          <section>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-display text-3xl text-foreground">{title}</h1>
                <p className="mt-1 text-sm text-muted">{subtitle}</p>
              </div>
            </div>

            {feed.status === "empty" ? (
              <EmptyState
                title={q ? "Tidak ada hasil" : "Katalog kosong"}
                description={
                  q
                    ? "Tidak ada judul yang cocok. Coba kata kunci lain."
                    : "Tidak ada judul pada saringan ini."
                }
              />
            ) : (
              <VideoGrid items={gridItems} eagerCount={heroVideos.length ? 6 : 8} />
            )}

            {feed.error && feed.items.length ? (
              <p className="mt-4 text-center text-sm text-muted">
                {feed.error}{" "}
                <button type="button" className="underline" onClick={feed.retry}>
                  Coba lagi
                </button>
              </p>
            ) : null}

            <InfiniteSentinel
              enabled={feed.status === "success" && feed.hasMore && !feed.loadingMore}
              loading={feed.loadingMore}
              onLoadMore={feed.loadMore}
            />
          </section>
        </div>
      )}
    </Shell>
  );
}
