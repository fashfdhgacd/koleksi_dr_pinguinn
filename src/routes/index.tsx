import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { CatalogPager } from "@/components/video/catalog-pager";
import { Hero } from "@/components/video/hero";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { findCategory } from "@/lib/catalog/categories";
import { queryCatalog } from "@/lib/catalog/service";
import type { VideoCard } from "@/lib/catalog/types";
import { useCatalogFeed } from "../hooks/use-catalog";
import { DEFAULT_OG, HOME_CANONICAL, SITE_ORIGIN, homeSeo, websiteJsonLd } from "@/lib/seo";

type HomeSearch = {
  q?: string;
  category?: string;
  page?: number;
};

function parsePage(value: unknown): number | undefined {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 1) return undefined;
  return Math.min(n, 500);
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
    category: typeof search.category === "string" ? search.category : undefined,
    page: parsePage(search.page),
  }),
  beforeLoad: ({ search }) => {
    if (search.category) {
      const cat = findCategory(search.category);
      if (cat) throw redirect({ to: "/kategori/$slug", params: { slug: cat.slug } });
    }
  },
  loader: async ({ location }) => {
    const raw = location.search as Record<string, unknown>;
    const q = typeof raw.q === "string" ? raw.q.trim() : "";
    const page = parsePage(raw.page) || 1;
    if (q) return queryCatalog({ type: "search", q, page, limit: 24 });
    return queryCatalog({ type: "home", page, limit: 24 });
  },
  head: ({ match }) => {
    const search = match.search as HomeSearch;
    const q = search.q?.trim();
    const page = search.page || 1;
    const seo = homeSeo(q);
    const url = q
      ? `${SITE_ORIGIN}/?q=${encodeURIComponent(q)}${page > 1 ? `&page=${page}` : ""}`
      : page > 1
        ? `${HOME_CANONICAL}?page=${page}`
        : HOME_CANONICAL;
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
      scripts: q
        ? []
        : [{ type: "application/ld+json", children: JSON.stringify(websiteJsonLd()) }],
    };
  },
  component: HomePage,
});

function HomePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const loaderData = Route.useLoaderData();
  const q = search.q?.trim() || "";
  const page = search.page || 1;

  const seed =
    loaderData && loaderData.ok
      ? {
          items: (loaderData as { items?: VideoCard[] }).items || [],
          featured: (loaderData as { featured?: VideoCard[] }).featured || [],
          page: (loaderData as { page?: number }).page || page,
          hasMore: Boolean((loaderData as { hasMore?: boolean }).hasMore),
          total: (loaderData as { total?: number }).total || 0,
        }
      : undefined;

  const feed = useCatalogFeed(
    q ? { mode: "search", q, page } : { mode: "home", page },
    seed,
  );

  const setPage = (p: number) => {
    navigate({
      to: "/",
      search: {
        ...(q ? { q } : {}),
        ...(p > 1 ? { page: p } : {}),
      },
    });
  };

  if (loaderData && !loaderData.ok) {
    return (
      <Shell>
        <ErrorState
          message={(loaderData as { error?: string }).error || "Gagal memuat"}
          onRetry={() => navigate({ to: "/" })}
        />
      </Shell>
    );
  }

  const featured = feed.featured?.length ? feed.featured : feed.items.slice(0, 1);

  return (
    <Shell>
      <div className="space-y-6">
        {!q && featured[0] ? <Hero video={featured[0]} videos={featured} /> : null}

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
                {q ? `Hasil: ${q}` : "Koleksi Dr. Pinguin"}
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                {typeof feed.total === "number"
                  ? `${feed.total.toLocaleString("id-ID")} judul · M.S.B.`
                  : "M.S.B."}
              </p>
              {!q ? (
                <p className="mt-1 max-w-2xl text-sm text-zinc-600">
                  Katalog video dewasa 18+ Dr. Pinguin. Streaming embed koleksi Indo, JAV, amatir. Update
                  berkala.
                </p>
              ) : null}
            </div>
          </div>

          {feed.loading && !feed.items.length ? (
            <VideoGridSkeleton count={12} />
          ) : feed.error && !feed.items.length ? (
            <ErrorState message={feed.error} onRetry={feed.retry} />
          ) : !feed.items.length ? (
            <EmptyState
              title={q ? "Tidak ketemu" : "Kosong"}
              description={q ? "Coba kata kunci lain." : "Belum ada video."}
            />
          ) : (
            <VideoGrid items={feed.items} />
          )}

          <CatalogPager
            page={page}
            total={feed.total}
            limit={feed.limit}
            loading={feed.loading}
            onPage={setPage}
          />
        </section>
      </div>
    </Shell>
  );
}
