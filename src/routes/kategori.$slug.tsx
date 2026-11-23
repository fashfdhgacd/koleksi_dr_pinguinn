import { usePublicHref, usePublicLanguage, usePublicText } from "@/lib/public-ui";
import { collectionLabel } from "@/lib/page-copy";
import { categoryHref } from "@/lib/catalog/halaman";
import { categoryRelated, categorySeo } from "@/lib/catalog/category-seo";
import { useEffect } from "react";
import { Link, Outlet, createFileRoute, notFound, redirect, useMatches, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { CatalogPager } from "@/components/video/catalog-pager";
import { VideoGrid, VideoGridSkeleton } from "@/components/video/video-grid";
import { LEGACY_CATEGORY_SLUGS, NOINDEX_CATEGORY_SLUGS, UNLISTED_CATEGORY_SLUGS, findCategory, minIndexedCount } from "@/lib/catalog/categories";
import { SafeBoundary } from "@/components/safe-boundary";
import { rememberCatalog } from "@/lib/catalog/last-catalog";
import { queryCatalog } from "@/lib/catalog/service";
import {
  RANK_PERIODS,
  type RankingDef,
  findRanking,
  rankPeriodAvailable,
  rankPeriodInfo,
  periodExpectedFrom,
  periodFromKey,
  rankingKey,
  rankingSeo,
} from "@/lib/catalog/rankings";
import { DEFAULT_PAGE_SIZE, type VideoCard } from "@/lib/catalog/types";
import { useCatalogFeed } from "../hooks/use-catalog";
import { jsonLdString } from "@/lib/json-ld";
import { DEFAULT_OG, HOME_CANONICAL, SITE_NAME, SITE_ORIGIN, breadcrumbJsonLd, collectionPageJsonLd, homeSeo, loaderItems } from "@/lib/seo";
import { ReturnVisitor } from "@/components/return-visitor";

function parsePage(value: unknown): number | undefined {
  const n = Math.floor(Number(value));
  // No upper cap here: a cap made validateSearch rewrite ?page=9999 to ?page=500 (extra 307 hop);
  // the loader sends any page past the end straight to the real last page.
  if (!Number.isSafeInteger(n) || n <= 1) return undefined;
  return n;
}

/** Halaman paginasi di atas ini: noindex,follow (link video tetap di-crawl). */
const DEEP_PAGE_NOINDEX = 5;

export const Route = createFileRoute("/kategori/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    page: parsePage(search.page),
    periode: parsePeriode(search.periode),
  }),
  beforeLoad: ({ params, search }) => {
    // Renamed categories (abg -> teen-18, mahasiswi -> college-18): permanent redirect, page kept.
    const renamed = LEGACY_CATEGORY_SLUGS[String(params.slug || "").trim().toLowerCase()];
    if (renamed) {
      throw redirect({
        to: "/kategori/$slug",
        params: { slug: renamed },
        search: { page: search.page, periode: undefined },
        replace: true,
        statusCode: 301,
      });
    }
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
    const res = await queryCatalog({ type: "category", category: cat.slug, page, limit: DEFAULT_PAGE_SIZE });
    // Past the last page (e.g. ?page=999): redirect to the real last page instead of an empty grid.
    if (page > 1 && res && res.ok && res.type === "category" && res.total > 0) {
      const last = Math.max(1, Math.ceil(res.total / (res.limit || DEFAULT_PAGE_SIZE)));
      if (page > last) {
        throw redirect({
          href: `${SITE_ORIGIN}${categoryHref(cat.slug, last)}`,
          statusCode: 302,
        });
      }
    }
    return res;
  },
  head: ({ params, match, loaderData, matches }) => {
    if (matches?.some((m) => String(m.routeId).includes("halaman"))) return { meta: [], links: [] };
    const rank = findRanking(params.slug);
    const cat = rank ? undefined : findCategory(params.slug);
    if (!rank && !cat) {
      // Unknown category (404): never indexable, no self canonical, explicit title.
      return {
        meta: [
          { title: "Kategori Tidak Ditemukan | koleksidrpinguin.com" },
          { name: "robots", content: "noindex,follow" },
          { name: "googlebot", content: "noindex,follow" },
        ],
        links: [],
      };
    }
    const page = typeof match.search.page === "number" ? match.search.page : 1;
    const periode = rank ? parsePeriode(match.search.periode) : undefined;
    const seo = rank ? rankingSeo(rank, periodFromKey(periode).period) : cat ? categorySeo(cat.slug) : homeSeo(undefined, undefined);
    // A period tab without data yet (Minggu/Bulan ini "segera"): noindex,follow + canonical to the
    // Sepanjang-masa page. Becomes indexable automatically once rank-periods-meta.json has the period.
    const emptyPeriod = Boolean(rank && periode && !rankPeriodAvailable(rank.kind, periodFromKey(periode).period));
    // A plain category without any video yet (e.g. a new one before its first upload): noindex,follow
    // so Google does not index a thin page. Indexable automatically from the first video.
    const ld = loaderData as { ok?: boolean; type?: string; total?: number } | undefined;
    // AI GAY and the 2026-10-26 SEO categories stay noindex until they reach SEO_MIN_COUNT videos.
    const minCount = minIndexedCount(cat?.slug);
    const emptyCategory = Boolean(
      !rank && cat && ld && ld.ok && ld.type === "category" && typeof ld.total === "number" && ld.total < minCount,
    );
    // Owner decision 2026-10-27: these stay reachable but out of search (no sitemap, noindex,follow).
    const hiddenFromSearch = Boolean(cat && NOINDEX_CATEGORY_SLUGS.has(cat.slug));
    const url = `${SITE_ORIGIN}${categoryHref(params.slug, emptyPeriod ? 1 : page, emptyPeriod ? undefined : periode)}`;
    // Halaman 2+: judul & deskripsi unik per halaman (hindari duplikat judul di GSC).
    const pageTitle = page > 1 && !emptyPeriod ? seo.title.replace(/ \| koleksidrpinguin\.com$/, ` – Halaman ${page} | koleksidrpinguin.com`) : seo.title;
    const pageDesc = page > 1 && !emptyPeriod ? `Halaman ${page}: ${seo.description}` : seo.description;
    // Breadcrumb shows the page heading ("Bokep Videy Indo Terbaru"), not the internal label ("drpinguin videy").
    const crumbName = (rank?.label || ("h1" in seo ? seo.h1 : "") || cat?.label || params.slug).trim();
    const indexable = !(emptyPeriod || emptyCategory || hiddenFromSearch || page > DEEP_PAGE_NOINDEX);
    // rel prev/next between pagination pages of a plain category (each page keeps its own canonical).
    const pageUrl = (n: number) => `${SITE_ORIGIN}${categoryHref(params.slug, n)}`;
    const lastPage =
      !rank && ld && ld.ok && ld.type === "category" && typeof ld.total === "number"
        ? Math.max(1, Math.ceil(ld.total / ((ld as { limit?: number }).limit || DEFAULT_PAGE_SIZE)))
        : 1;
    const pageLinks = rank
      ? []
      : [
          ...(page > 1 ? [{ rel: "prev", href: pageUrl(page - 1) }] : []),
          ...(page < lastPage ? [{ rel: "next", href: pageUrl(page + 1) }] : []),
        ];
    return {
      meta: [
        { title: pageTitle },
        { name: "description", content: pageDesc },
        { property: "og:title", content: pageTitle },
        { property: "og:description", content: pageDesc },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { property: "og:image", content: DEFAULT_OG },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "robots", content: indexable ? "index,follow" : "noindex,follow" },
        ...(!indexable ? [{ name: "googlebot", content: "noindex,follow" }] : []),
      ],
      links: [{ rel: "canonical", href: url }, ...pageLinks],
      scripts: indexable
        ? [
            {
              type: "application/ld+json",
              children: jsonLdString(
                collectionPageJsonLd({
                  name: pageTitle,
                  url,
                  description: pageDesc,
                  items: loaderItems(loaderData),
                  startPosition: (page - 1) * ((ld as { limit?: number } | undefined)?.limit || DEFAULT_PAGE_SIZE) + 1,
                }),
              ),
            },
            {
              type: "application/ld+json",
              children: jsonLdString(
                breadcrumbJsonLd([
                  { name: SITE_NAME, url: HOME_CANONICAL },
                  { name: "Kategori", url: `${SITE_ORIGIN}/kategori` },
                  { name: crumbName, url: `${SITE_ORIGIN}/kategori/${params.slug}` },
                ]),
              ),
            },
          ]
        : [],
    };
  },
  component: CategoryPage,
});

function parsePeriode(value: unknown): "minggu" | "bulan" | undefined {
  const p = periodFromKey(value);
  return p.key === "minggu" || p.key === "bulan" ? p.key : undefined;
}

type CatNav = {
  slug: string;
  page: number;
  periode?: "minggu" | "bulan";
  loaderData: unknown;
  onPage: (next: number) => void;
};

export function CategoryExperience({ slug, page, periode, loaderData, onPage }: CatNav) {
  const rank = findRanking(slug);
  if (rank) return <RankingPage rank={rank} page={page} periode={periode} loaderData={loaderData} onPage={onPage} />;
  return <PlainCategoryPage slug={slug} page={page} loaderData={loaderData} onPage={onPage} />;
}

function CategoryPage() {
  // Child /halaman/N keeps this parent mounted. Every hook below must run on every
  // render; returning before a hook is React error #300.
  const matches = useMatches();
  const { slug } = Route.useParams();
  const { page: pageSearch, periode } = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate({ from: "/kategori/$slug" });
  if (matches.some((m) => String(m.routeId).includes("halaman"))) return <Outlet />;
  const page = pageSearch || 1;
  return (
    <CategoryExperience
      slug={slug}
      page={page}
      periode={periode}
      loaderData={loaderData}
      onPage={(next) => {
        if (next <= 1) navigate({ to: "/kategori/$slug", params: { slug }, search: { page: undefined, periode } });
        else navigate({ to: "/kategori/$slug/halaman/$page", params: { slug, page: String(next) }, search: { periode } });
      }}
    />
  );
}

const dayFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", timeZone: "UTC" });
function fmtDay(day: string | null): string {
  if (!day) return "";
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(t) ? dayFmt.format(new Date(t)) : "";
}

/** /kategori/paling-ditonton | paling-disukai: pure ranking with period tabs (Minggu/Bulan/Sepanjang masa). */
function RankingPage({
  rank,
  page,
  periode,
  loaderData,
  onPage,
}: {
  rank: RankingDef;
  page: number;
  periode?: "minggu" | "bulan";
  loaderData: unknown;
  onPage: (next: number) => void;
}) {
  const language = usePublicLanguage();
  const localText = usePublicText();
  const period = periodFromKey(periode);
  const available = rankPeriodAvailable(rank.kind, period.period);
  const key = rankingKey(rank.slug, periode);
  const seo = rankingSeo(rank, period.period);
  const info = rankPeriodInfo(rank.kind, period.period);

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
    if (next === page) {
      feed.retry();
      return;
    }
    onPage(next);
  }

  return (
    <Shell>
      <section>
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-zinc-100">{language === "id" ? seo.h1 : collectionLabel(rank.slug, language)}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">{language === "id" ? seo.intro : language === "ms" ? `Terokai koleksi ${collectionLabel(rank.slug, language)} dan pilih video untuk ditonton.` : `Browse the ${collectionLabel(rank.slug, language)} collection.`}</p>
          <nav className="mt-3 flex flex-wrap gap-2" aria-label={localText("Periode")}>
            {RANK_PERIODS.map((p) => {
              const active = p.key === period.key;
              const ok = rankPeriodAvailable(rank.kind, p.period);
              const cls = `inline-flex h-10 items-center rounded-full border px-3 text-sm ${
                active ? "border-zinc-200 bg-zinc-100 text-zinc-900" : "border-white/10 text-zinc-300"
              }`;
              if (!ok) {
                return (
                  <span key={p.period} className={`${cls} cursor-not-allowed opacity-50`} title={localText("Data belum cukup")}>
                    {localText(p.label)} {localText("· segera")}
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
                  {localText(p.label)}
                </Link>
              );
            })}
          </nav>
          {info ? (
            <p className="mt-2 text-xs text-zinc-500">
              {localText("Pertambahan")} {rank.kind === "views" ? localText("tayangan") : "suka"} {fmtDay(info.from)} – {fmtDay(info.to)}
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
          <EmptyState title={localText("Kosong")} description={localText("Belum ada data untuk periode ini.")} />
        ) : (
          <SafeBoundary>
            <VideoGrid items={feed.items} ads />
          </SafeBoundary>
        )}

        {available ? (
          <CatalogPager
            pageHref={(n) => categoryHref(rank.slug, n, periode)}
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

function PlainCategoryPage({
  slug,
  page,
  loaderData,
  onPage,
}: {
  slug: string;
  page: number;
  loaderData: unknown;
  onPage: (next: number) => void;
}) {
  const publicHref = usePublicHref();
  const language = usePublicLanguage();
  const localText = usePublicText();
  const cat = findCategory(slug);

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
    if (next === page) {
      feed.retry();
      return;
    }
    onPage(next);
  }

  if (!cat || UNLISTED_CATEGORY_SLUGS.has(cat.slug)) {
    return (
      <Shell>
        <EmptyState title={localText("Kategori tidak ada")} description={localText("Coba pilih kategori lain.")} />
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
          <h1 className="text-xl font-semibold text-zinc-100">{language === "id" ? categorySeo(cat.slug).h1 : collectionLabel(cat.slug, language)}</h1>
          {categorySeo(cat.slug).intro ? (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">{language === "id" ? categorySeo(cat.slug).intro : language === "ms" ? `Terokai koleksi ${collectionLabel(cat.slug, language)} dan pilih video untuk ditonton.` : `Browse the ${collectionLabel(cat.slug, language)} collection.`}</p>
          ) : null}
          {typeof feed.total === "number" ? (
            <p className="mt-1 text-sm text-zinc-500">{feed.total.toLocaleString("id-ID")} video</p>
          ) : null}
          {cat.slug === "videy" ? (
            <a href={publicHref("/cari/bokep-videy-indo")} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-teal-300 underline underline-offset-2">
              {localText("Lihat Videy Indo paling ditonton →")}
            </a>
          ) : null}
          {categoryRelated(cat.slug).length ? (
            <nav className="mt-3 flex flex-wrap gap-2" aria-label={localText("Kategori terkait")}>
              {categoryRelated(cat.slug).map((c) => (
                <a
                  key={c.slug}
                  href={publicHref(`/kategori/${c.slug}`)}
                  className="inline-flex h-10 items-center rounded-full border border-white/10 px-3 text-sm text-zinc-300 hover:border-white/40 hover:text-white"
                >
                  {localText(c.label)}
                </a>
              ))}
            </nav>
          ) : null}
        </div>

        {feed.loading && !feed.items.length ? (
          <VideoGridSkeleton count={12} ads />
        ) : feed.error && !feed.items.length ? (
          <ErrorState message={feed.error} onRetry={feed.retry} />
        ) : !feed.items.length ? (
          page > 1 ? (
            <EmptyState title={localText("Kosong")} description={localText("Belum ada video di halaman ini.")} />
          ) : (
            <div>
              <EmptyState
                title={localText("Video segera hadir")}
                description={localText("Kategori ini baru dibuka. Videonya lagi disiapin, cek lagi sebentar lagi ya.")}
              />
              <div className="-mt-12 flex justify-center pb-12">
                <Link
                  to="/"
                  search={{ q: undefined, category: undefined }}
                  className="pixel inline-flex h-10 items-center rounded-none border border-white/35 px-3 text-[11px] text-white/80 hover:border-white/80 hover:text-white sm:text-xs"
                >
                  {localText("Tonton video terbaru dulu")}
                </Link>
              </div>
            </div>
          )
        ) : (
          <SafeBoundary>
            <VideoGrid items={feed.items} ads />
          </SafeBoundary>
        )}

        <CatalogPager
          pageHref={(n) => categoryHref(cat.slug, n)}
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
    </Shell>
  );
}
