import { usePublicHref } from "@/lib/public-ui";
import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { enHref } from "@/lib/catalog/halaman";
import { EN_LANDINGS, LANDING_MIN_VIDEOS, hreflangLinks } from "@/lib/catalog/en-landing";
import { enLandingCounts } from "@/lib/catalog/en-landing-query";
import { jsonLdString } from "@/lib/json-ld";
import { DEFAULT_OG, HOME_CANONICAL, SITE_NAME, SITE_ORIGIN, TITLE_SUFFIX, breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/seo";

const TITLE = `English Indonesian Video Collections | ${TITLE_SUFFIX}`;
const DESCRIPTION =
  `English-language collections of Indonesian amateur videos on ${TITLE_SUFFIX}: hijab, couples, homemade, Malay, and more. 18+ only.`;

export const Route = createFileRoute("/en/")({
  loader: async () => {
    const counts = await enLandingCounts();
    return {
      pages: EN_LANDINGS.filter((l) => (counts.get(l.slug) || 0) >= LANDING_MIN_VIDEOS).map((l) => ({
        slug: l.slug,
        h1: l.h1,
        count: counts.get(l.slug) || 0,
      })),
    };
  },
  head: () => {
    const url = `${SITE_ORIGIN}/en`;
    return {
      meta: [
        { title: TITLE },
        { name: "description", content: DESCRIPTION },
        { property: "og:title", content: TITLE },
        { property: "og:description", content: DESCRIPTION },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { property: "og:locale", content: "en" },
        { property: "og:image", content: DEFAULT_OG },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "robots", content: "index,follow" },
      ],
      links: [{ rel: "canonical", href: url }, ...hreflangLinks("/cari", "/en", SITE_ORIGIN)],
      scripts: [
        { type: "application/ld+json", children: jsonLdString(collectionPageJsonLd({ name: TITLE, url, description: DESCRIPTION })) },
        {
          type: "application/ld+json",
          children: jsonLdString(
            breadcrumbJsonLd([
              { name: SITE_NAME, url: HOME_CANONICAL },
              { name: "English", url },
            ]),
          ),
        },
      ],
    };
  },
  component: EnIndex,
});

function EnIndex() {
  const publicHref = usePublicHref();
  const { pages } = Route.useLoaderData();
  return (
    <Shell>
      <section className="space-y-4">
        <h1 className="font-display text-4xl leading-none text-foreground sm:text-6xl">English collections</h1>
        <p className="max-w-2xl text-sm text-zinc-400">{DESCRIPTION}</p>
        <p className="text-sm text-zinc-500">
          Looking for the Indonesian pages?{" "}
          <a href="/cari" hrefLang="id" className="text-teal-200 underline-offset-2 hover:underline">
            Open the Indonesian keyword list
          </a>
          .
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {pages.map((l) => (
            <li key={l.slug}>
              <a href={publicHref(enHref(l.slug, 1))} className="text-base font-semibold text-teal-200 hover:underline">
                {l.h1}
              </a>
              <span className="ml-2 text-xs text-zinc-500">{l.count.toLocaleString("en")} videos</span>
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  );
}
