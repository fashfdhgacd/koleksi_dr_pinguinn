import { createFileRoute, notFound } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { InfiniteSentinel } from "@/components/video/infinite-sentinel";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { findCategory } from "@/lib/catalog/categories";
import { useCatalogFeed } from "@/hooks/use-catalog";
import { DEFAULT_OG, SITE_ORIGIN, homeSeo } from "@/lib/seo";

export const Route = createFileRoute("/kategori/$slug")({
  beforeLoad: ({ params }) => {
    const cat = findCategory(params.slug);
    if (!cat) throw notFound();
    return { cat };
  },
  head: ({ params }) => {
    const cat = findCategory(params.slug);
    const seo = homeSeo(undefined, cat?.slug);
    const url = `${SITE_ORIGIN}/kategori/${cat?.slug || params.slug}`;
    return {
      meta: [
        { title: seo.title },
        { name: "description", content: seo.description },
        { property: "og:title", content: seo.title },
        { property: "og:description", content: seo.description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { property: "og:image", content: DEFAULT_OG },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: DEFAULT_OG },
        { name: "robots", content: "index,follow" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: CategorySlugPage,
});

function CategorySlugPage() {
  const { slug } = Route.useParams();
  const cat = findCategory(slug);
  const feed = useCatalogFeed({ mode: "category", category: cat?.slug || slug });
  const title = cat?.label || slug;
  const subtitle = feed.total ? `${feed.total.toLocaleString("id-ID")} judul` : "Kategori";

  return (
    <Shell category={cat?.slug || slug}>
      {feed.loading && !feed.items.length ? (
        <VideoGridSkeleton count={12} />
      ) : feed.status === "error" && !feed.items.length ? (
        <ErrorState message={feed.error ?? "Gagal memuat kategori."} onRetry={feed.retry} />
      ) : (
        <section>
          <div className="mb-5">
            <h1 className="font-display text-3xl text-foreground">{title}</h1>
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
          </div>
          {feed.status === "empty" ? (
            <EmptyState title="Kosong" description="Tidak ada judul pada kategori ini." />
          ) : (
            <VideoGrid items={feed.items} eagerCount={8} />
          )}
          <InfiniteSentinel
            enabled={feed.status === "success" && feed.hasMore && !feed.loadingMore}
            loading={feed.loadingMore}
            onLoadMore={feed.loadMore}
          />
        </section>
      )}
    </Shell>
  );
}
