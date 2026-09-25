import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { CatalogPager } from "@/components/video/catalog-pager";
import { Hero } from "@/components/video/hero";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { findCategory } from "@/lib/catalog/categories";
import { useCatalogFeed } from "@/hooks/use-catalog";
import { DEFAULT_OG, SITE_ORIGIN, homeSeo, websiteJsonLd } from "@/lib/seo";

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
  head: ({ match }) => {
    const q = typeof match.search.q === "string" ? match.search.q : undefined;
    const page = typeof match.search.page === "number" ? match.search.page : 1;
    const seo = homeSeo(q);
    const url = q
      ? `${SITE_ORIGIN}/?q=${encodeURIComponent(q)}${page > 1 ? `&page=${page}` : ""}`
      : page > 1
        ? `${SITE_ORIGIN}/?page=${page}`
        : SITE_ORIGIN;
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
  const navigate = useNavigate({ from: "/" });
  const mode = q ? "search" : category ? "category" : "home";
  const page = pageSearch || 1;
  const feed = useCatalogFeed({ mode, q, category, page });
  const cat = findCategory(category);
  const heroVideos = !q && !category && page === 1 ? feed.featured : [];
  const heroIds = new Set(heroVideos.map((v) => v.id));
  const gridItems = heroIds.size ? feed.items.filter((item) => !heroIds.has(item.id)) : feed.items;

  const title = q ? `Hasil untuk “${q}”` : cat ? cat.label : "Koleksi Dr. Pinguin";
  const subtitle = feed.total ? `${feed.total.toLocaleString("id-ID")} judul · M.S.B.` : "M.S.B. — Koleksi Dr. Pinguin";

  function setPage(next: number) {
    void navigate({
      search: (prev) => ({
        ...prev,
        page: next <= 1 ? undefined : next,
      }),
    });
  }

  return (
    <Shell query={q} category={category}>
      {feed.loading && !feed.items.length ? (
        <div className="space-y-8">
          {!q && !category && page === 1 ? <div className="skeleton-shimmer aspect-[16/9] rounded-[28px]" /> : null}
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
                description={q ? "Tidak ada judul yang cocok. Coba kata kunci lain." : "Tidak ada judul pada saringan ini."}
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

            <CatalogPager
              page={feed.page || page}
              total={feed.total}
              limit={feed.limit}
              loading={feed.loading}
              onPage={setPage}
            />
          </section>
        </div>
      )}
    </Shell>
  );
}
