import { categorySeo } from "@/lib/catalog/category-seo";
import { useEffect } from "react";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { CatalogPager } from "@/components/video/catalog-pager";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { UNLISTED_CATEGORY_SLUGS, findCategory } from "@/lib/catalog/categories";
import { SafeBoundary } from "@/components/safe-boundary";
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
    const seo = cat ? categorySeo(cat.slug) : homeSeo(undefined, undefined);
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
  const navigate = useNavigate({ from: "/kategori/$slug" });
  const cat = findCategory(slug);
  const loaderData = Route.useLoaderData();

  const seed =
    loaderData && "ok" in loaderData && loaderData.ok && loaderData.type === "category"
      ? {
          items: loaderData.items as VideoCard[],
          featured: [] as VideoCard[],
          total: loaderData.total,
          page: loaderData.page,
          limit: loaderData.limit,
        }
      : null;

  const feed = useCatalogFeed(
    { mode: "category", category: cat?.slug || slug, page },
    seed || undefined,
  );

  useEffect(() => {
    if (cat?.slug) rememberCatalog();
  }, [cat?.slug, feed.page]);

  function setPage(next: number) {
    const current = pageSearch || 1;
    if (next === current) {
      feed.retry();
      return;
    }
    navigate({
      search: (prev) => ({
        ...prev,
        page: next > 1 ? next : undefined,
      }),
    });
  }

  if (!cat || UNLISTED_CATEGORY_SLUGS.has(cat.slug)) {
    return (
      <Shell>
        <EmptyState title="Kategori tidak ada" description="Coba pilih kategori lain." />
      </Shell>
    );
  }

  if (loaderData && "ok" in loaderData && !loaderData.ok) {
    return (
      <Shell>
        <ErrorState
          message={(loaderData as { error?: string }).error || "Gagal memuat"}
          onRetry={() => feed.retry()}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <section>
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-zinc-100">{categorySeo(cat.slug).h1}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">{categorySeo(cat.slug).intro}</p>
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
          <SafeBoundary>
            <VideoGrid items={feed.items} />
          </SafeBoundary>
        )}

        <CatalogPager
          basePath={`/kategori/${cat.slug}`}
          page={page}
          total={feed.total}
          limit={feed.limit}
          loading={feed.loading}
          hasMore={feed.hasMore}
          onPage={setPage}
        />
      </section>
    </Shell>
  );
}
