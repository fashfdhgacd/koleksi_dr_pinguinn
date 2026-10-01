import { useEffect } from "react";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { CatalogPager } from "@/components/video/catalog-pager";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { findCategory } from "@/lib/catalog/categories";
import { rememberCatalog } from "@/lib/catalog/last-catalog";
import { queryCatalog } from "@/lib/catalog/service";
import type { VideoCard } from "@/lib/catalog/types";
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
  loader: async ({ params, location }) => {
    const cat = findCategory(params.slug);
    if (!cat) return { ok: false as const, error: "not found", code: "not_found" as const };
    const raw = location.search as Record<string, unknown>;
    const page = parsePage(raw.page) || 1;
    return queryCatalog({ type: "category", category: cat.slug, page, limit: 24 });
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
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate({ from: "/kategori/$slug" });
  const cat = findCategory(slug);
  const page = pageSearch || 1;
  const seed =
    loaderData && loaderData.ok && loaderData.type === "category"
      ? {
          items: loaderData.items as VideoCard[],
          total: loaderData.total,
          page: loaderData.page,
          hasMore: loaderData.hasMore,
        }
      : null;
  const feed = useCatalogFeed({ mode: "category", category: cat?.slug || slug, page }, seed);
  const title = cat?.label || slug;
  const subtitle = feed.total ? `${feed.total.toLocaleString("id-ID")} judul` : "Kategori";
  const intro = `Katalog ${title} 18+ di Dr. Pinguin. Streaming embed, update berkala.`;

  useEffect(() => {
    rememberCatalog(`/kategori/${slug}${page > 1 ? `?page=${page}` : ""}`);
  }, [slug, page]);

  function setPage(next: number) {
    void navigate({
      search: (prev) => ({
        ...prev,
        page: next <= 1 ? undefined : next,
      }),
    });
  }

  const coldLoading = feed.loading && !feed.items.length;

  return (
    <Shell category={cat?.slug || slug}>
      <section>
        <div className="mb-4 sm:mb-5">
          <h1 className="font-display text-2xl text-foreground sm:text-3xl">{title}</h1>
          <p className="mt-1 text-xs text-muted sm:text-sm">{subtitle}</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{intro}</p>
        </div>
        {coldLoading ? (
          <VideoGridSkeleton count={12} />
        ) : feed.status === "error" && !feed.items.length ? (
          <ErrorState message={feed.error ?? "Gagal memuat kategori."} onRetry={feed.retry} />
        ) : feed.status === "empty" ? (
          <EmptyState title="Kosong" description="Tidak ada judul pada kategori ini." />
        ) : (
          <VideoGrid items={feed.items} eagerCount={24} />
        )}
        <CatalogPager
          page={feed.page || page}
          total={feed.total}
          limit={feed.limit}
          loading={feed.loading}
          onPage={setPage}
        />
      </section>
    </Shell>
  );
}
