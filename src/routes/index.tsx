import { overviewCopy } from "@/lib/catalog/overview-copy";
import { usePublicHref, usePublicLanguage, usePublicText } from "@/lib/public-ui";
import { useEffect } from "react";
import { SafeBoundary } from "@/components/safe-boundary";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { CatalogPager } from "@/components/video/catalog-pager";
import { Hero } from "@/components/video/hero";
import { RecentlyWatched } from "@/components/video/recently-watched";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { findCategory } from "@/lib/catalog/categories";
import { queryCatalog } from "@/lib/catalog/service";
import { DEFAULT_PAGE_SIZE, type VideoCard } from "@/lib/catalog/types";
import { useCatalogFeed } from "../hooks/use-catalog";
import { jsonLdString } from "@/lib/json-ld";
import { homeHref } from "@/lib/catalog/halaman";
import { DEFAULT_OG, HOME_CANONICAL, HOME_H1, HOME_INTRO, SITE_ORIGIN, homeJsonLd, homeSeo } from "@/lib/seo";
import { ReturnVisitor } from "@/components/return-visitor";

type HomeSearch = {
  q?: string;
  category?: string;
  page?: number;
};

function parsePage(value: unknown): number | undefined {
  const n = Math.floor(Number(value));
  // No upper cap here: a cap made validateSearch rewrite ?page=9999 to ?page=500 (extra 307 hop);
  // the loader sends any page past the end straight to the real last page.
  if (!Number.isSafeInteger(n) || n <= 1) return undefined;
  return n;
}

function isSchemaPlaceholder(q?: string): boolean {
  const t = (q || "").trim().toLowerCase();
  return t === "{search_term_string}" || t === "search_term_string";
}

export async function loadHome({ search }: { search: HomeSearch }) {
  const page = search.page || 1;
  if (search.q) {
    return queryCatalog({ type: "search", q: search.q, page, limit: DEFAULT_PAGE_SIZE });
  }
  return queryCatalog({ type: "home", page, limit: DEFAULT_PAGE_SIZE });
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

/** Halaman paginasi di atas ini: noindex,follow (link video tetap di-crawl). */
const DEEP_PAGE_NOINDEX = 5;

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
  loaderDeps: ({ search }) => ({ q: search.q, page: search.page }),
  loader: async ({ deps: search }) => {
    const res = await loadHome({ search });
    // Past the last page (e.g. ?page=9999): redirect to the real last page instead of an empty grid.
    const page = search.page || 1;
    if (page > 1 && res && res.ok) {
      const total = res.type === "home" ? res.latest.total : res.type === "search" ? res.total : 0;
      const limit = (res.type === "home" ? res.latest.limit : res.type === "search" ? res.limit : 0) || DEFAULT_PAGE_SIZE;
      const last = Math.max(1, Math.ceil(total / limit));
      if (total > 0 && page > last) {
        throw redirect({
          href: search.q
            ? `${HOME_CANONICAL}?${new URLSearchParams({ q: search.q, ...(last > 1 ? { page: String(last) } : {}) }).toString()}`
            : `${SITE_ORIGIN}${homeHref(last)}`,
          statusCode: 302,
        });
      }
    }
    return res;
  },
  head: ({ match }) => {
    const q = typeof match.search.q === "string" ? match.search.q : undefined;
    const page = typeof match.search.page === "number" ? match.search.page : 1;
    const seo = homeSeo(q);
    const title = !q && page > 1 ? `Bokep Indo Terbaru Halaman ${page} | Dr. Pinguin` : seo.title;
    const description = !q && page > 1 ? `Halaman ${page}: bokep indo terbaru, update setiap hari, streaming tanpa VPN di koleksidrpinguin.com. Khusus 18+.` : seo.description;
    const url = q ? HOME_CANONICAL : `${SITE_ORIGIN}${homeHref(page)}`;
    const indexable = !q && page <= DEEP_PAGE_NOINDEX;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: indexable ? "index,follow" : "noindex,follow" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { property: "og:image", content: DEFAULT_OG },
        { name: "twitter:card", content: "summary_large_image" },
        ...(!indexable ? [{ name: "googlebot", content: "noindex,follow" }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: q
        ? []
        : [{ type: "application/ld+json", children: jsonLdString(homeJsonLd()) }],
    };
  },
  component: HomePage,
});

export function HomeExperience({
  q,
  category,
  page,
  loaderData,
  onPage,
}: {
  q?: string;
  category?: string;
  page: number;
  loaderData: Awaited<ReturnType<typeof loadHome>>;
  onPage: (next: number) => void;
}) {
  const publicHref = usePublicHref();
  const language = usePublicLanguage();
  const localText = usePublicText();
  const seed = seedFromLoader(loaderData);
  const mode = q ? "search" : category ? "category" : "home";
  const feed = useCatalogFeed({ mode, q, category, page }, seed);
  const cat = findCategory(category);
  const overview = mode === "home" && page === 1 ? overviewCopy("/", language, seed?.total) : null;
  const heroVideos = !q && !category && page === 1 ? feed.featured : [];
  const heroIds = new Set(heroVideos.map((v) => v.id));
  const gridItems = heroIds.size ? feed.items.filter((item) => !heroIds.has(item.id)) : feed.items;

  const ms = language === "ms";
  const title = q ? (ms ? `Hasil carian untuk “${q}”` : language === "en" ? `Results for “${q}”` : `Hasil untuk “${q}”`) : ms ? "Video terkini" : language === "en" ? "Latest videos" : HOME_H1;
  const count = (q && !gridItems.length ? 0 : feed.total).toLocaleString(language);
  const subtitle = q && feed.loading && !gridItems.length ? (ms ? "Sedang mencari…" : language === "en" ? "Searching…" : "Mencari…") : count + " " + (q ? ms ? "hasil carian" : language === "en" ? "results" : "hasil" : ms ? "tajuk" : language === "en" ? "titles" : "judul");
  const intro = language === "id" ? (q ? `Hasil pencarian “${q}”. Khusus dewasa 18+.` : HOME_INTRO) : ms ? "Terokai koleksi video untuk penonton berumur 18 tahun ke atas." : "Explore the collection for viewers aged 18 and over.";

  // Search result pages past the end (e.g. stale ?page=N kept in the URL) jump back to page 1,
  // so the count and the grid always come from the same result array.
  const searchLastPage = q && feed.total > 0 ? Math.max(1, Math.ceil(feed.total / Math.max(1, feed.limit))) : 0;
  useEffect(() => {
    if (q && searchLastPage && page > searchLastPage) onPage(1);
  }, [q, page, searchLastPage, onPage]);

  function setPage(next: number) {
    if (next === page) {
      feed.retry();
      return;
    }
    onPage(next);
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
    <Shell query={q}>
      <div className="space-y-6">
        {heroVideos.length ? (
          <SafeBoundary>
            <Hero videos={heroVideos} />
          </SafeBoundary>
        ) : null}

        {mode === "home" && page === 1 ? (
          <SafeBoundary>
            <RecentlyWatched />
          </SafeBoundary>
        ) : null}

        <section>
          <div className="mb-3">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-100">{overview?.heading ?? title}</h1>
            <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600">{overview?.intro ?? intro}</p>
            {q ? null : (
              // Plain crawlable links to the categories that bring search traffic (SEO internal linking).
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <a href={publicHref("/kategori/videy")} className="font-medium text-zinc-200 underline underline-offset-2 hover:text-white">
                  {localText("Video Videy Indo terbaru →")}
                </a>
                <a href={publicHref("/kategori/ai-plus")} className="font-medium text-zinc-200 underline underline-offset-2 hover:text-white">
                  {localText("Semua video AI Drama →")}
                </a>
                <a href={publicHref("/kategori/malaysia")} className="font-medium text-zinc-200 underline underline-offset-2 hover:text-white">
                  {localText("Video Malaysia dan Melayu →")}
                </a>
                <a href={publicHref("/kategori/ai-indo")} className="font-medium text-zinc-200 underline underline-offset-2 hover:text-white">
                  {localText("Koleksi AI Drama Indonesia →")}
                </a>
                <a href={publicHref("/kategori/percakapan")} className="font-medium text-zinc-200 underline underline-offset-2 hover:text-white">
                  {localText("Video dengan percakapan →")}
                </a>
                <a href={publicHref("/kategori/paling-ditonton")} className="font-medium text-zinc-200 underline underline-offset-2 hover:text-white">
                  {localText("Paling ditonton →")}
                </a>
              </p>
            )}
          </div>

          <div id={mode === "home" && page === 1 ? "terbaru" : undefined} className="scroll-mt-20">
          {feed.loading && !feed.items.length ? (
            <VideoGridSkeleton count={12} ads />
          ) : feed.error && !feed.items.length ? (
            <ErrorState message={feed.error} onRetry={feed.retry} />
          ) : !gridItems.length ? (
            <EmptyState
              title={q && language !== "id" ? (ms ? `Tiada video untuk “${q}”` : `No videos found for “${q}”`) : q ? `Belum ada video untuk “${q}”` : localText("Kosong")}
              description={
                q
                  ? localText("Coba kata kunci yang lebih pendek atau umum, misalnya “jilbab”, “indo”, atau “jav”. Bisa juga cek kategori di menu.")
                  : localText("Belum ada video.")
              }
            />
          ) : (
            <SafeBoundary>
              <VideoGrid items={gridItems} ads />
            </SafeBoundary>
          )}
          </div>

          <CatalogPager
            pageHref={(n) =>
              q
                ? `/?${new URLSearchParams({ q, ...(n > 1 ? { page: String(n) } : {}) }).toString()}`
                : homeHref(n)
            }
            page={page}
            total={feed.total}
            limit={feed.limit}
            loading={feed.loading}
            hasMore={feed.hasMore}
            onPage={setPage}
          />
          <SafeBoundary>
            <ReturnVisitor key={page} />
          </SafeBoundary>
        </section>
      </div>
    </Shell>
  );
}

function HomePage() {
  const { q, category, page: pageSearch } = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate({ from: "/" });
  const page = pageSearch || 1;
  return (
    <HomeExperience
      q={q}
      category={category}
      page={page}
      loaderData={loaderData}
      onPage={(next) => {
        if (q) {
          navigate({ search: (prev: HomeSearch) => ({ ...prev, page: next > 1 ? next : undefined }) });
          return;
        }
        if (next <= 1) navigate({ to: "/", search: { q: undefined, category: undefined, page: undefined } });
        else navigate({ to: "/halaman/$page", params: { page: String(next) } });
      }}
    />
  );
}
