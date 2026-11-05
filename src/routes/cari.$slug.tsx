import { Outlet, createFileRoute, notFound, useMatches, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { SafeBoundary } from "@/components/safe-boundary";
import { CatalogPager } from "@/components/video/catalog-pager";
import { VideoGrid } from "@/components/video/video-grid";
import { findCategory } from "@/lib/catalog/categories";
import { cariHref } from "@/lib/catalog/halaman";
import { LANDINGS, LANDING_INDEX_PAGES, LANDING_MIN_VIDEOS, LANDING_PAGE_SIZE, findLanding } from "@/lib/catalog/landing";
import { queryCatalog } from "@/lib/catalog/service";
import type { CatalogResponse, VideoCard } from "@/lib/catalog/types";
import { jsonLdString } from "@/lib/json-ld";
import { DEFAULT_OG, HOME_CANONICAL, SITE_NAME, SITE_ORIGIN, breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/seo";

export async function loadLanding(slug: string, page = 1) {
  return queryCatalog({ type: "landing", q: slug, page });
}

export function landingHead(slug: string, page: number, loaderData: unknown) {
  const def = findLanding(slug);
  if (!def) {
    return {
      meta: [
        { title: "Halaman Tidak Ditemukan | koleksidrpinguin.com" },
        { name: "robots", content: "noindex,follow" },
      ],
    };
  }
  const url = `${SITE_ORIGIN}${cariHref(def.slug, page)}`;
  const ld = loaderData as { ok?: boolean; total?: number } | undefined;
  const enough = Boolean(ld && ld.ok && typeof ld.total === "number" && ld.total >= LANDING_MIN_VIDEOS);
  const indexable = enough && page <= LANDING_INDEX_PAGES;
  const title = page > 1 ? def.title.replace(/ \| koleksidrpinguin\.com$/, ` – Halaman ${page} | koleksidrpinguin.com`) : def.title;
  const description = page > 1 ? `Halaman ${page}: ${def.description}` : def.description;
  const cat = findCategory(def.category);
  const last = ld && ld.ok && typeof ld.total === "number" ? Math.max(1, Math.ceil(ld.total / LANDING_PAGE_SIZE)) : 1;
  const pageLinks = [
    ...(page > 1 ? [{ rel: "prev", href: `${SITE_ORIGIN}${cariHref(def.slug, page - 1)}` }] : []),
    ...(page < last ? [{ rel: "next", href: `${SITE_ORIGIN}${cariHref(def.slug, page + 1)}` }] : []),
  ];
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
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
            children: jsonLdString(collectionPageJsonLd({ name: def.h1, url, description: def.description })),
          },
          {
            type: "application/ld+json",
            children: jsonLdString(
              breadcrumbJsonLd([
                { name: SITE_NAME, url: HOME_CANONICAL },
                { name: cat?.label || "Kategori", url: `${SITE_ORIGIN}/kategori/${def.category}` },
                { name: def.h1, url },
              ]),
            ),
          },
        ]
      : [],
  };
}

/** /cari/<slug>: keyword landings. Page 2+ lives at /cari/<slug>/halaman/N. */
export const Route = createFileRoute("/cari/$slug")({
  beforeLoad: ({ params }) => {
    if (!findLanding(params.slug)) throw notFound();
  },
  loader: ({ params }) => loadLanding(params.slug, 1),
  head: ({ params, loaderData, matches }) => {
    if (matches?.some((m) => String(m.routeId).includes("halaman"))) return { meta: [], links: [] };
    return landingHead(params.slug, 1, loaderData);
  },
  component: LandingPage,
});

export function CariExperience({
  slug,
  data,
  onPage,
}: {
  slug: string;
  data: CatalogResponse;
  onPage: (next: number) => void;
}) {
  const def = findLanding(slug);
  if (!def) return null;
  const cat = findCategory(def.category);
  const items = data && data.ok && data.type === "landing" ? (data.items as VideoCard[]) : [];
  const total = data && data.ok && data.type === "landing" ? data.total : 0;
  const page = data && data.ok && data.type === "landing" ? data.page : 1;
  const limit = data && data.ok && data.type === "landing" ? data.limit : LANDING_PAGE_SIZE;
  const others = LANDINGS.filter((l) => l.slug !== def.slug);

  return (
    <Shell>
      <section>
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-zinc-100">{def.h1}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">{def.intro}</p>
          {total ? <p className="mt-1 text-sm text-zinc-500">{total.toLocaleString("id-ID")} video · halaman {page}</p> : null}
        </div>

        {data && !data.ok ? (
          <ErrorState message={(data as { error?: string }).error || "Gagal memuat"} onRetry={() => window.location.reload()} />
        ) : !items.length ? (
          <EmptyState title="Video segera hadir" description="Belum ada video untuk halaman ini. Cek lagi nanti ya." />
        ) : (
          <SafeBoundary>
            <VideoGrid items={items} ads />
          </SafeBoundary>
        )}

        <CatalogPager page={page} total={total} limit={limit} onPage={onPage} pageHref={(n) => cariHref(def.slug, n)} />

        <div className="mt-6 space-y-3">
          <a
            href={`/kategori/${def.category}`}
            className="inline-flex h-9 items-center rounded-full border border-teal-400/50 px-4 text-sm text-teal-300 hover:border-teal-300 hover:text-teal-200"
          >
            Lihat semua video {cat?.label || def.category} (terbaru) →
          </a>
          <nav aria-label="Pencarian populer lain">
            <p className="mb-2 text-xs text-zinc-500">Pencarian populer lain</p>
            <div className="flex flex-wrap gap-2">
              {others.map((l) => (
                <a
                  key={l.slug}
                  href={`/cari/${l.slug}`}
                  className="inline-flex h-8 items-center rounded-full border border-white/10 px-3 text-sm text-zinc-300 hover:border-white/40 hover:text-white"
                >
                  {l.h1}
                </a>
              ))}
            </div>
          </nav>
        </div>
      </section>
    </Shell>
  );
}

function LandingPage() {
  // Child /halaman/N keeps this parent mounted. Hooks stay above the Outlet return
  // so the hook count does not change between /cari/<slug> and /cari/<slug>/halaman/N.
  const matches = useMatches();
  const { slug } = Route.useParams();
  const data = Route.useLoaderData();
  const navigate = useNavigate({ from: "/cari/$slug" });
  if (matches.some((m) => String(m.routeId).includes("halaman"))) return <Outlet />;
  return (
    <CariExperience
      slug={slug}
      data={data}
      onPage={(next) => {
        if (next <= 1) navigate({ to: "/cari/$slug", params: { slug } });
        else navigate({ to: "/cari/$slug/halaman/$page", params: { slug, page: String(next) } });
      }}
    />
  );
}
