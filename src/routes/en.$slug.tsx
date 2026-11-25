import { collectionHeading, collectionIntro } from "@/lib/page-copy";
import { languageFamily } from "@/lib/language-family";
import { usePublicLanguage } from "@/lib/public-ui";
import { Outlet, createFileRoute, notFound, useMatches, useNavigate } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { EmptyState, ErrorState } from "@/components/states/feed-states";
import { SafeBoundary } from "@/components/safe-boundary";
import { CatalogPager } from "@/components/video/catalog-pager";
import { VideoGrid } from "@/components/video/video-grid";
import { cariHref, enHref } from "@/lib/catalog/halaman";
import {
  EN_LANDINGS,
  LANDING_INDEX_PAGES,
  LANDING_MIN_VIDEOS,
  LANDING_PAGE_SIZE,
  enDocumentTitle,
  findEnLanding,
  hreflangLinks,
} from "@/lib/catalog/en-landing";
import { listEnLandingPage } from "@/lib/catalog/en-landing-query";
import type { CatalogResponse, VideoCard } from "@/lib/catalog/types";
import { jsonLdString } from "@/lib/json-ld";
import { DEFAULT_OG, HOME_CANONICAL, SITE_NAME, SITE_ORIGIN, TITLE_SUFFIX, breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/seo";

export function enLandingHead(slug: string, page: number, loaderData: unknown) {
  const def = findEnLanding(slug);
  if (!def) {
    return {
      meta: [
        { title: `Page Not Found | ${TITLE_SUFFIX}` },
        { name: "robots", content: "noindex,follow" },
      ],
    };
  }
  const url = `${SITE_ORIGIN}${enHref(def.slug, page)}`;
  const ld = loaderData as { ok?: boolean; total?: number } | undefined;
  const enough = Boolean(ld && ld.ok && typeof ld.total === "number" && ld.total >= LANDING_MIN_VIDEOS);
  const indexable = enough && page <= LANDING_INDEX_PAGES;
  const title = enDocumentTitle(def.title, page, TITLE_SUFFIX);
  const description = page > 1 ? `Page ${page}: ${def.description}` : def.description;
  const last = ld && ld.ok && typeof ld.total === "number" ? Math.max(1, Math.ceil(ld.total / LANDING_PAGE_SIZE)) : 1;
  const pageLinks = [
    ...(page > 1 ? [{ rel: "prev", href: `${SITE_ORIGIN}${enHref(def.slug, page - 1)}` }] : []),
    ...(page < last ? [{ rel: "next", href: `${SITE_ORIGIN}${enHref(def.slug, page + 1)}` }] : []),
  ];
  const hreflang = page === 1 && def.idSlug ? hreflangLinks(cariHref(def.idSlug, 1), enHref(def.slug, 1), SITE_ORIGIN) : [];
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "en" },
      { property: "og:image", content: DEFAULT_OG },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: indexable ? "index,follow" : "noindex,follow" },
      ...(!indexable ? [{ name: "googlebot", content: "noindex,follow" }] : []),
    ],
    links: [{ rel: "canonical", href: url }, ...pageLinks, ...hreflang],
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
                { name: "English", url: `${SITE_ORIGIN}/en` },
                { name: def.h1, url },
              ]),
            ),
          },
        ]
      : [],
  };
}

/** /en/<slug>: English keyword page. */
export const Route = createFileRoute("/en/$slug")({
  beforeLoad: ({ params }) => {
    if (!findEnLanding(params.slug)) throw notFound();
  },
  loader: ({ params }) => listEnLandingPage(params.slug, 1),
  head: ({ params, loaderData, matches }) => {
    if (matches?.some((m) => String(m.routeId).includes("halaman"))) return { meta: [], links: [] };
    return enLandingHead(params.slug, 1, loaderData);
  },
  component: EnSlugPage,
});

export function EnExperience({
  slug,
  data,
  onPage,
}: {
  slug: string;
  data: CatalogResponse;
  onPage: (next: number) => void;
}) {
  const language = usePublicLanguage();
  const def = findEnLanding(slug);
  if (!def) return null;
  const items = data && data.ok && data.type === "landing" ? (data.items as VideoCard[]) : [];
  const total = data && data.ok && data.type === "landing" ? data.total : 0;
  const page = data && data.ok && data.type === "landing" ? data.page : 1;
  const limit = data && data.ok && data.type === "landing" ? data.limit : LANDING_PAGE_SIZE;
  const heading = collectionHeading(def.slug, language, def.h1);
  const others = EN_LANDINGS.filter((l) => l.slug !== def.slug);

  return (
    <Shell>
      <section>
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-zinc-100">{heading}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">{language === "en" ? def.intro : collectionIntro(heading, language)}</p>
          {total ? <p className="mt-1 text-sm text-zinc-500">{total.toLocaleString(language)} {language === "en" ? "videos · page" : "video · halaman"} {page}</p> : null}
          {language === "en" && def.idSlug ? (
            <p className="mt-2 text-sm text-zinc-500">
              Indonesian page:{" "}
              <a href={cariHref(def.idSlug, 1)} hrefLang="id" className="text-teal-200 underline-offset-2 hover:underline">
                open the Bahasa Indonesia version
              </a>
            </p>
          ) : null}
        </div>

        {data && !data.ok ? (
          <ErrorState message={(data as { error?: string }).error || "Could not load this page"} onRetry={() => window.location.reload()} />
        ) : !items.length ? (
          <EmptyState title={language === "ms" ? "Video akan datang" : language === "id" ? "Video segera hadir" : "Videos coming soon"} description={language === "ms" ? "Belum ada video dalam koleksi ini. Sila singgah lagi." : language === "id" ? "Belum ada video dalam koleksi ini." : "Nothing matches this collection yet. Please check back later."} />
        ) : (
          <SafeBoundary>
            <VideoGrid items={items} ads />
          </SafeBoundary>
        )}

        <CatalogPager page={page} total={total} limit={limit} onPage={onPage} pageHref={(n) => enHref(def.slug, n)} />

        <div className="mt-6 space-y-3">
          <nav aria-label={language === "ms" ? "Koleksi lain" : language === "id" ? "Koleksi lainnya" : "Other English collections"}>
            <p className="mb-2 text-xs text-zinc-500">{language === "ms" ? "Koleksi lain" : language === "id" ? "Koleksi lainnya" : "Other English collections"}</p>
            <div className="flex flex-wrap gap-2">
              {others.map((l) => (
                <a
                  key={l.slug}
                  href={languageFamily(enHref(l.slug, 1))[language]}
                  className="inline-flex h-10 items-center rounded-full border border-white/10 px-3 text-sm text-zinc-300 hover:border-white/40 hover:text-white"
                >
                  {language === "en" ? l.h1 : collectionHeading(l.slug, language, l.h1)}
                </a>
              ))}
            </div>
          </nav>
        </div>
      </section>
    </Shell>
  );
}

function EnSlugPage() {
  const matches = useMatches();
  const { slug } = Route.useParams();
  const data = Route.useLoaderData();
  const navigate = useNavigate({ from: "/en/$slug" });
  if (matches.some((m) => String(m.routeId).includes("halaman"))) return <Outlet />;
  return (
    <EnExperience
      slug={slug}
      data={data}
      onPage={(next) => {
        if (next <= 1) navigate({ to: "/en/$slug", params: { slug } });
        else navigate({ to: "/en/$slug/halaman/$page", params: { slug, page: String(next) } });
      }}
    />
  );
}
