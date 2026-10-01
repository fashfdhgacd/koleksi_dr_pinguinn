import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { CatalogPager } from "@/components/video/catalog-pager";
import { Hero } from "@/components/video/hero";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { findCategory } from "@/lib/catalog/categories";
import { queryCatalog } from "@/lib/catalog/service";
import type { VideoCard } from "@/lib/catalog/types";
import { useCatalogFeed } from "@/hooks/use-catalog";
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
  if (loaderData.type === "search" || loaderData.type === "latest" || loaderData.type === "category") {
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

async function loadHome({ search }: { search: HomeSearch }) {
  const page = search.page || 1;
  if (search.q) {
    return queryCatalog({ type: "search", q: search.q, page, limit: 24 });
  }
  return queryCatalog({ type: "home", page, limit: 24 });
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
    const cat = findCategory(search.category);
    if (cat && !search.q) {
      throw redirect({
        to: "/kategori/$slug",
        params: { slug: cat.slug },
        search: search.page ? { page: search.page } : undefined,
        replace: true,
        statusCode: 301,
      });
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
    return loadHome({ search });
  },
  head: ({ match }) => {
    const q = typeof match.search.q === "string" ? match.search.q : undefined;
    const page = typeof match.search.page === "number" ? match.search.page : 1;
    const seo = homeSeo(q);
    const url = q
      ? `${SITE_ORIGIN}/?q=${encodeURIComponent(q)}${page > 1 ? `&page=${page}` : ""}`
      : page > 1
        ? `${SITE_ORIGIN}/?page=${page}`
        : HOME_CANONICAL;
    const jsonLd = !q && page <= 1 ? websiteJsonLd() : null;
    return {
      meta: [
        { title: page > 1 ? `${seo.title} · halaman ${page}` : seo.title },
        { name: "description", content: seo.description },
        { property: "og:title", content: seo.title },
        { property: "og:description", content: seo.description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { property: "og:image", content: DEFAULT_OG },
        { property: "og:image:type", content: "image/jpeg" },
        { property: "og:image:width", content: "1280" },
        { property: "og:image:height", content: "720" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: DEFAULT_OG },
        { name: "robots", content: page > 1 ? "noindex,follow" : "index,follow" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: jsonLd ? [{ type: "application/ld+json", children: JSON.stringify(jsonLd) }] : [],
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

  const title = q ? `Hasil untuk “${q}”` : cat ? cat.label : "Koleksi Dr. Pinguin";
  const subtitle = feed.total
    ? `${feed.total.toLocaleString("id-ID")} judul · M.S.B.`
    : "M.S.B. — Koleksi Dr. Pinguin";
  const intro =
    q
      ? `Hasil pencarian “${q}” di katalog Dr. Pinguin. Konten dewasa 18+.`
      : "Katalog video dewasa 18+ Dr. Pinguin. Streaming embed koleksi Indo, JAV, amatir. Update berkala.";

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
    <Shell query={q} category={category}>
      <div className="space-y-8 sm:space-y-10">
        {heroVideos.length ? <Hero videos={heroVideos} /> : null}

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-5">
            <div>
              <h1 className="font-display text-2xl text-foreground sm:text-3xl">{title}</h1>
              <p className="mt-1 text-xs text-muted sm:text-sm">{subtitle}</p>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{intro}</p>
            </div>
          </div>

          {coldLoading ? (
            <VideoGridSkeleton count={12} />
          ) : feed.status === "error" && !feed.items.length ? (
            <ErrorState message={feed.error ?? "Gagal memuat katalog."} onRetry={feed.retry} />
          ) : feed.status === "empty" ? (
            <EmptyState
              title={q ? "Tidak ada hasil" : "Katalog kosong"}
              description={q ? "Tidak ada judul yang cocok. Coba kata kunci lain." : "Tidak ada judul pada saringan ini."}
            />
          ) : (
            <VideoGrid items={gridItems} eagerCount={24} />
          )}

          {feed.error && feed.items.length ? (
            <p className="mt-4 text-center text-sm text-muted">
              {feed.error}{" "}
              <button type="button" className="underline" onClick={feed.retry}>
                Coba lagi
              </button>
            </p>
          ) : null}

          <CatalogPager
            page={feed.page || page}
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
