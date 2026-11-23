import { usePublicHref, usePublicText } from "@/lib/public-ui";
/**
 * Site-wide crawlable links to the top landing pages (SEO internal linking, 2026-11-02).
 * Static list: plain <a href> in the SSR HTML, no data fetch, so it costs nothing per visit.
 */
export const POPULAR_CATEGORY_LINKS: ReadonlyArray<{ slug: string; label: string; href?: string }> = [
  { slug: "paling-ditonton", label: "Paling Ditonton" },
  { slug: "ai-plus", label: "AI Drama" },
  { slug: "ai-indo", label: "Bokep Indo AI" },
  { slug: "videy", label: "Bokep Videy Indo" },
  { slug: "malaysia", label: "Bokep Malaysia" },
  // /cari landing (2026-11-20): "bokep malay rempit" 168 imp/28 d; sitewide link so Google finds it.
  { slug: "bokep-malaysia-rempit", label: "Bokep Malay Rempit", href: "/cari/bokep-malaysia-rempit" },
  { slug: "bokep", label: "Bokep Indo" },
  // Source collections (2026-11-20): videos from IndoAV / UserBokep, ad-free /cari pages.
  { slug: "bokep-indoav-terbaru", label: "Video dari IndoAV", href: "/cari/bokep-indoav-terbaru" },
  { slug: "bokep-userbokep-indo", label: "Video dari UserBokep", href: "/cari/bokep-userbokep-indo" },
  { slug: "jav", label: "JAV Sub Indo" },
  { slug: "jilbab", label: "Bokep Jilbab" },
  { slug: "viral", label: "Bokep Viral" },
  { slug: "amatir", label: "Bokep Amatir" },
  { slug: "kelas-bintang", label: "Bokep Kelas Bintang" },
  { slug: "tante", label: "Bokep Tante" },
  { slug: "istri", label: "Bokep Istri" },
  { slug: "colmek", label: "Colmek" },
  { slug: "chindo", label: "Bokep Chindo" },
  { slug: "hentai", label: "Hentai" },
];

export function PopularCategories() {
  const publicHref = usePublicHref();
  const localText = usePublicText();
  return (
    <nav aria-label={localText("Kategori populer")} className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">{localText("Kategori populer")}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {POPULAR_CATEGORY_LINKS.map((c) => (
          <li key={c.slug}>
            <a href={publicHref(c.href || `/kategori/${c.slug}`)} className="text-white/80 underline-offset-2 hover:text-white hover:underline">
              {localText(c.label)}
            </a>
          </li>
        ))}
        <li>
          <a href={publicHref("/kategori")} className="font-medium text-white underline-offset-2 hover:underline">
            {localText("Semua kategori →")}
          </a>
        </li>
      </ul>
    </nav>
  );
}
