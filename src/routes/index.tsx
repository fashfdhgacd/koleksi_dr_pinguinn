import { useEffect } from "react";
import { SafeBoundary } from "@/components/safe-boundary";
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
import { jsonLdString } from "@/lib/json-ld";
import { BRAND_NAME, DEFAULT_OG, HOME_CANONICAL, HOME_INTRO, homeJsonLd, homeSeo } from "@/lib/seo";

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

function isSchemaPlaceholder(q?: string): boolean {
  const t = (q || "").trim().toLowerCase();
  return t === "{search_term_string}" || t === "search_term_string";
}

async function loadHome({ search }: { search: HomeSearch }) {
  const page = search.page || 1;
  if (search.q) {
    return queryCatalog({ type: "search", q: search.q, page, limit: 24 });
  }
  return queryCatalog({ type: "home", page, limit: 24 });
}

function seedFromLoader(loaderData: Awaited<ReturnType<typeof loadHome>>): {
  items: VideoCard[];
  featured: VideoCard[];
  total: number;
  page: number;
  limit: number;
} | null {
  if (!loaderData || !loaderData.ok) return null;
  if (loaderData.type === "home") {
    return {
      items: loaderData.latest.items,
      featured: loaderData.featured,
      total: loaderData.latest.total,
      page: loaderData.latest.page,
      limit: loaderData.latest.limit,
    };
  }
  if (loaderData.type === "search" || loaderData.type === "category" || loaderData.type === "latest") {
    return {
      items: loaderData.items,
      featured: [],
      total: loaderData.total,
      page: loaderData.page,
      limit: loaderData.limit,
    };
  }
  return null;
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    q: typeof search.q === "string" && search.q.trim() ? search.q.trim() : undefined,
    category:
      typeof search.category === "string" && search.category.trim()
        ? search.category.trim()
        : undefined,
    page: parsePage(search.page),
  }),
  beforeLoad: ({ search }) => {
    if (isSchemaPlaceholder(search.q)) {
      throw redirect({ href: HOME_CANONICAL, statusCode: 301 });
    }
    if (search.category) {
      const cat = findCategory(search.category);
      if (cat) {
        throw redirect({
          to: "/kategori/$slug",
          params: { slug: cat.slug },
          search: search.page && search.page > 1 ? { page: search.page } : {},
          statusCode: 301,
        });
      }
    }
  },
  loader: async ({ location }) => {
    const raw = location.search as Record<string, unknown>;
    const search: HomeSearch = {
      q: typeof raw.q === "string" && raw.q.trim() ? raw.q.trim() : undefined,
      category:
        typeof raw.category === "string" && raw.category.trim() ? raw.category.trim() : undefined,
      page: parsePage(raw.page),
    };
    if (isSchemaPlaceholder(search.q)) {
      throw redirect({ href: HOME_CANONICAL, statusCode: 301 });
    }
    return loadHome({ search });
  },
  head: ({ match }) => {
    const q = typeof match.search.q === "string" ? match.search.q : undefined;
    const page = typeof match.search.page === "number" ? match.search.page : 1;
    const seo = homeSeo(q);
    const title = !q && page > 1 ? `${seo.title} – Halaman ${page}` : seo.title;
    const url = q
      ? HOME_CANONICAL
      : page > 1
        ? `${HOME_CANONICAL}?page=${page}`
        : HOME_CANONICAL;
    return {
      meta: [
        { title },
        { name: "description", content: seo.description },
        { property: "og:title", content: title },
        { property: "og:description", content: seo.description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { property: "og:image", content: DEFAULT_OG },
        { name: "twitter:card", content: "summary_large_image" },
        ...(q
          ? [
              { name: "robots", content: "noindex, follow" },
              { name: "googlebot", content: "noindex, follow" },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: q
        ? []
        : [{ type: "application/ld+json", children: jsonLdString(homeJsonLd()) }],
    };
  },
  component: HomePage,
});

function HomePage() {
  const { q, category, page: pageSearch } = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const seed = seedFromLoader(loaderData);
  const navigate = useNavigate({ from: "/" });
  const mode = q ? "search" : category ? "category" : "home";
  const page = pageSearch || 1;
  const feed = useCatalogFeed({ mode, q, category, page }, seed);
  const cat = findCategory(category);
  const heroVideos = !q && !category && page === 1 ? feed.featured : [];
  const heroIds = new Set(heroVideos.map((v) => v.id));
  const gridItems = heroIds.size ? feed.items.filter((item) => !heroIds.has(item.id)) : feed.items;

  const title = q ? `Hasil untuk “${q}”` : cat ? cat.label : BRAND_NAME;
  const subtitle = q
    ? feed.loading && !feed.items.length
      ? "Mencari…"
      : `${(gridItems.length ? feed.total : 0).toLocaleString("id-ID")} hasil`
    : feed.total
    ? `${feed.total.toLocaleString("id-ID")} judul · koleksidrpinguin.com`
    : "koleksidrpinguin.com";
  const intro =
    q
      ? `Hasil pencarian “${q}” di katalog Dr. Pinguin. Konten dewasa 18+.`
      : HOME_INTRO;

  // Search result pages past the end (e.g. stale ?page=N kept in the URL) jump back to page 1,
  // so the count and the grid always come from the same result array.
  const searchLastPage = q && feed.total > 0 ? Math.max(1, Math.ceil(feed.total / Math.max(1, feed.limit))) : 0;
  useEffect(() => {
    if (q && searchLastPage && page > searchLastPage) {
      navigate({ search: (prev) => ({ ...prev, page: undefined }), replace: true });
    }
  }, [q, page, searchLastPage, navigate]);

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

  if (loaderData && !loaderData.ok) {
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
      <div className="space-y-6">
        {heroVideos.length ? (
          <SafeBoundary>
            <Hero videos={heroVideos} />
          </SafeBoundary>
        ) : null}

        <section>
          <div className="mb-3">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-100">{title}</h1>
            <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600">{intro}</p>
          </div>

          {feed.loading && !feed.items.length ? (
            <VideoGridSkeleton count={12} ads />
          ) : feed.error && !feed.items.length ? (
            <ErrorState message={feed.error} onRetry={feed.retry} />
          ) : !gridItems.length ? (
            <EmptyState
              title={q ? `Belum ada video untuk “${q}”` : "Kosong"}
              description={
                q
                  ? "Coba kata kunci yang lebih pendek atau umum, misalnya “jilbab”, “indo”, atau “jav”. Bisa juga cek kategori di menu."
                  : "Belum ada video."
              }
            />
          ) : (
            <SafeBoundary>
              <VideoGrid items={gridItems} ads />
            </SafeBoundary>
          )}

          <CatalogPager
            page={page}
            total={feed.total}
            limit={feed.limit}
            loading={feed.loading}
            hasMore={feed.hasMore}
            onPage={setPage}
          />
        </section>
      </div>
    </Shell>
  );
}
