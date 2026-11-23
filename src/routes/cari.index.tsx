import { usePublicHref, usePublicLanguage, usePublicText } from "@/lib/public-ui";
import { collectionLabel } from "@/lib/page-copy";
import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { LANDINGS } from "@/lib/catalog/landing";
import { jsonLdString } from "@/lib/json-ld";
import { hreflangLinks } from "@/lib/catalog/en-landing";
import { DEFAULT_OG, HOME_CANONICAL, SITE_NAME, SITE_ORIGIN, breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/seo";

const TITLE = "Pencarian Populer Video Indo 18+ | koleksidrpinguin.com";
const DESCRIPTION =
  "Daftar pencarian populer di Koleksi Dr. Pinguin: videy indo, STW, amatir, jilbab, threesome dan lainnya. Pilih topik, lalu tonton gratis di HP tanpa login.";

/** /cari: hub linking every hand-reviewed search landing page (internal links for crawlers and visitors). */
export const Route = createFileRoute("/cari/")({
  head: () => {
    const url = `${SITE_ORIGIN}/cari`;
    return {
      meta: [
        { title: TITLE },
        { name: "description", content: DESCRIPTION },
        { property: "og:title", content: TITLE },
        { property: "og:description", content: DESCRIPTION },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
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
              { name: "Pencarian Populer", url },
            ]),
          ),
        },
      ],
    };
  },
  component: SearchHub,
});

function SearchHub() {
  const publicHref = usePublicHref();
  const language = usePublicLanguage();
  const localText = usePublicText();
  return (
    <Shell>
      <section className="space-y-4">
        <h1 className="font-display text-4xl leading-none text-foreground sm:text-6xl">{localText("Pencarian Populer")}</h1>
        <p className="text-sm text-zinc-400">
          {localText("Topik yang paling sering dicari pengunjung. Semua konten khusus dewasa 18+; video yang belum terverifikasi tidak ditampilkan.")}
        </p>
        <p className="text-sm text-zinc-500">
          {language === "ms" ? "Koleksi bahasa Inggeris" : language === "id" ? "Koleksi berbahasa Inggris" : "English collections"}{" "}
          <a href="/en" hrefLang="en" className="text-teal-200 underline-offset-2 hover:underline">
            /en
          </a>
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {LANDINGS.map((l) => (
            <li key={l.slug} className="rounded-lg border border-white/10 p-3">
              <a href={publicHref(`/cari/${l.slug}`)} className="text-base font-semibold text-teal-200 hover:underline">
                {language === "id" ? l.h1 : collectionLabel(l.slug, language)}
              </a>
              <p className="mt-1 line-clamp-2 text-[13px] text-zinc-400">{language === "id" ? l.description : language === "ms" ? `Pilihan video dalam koleksi ${collectionLabel(l.slug, language)}.` : `Explore the ${collectionLabel(l.slug, language)} collection.`}</p>
            </li>
          ))}
        </ul>
        <p className="text-sm">
          <a href={publicHref("/kategori")} className="text-teal-200 hover:underline">
            {localText("Lihat semua kategori")}
          </a>
        </p>
      </section>
    </Shell>
  );
}
