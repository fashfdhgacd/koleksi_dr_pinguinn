import { useEffect } from "react";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { CatalogPager } from "@/components/video/catalog-pager";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { UNLISTED_CATEGORY_SLUGS, findCategory } from "@/lib/catalog/categories";
import { rememberCatalog } from "@/lib/catalog/last-catalog";
import { queryCatalog } from "@/lib/catalog/service";
import type { VideoCard } from "@/lib/catalog/types";
import { useCatalogFeed } from "../hooks/use-catalog";
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
        ? `${SITE_ORIGIN}/kategori/${params.slug}?page=${page}`
        : `${SITE_ORIGIN}/kategori/${params.slug}`;
    return {
      meta: [
        { title: seo.title },
        { name: "description", content: seo.description },
        { property: "og:title", content: seo.title },
        { property: "og:description", content: seo.description },
        { property: "og:url", content: url },
        { property: "og:image", content: DEFAULT_OG },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { slug } = Route.useParams();
  const { page: pageSearch } = Route.useSearch();
  const page = pageSearch || 1;
  const navigate = useNavigate();
  const cat = findCategory(slug);
  const loaderData = Route.useLoaderData();

  const seed =
    loaderData && loaderData.ok && loaderData.type === "category"
      ? {
          items: loaderData.items as VideoCard[],
          page: loaderData.page,
          hasMore: loaderData.hasMore,
          total: loaderData.total,
        }
      : undefined;

  const feed = useCatalogFeed({ mode: "category", category: cat?.slug || slug, page }, seed);

  useEffect(() => {
    if (cat?.slug) rememberCatalog({ type: "category", category: cat.slug, page: feed.page });
  }, [cat?.slug, feed.page]);

  if (!cat || UNLISTED_CATEGORY_SLUGS.has(cat.slug)) {
    return (
      <Shell>
        <EmptyState title="Kategori tidak ada" description="Coba pilih kategori lain." />
      </Shell>
    );
  }

  if (loaderData && !loaderData.ok) {
    return (
      <Shell>
        <ErrorState message={loaderData.error || "Gagal memuat"} onRetry={() => navigate({ to: "/kategori/$slug", params: { slug } })} />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-zinc-100">{cat.label}</h1>
        {typeof feed.total === "number" ? (
          <p className="mt-1 text-sm text-zinc-500">{feed.total.toLocaleString("id-ID")} video</p>
        ) : null}
      </div>

      {feed.loading && !feed.items.length ? (
        <VideoGridSkeleton count={12} />
      ) : feed.error && !feed.items.length ? (
        <ErrorState message={feed.error} onRetry={feed.retry} />
      ) : !feed.items.length ? (
        <EmptyState title="Kosong" description="Belum ada video di kategori ini." />
      ) : (
        <>
          <VideoGrid items={feed.items} />
          <CatalogPager
            page={feed.page}
            hasMore={feed.hasMore}
            loadingMore={feed.loadingMore}
            onPage={(p) =>
              navigate({
                to: "/kategori/$slug",
                params: { slug },
                search: p > 1 ? { page: p } : {},
              })
            }
          />
        </>
      )}
    </Shell>
  );
}
