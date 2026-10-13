import { categorySeo } from "@/lib/catalog/category-seo";
import { useEffect } from "react";
import { Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { CatalogPager } from "@/components/video/catalog-pager";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { UNLISTED_CATEGORY_SLUGS, findCategory } from "@/lib/catalog/categories";
import { SafeBoundary } from "@/components/safe-boundary";
import { rememberCatalog } from "@/lib/catalog/last-catalog";
import { queryCatalog } from "@/lib/catalog/service";
import {
  RANK_PERIODS,
  type RankingDef,
  findRanking,
  periodAvailable,
  periodExpectedFrom,
  periodFromKey,
  periodInfo,
  rankingKey,
  rankingSeo,
} from "@/lib/catalog/rankings";
import { DEFAULT_PAGE_SIZE, type VideoCard } from "@/lib/catalog/types";
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
    periode: parsePeriode(search.periode),
  }),
  beforeLoad: ({ params }) => {
    if (findRanking(params.slug)) return { cat: undefined };
    const cat = findCategory(params.slug);
    if (!cat) throw notFound();
    return { cat };
  },
  loader: async ({ params, location }) => {
    const rank = findRanking(params.slug);
    if (rank) {
      const raw = location.search as Record<string, unknown>;
      return queryCatalog({
        type: "category",
        category: rankingKey(rank.slug, parsePeriode(raw.periode)),
        page: parsePage(raw.page) || 1,
        limit: DEFAULT_PAGE_SIZE,
      });
    }
    const cat = findCategory(params.slug);
    if (!cat) return { ok: false as const, error: "not found", code: "not_found" as const };
    const raw = location.search as Record<string, unknown>;
    const page = parsePage(raw.page) || 1;
    return queryCatalog({ type: "category", category: cat.slug, page, limit: DEFAULT_PAGE_SIZE });
  },
  head: ({ params, match }) => {
    const rank = findRanking(params.slug);
    const cat = rank ? undefined : findCategory(params.slug);
    const page = typeof match.search.page === "number" ? match.search.page : 1;
    const periode = rank ? parsePeriode(match.search.periode) : undefined;
    const seo = rank ? rankingSeo(rank) : cat ? categorySeo(cat.slug) : homeSeo(undefined, undefined);
    // A period tab without data yet (Minggu/Bulan ini "segera"): noindex,follow + canonical to the
    // Sepanjang-masa page. Becomes indexable automatically once rank-periods-meta.json has the period.
    const emptyPeriod = Boolean(rank && periode && !periodAvailable(periodFromKey(periode).period));
    const qs = new URLSearchParams();
    if (periode && !emptyPeriod) qs.set("periode", periode);
    if (page > 1 && !emptyPeriod) qs.set("page", String(page));
    const url = `${SITE_ORIGIN}/kategori/${params.slug}${qs.toString() ? `?${qs.toString()}` : ""}`;
    return {
      meta: [
        { title: seo.title },
        { name: "description", content: seo.description },
        { property: "og:title", content: seo.title },
        { property: "og:description", content: seo.description },
        { property: "og:url", content: url },
        { property: "og:image", content: DEFAULT_OG },
        { name: "twitter:card", content: "summary_large_image" },
        ...(emptyPeriod ? [{ name: "robots", content: "noindex,follow" }] : []),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: CategoryPage,
});

function parsePeriode(value: unknown): "minggu" | "bulan" | undefined {
  const p = periodFromKey(value);
  return p.key === "minggu" || p.key === "bulan" ? p.key : undefined;
}

function CategoryPage() {
  const { slug } = Route.useParams();
  const rank = findRanking(slug);
  if (rank) return <RankingPage rank={rank} />;
  return <PlainCategoryPage slug={slug} />;
}

const dayFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", timeZone: "UTC" });
function fmtDay(day: string | null): string {
  if (!day) return "";
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(t) ? dayFmt.format(new Date(t)) : "";
}

/** /kategori/paling-ditonton | paling-disukai: pure ranking with period tabs (Minggu/Bulan/Sepanjang masa). */
function RankingPage({ rank }: { rank: RankingDef }) {
  const { page: pageSearch, periode } = Route.useSearch();
  const page = pageSearch || 1;
  const navigate = useNavigate({ from: "/kategori/$slug" });
  const loaderData = Route.useLoaderData();
  const period = periodFromKey(periode);
  const available = periodAvailable(period.period);
  const key = rankingKey(rank.slug, periode);
  const seo = rankingSeo(rank);
  const info = periodInfo(period.period);

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
  const feed = useCatalogFeed({ mode: "category", category: key, page }, seed || undefined);

  function setPage(next: number) {
    if (next === (pageSearch || 1)) {
      feed.retry();
      return;
    }
    navigate({ search: (prev) => ({ ...prev, page: next > 1 ? next : undefined }) });
  }

  return (
    <Shell>
      <section>
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-zinc-100">{seo.h1}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">{seo.intro}</p>
          <nav className="mt-3 flex flex-wrap gap-2" aria-label="Periode">
            {RANK_PERIODS.map((p) => {
              const active = p.key === period.key;
              const ok = periodAvailable(p.period);
              const cls = `inline-flex h-8 items-center rounded-full border px-3 text-sm ${
                active ? "border-zinc-200 bg-zinc-100 text-zinc-900" : "border-white/10 text-zinc-300"
              }`;
              if (!ok) {
                return (
                  <span key={p.period} className={`${cls} cursor-not-allowed opacity-50`} title="Data belum cukup">
                    {p.label} · segera
                  </span>
                );
              }
              return (
                <Link
                  key={p.period}
                  to="/kategori/$slug"
                  params={{ slug: rank.slug }}
                  search={{ page: undefined, periode: p.key || undefined }}
                  className={cls}
                >
                  {p.label}
                </Link>
              );
            })}
          </nav>
          {info ? (
            <p className="mt-2 text-xs text-zinc-500">
              Pertambahan {rank.kind === "views" ? "tayangan" : "suka"} {fmtDay(info.from)} – {fmtDay(info.to)}
            </p>
          ) : null}
          {available && typeof feed.total === "number" ? (
            <p className="mt-1 text-sm text-zinc-500">{feed.total.toLocaleString("id-ID")} video</p>
          ) : null}
        </div>

        {!available ? (
          <EmptyState
            title={`${period.label}: segera`}
            description={
              periodExpectedFrom(period.period)
                ? `Data ${period.label.toLowerCase()} mulai tersedia sekitar ${fmtDay(periodExpectedFrom(period.period))}.`
                : `Riwayat statistik baru mulai dicatat; peringkat ${period.label.toLowerCase()} muncul setelah datanya cukup.`
            }
          />
        ) : feed.loading && !feed.items.length ? (
          <VideoGridSkeleton count={12} ads />
        ) : feed.error && !feed.items.length ? (
          <ErrorState message={feed.error} onRetry={feed.retry} />
        ) : !feed.items.length ? (
          <EmptyState title="Kosong" description="Belum ada data untuk periode ini." />
        ) : (
          <SafeBoundary>
            <VideoGrid items={feed.items} ads />
          </SafeBoundary>
        )}

        {available ? (
          <CatalogPager
            basePath={`/kategori/${rank.slug}`}
            page={page}
            total={feed.total}
            limit={feed.limit}
            loading={feed.loading}
            hasMore={feed.hasMore}
            onPage={setPage}
          />
        ) : null}
      </section>
    </Shell>
  );
}

function PlainCategoryPage({ slug }: { slug: string }) {
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
          {categorySeo(cat.slug).intro ? (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">{categorySeo(cat.slug).intro}</p>
          ) : null}
          {typeof feed.total === "number" ? (
            <p className="mt-1 text-sm text-zinc-500">{feed.total.toLocaleString("id-ID")} video</p>
          ) : null}
        </div>

        {feed.loading && !feed.items.length ? (
          <VideoGridSkeleton count={12} ads />
        ) : feed.error && !feed.items.length ? (
          <ErrorState message={feed.error} onRetry={feed.retry} />
        ) : !feed.items.length ? (
          <EmptyState title="Kosong" description="Belum ada video di kategori ini." />
        ) : (
          <SafeBoundary>
            <VideoGrid items={feed.items} ads />
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
