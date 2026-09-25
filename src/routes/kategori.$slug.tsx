import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { CatalogPager } from "@/components/video/catalog-pager";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { findCategory } from "@/lib/catalog/categories";
import { useCatalogFeed } from "@/hooks/use-catalog";
import { DEFAULT_OG, SITE_ORIGIN, homeSeo } from "@/lib/seo";

function parsePage(value: unknown): number | undefined {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 1) return undefined;
  return Math.min(n, 500);
}

export const Route = createFileRoute("/kategori/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    page: parsePage(search.page),
  }),
  beforeLoad: ({ params }) => {
    const cat = findCategory(params.slug);
    if (!cat) throw notFound();
    return { cat };
  },
  head: ({ params, match }) => {
    const cat = findCategory(params.slug);
    const page = typeof match.search.page === "number" ? match.search.page : 1;
    const seo = homeSeo(undefined, cat?.slug);
    const url =
      page > 1
        ? `${SITE_ORIGIN}/kategori/${cat?.slug || params.slug}?page=${page}`
        : `${SITE_ORIGIN}/kategori/${cat?.slug || params.slug}`;
    return {
      meta: [
        { title: page > 1 ? `${seo.title} · halaman ${page}` : seo.title },
        { name: "description", content: seo.description },
        { property: "og:title", content: seo.title },
        { property: "og:description", content: seo.description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { property: "og:image", content: DEFAULT_OG },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: DEFAULT_OG },
        { name: "robots", content: page > 1 ? "noindex,follow" : "index,follow" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: CategorySlugPage,
});

function CategorySlugPage() {
  const { slug } = Route.useParams();
  const { page: pageSearch } = Route.useSearch();
  const navigate = useNavigate({ from: "/kategori/$slug" });
  const cat = findCategory(slug);
  const page = pageSearch || 1;
  const feed = useCatalogFeed({ mode: "category", category: cat?.slug || slug, page });
  const title = cat?.label || slug;
  const subtitle = feed.total ? `${feed.total.toLocaleString("id-ID")} judul` : "Kategori";

  function setPage(next: number) {
    void navigate({
      search: (prev) => ({
        ...prev,
        page: next <= 1 ? undefined : next,
      }),
    });
  }

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
          <CatalogPager
            page={feed.page || page}
            total={feed.total}
            limit={feed.limit}
            loading={feed.loading}
            onPage={setPage}
          />
        </section>
      )}
    </Shell>
  );
}
