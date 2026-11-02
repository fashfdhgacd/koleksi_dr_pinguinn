/**
 * Site-wide crawlable links to the top landing pages (SEO internal linking, 2026-11-02).
 * Static list: plain <a href> in the SSR HTML, no data fetch, so it costs nothing per visit.
 */
export const POPULAR_CATEGORY_LINKS: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: "paling-ditonton", label: "Paling Ditonton" },
  { slug: "ai-plus", label: "Bokep AI+" },
  { slug: "ai-indo", label: "Bokep Indo AI" },
  { slug: "videy", label: "Bokep Videy" },
  { slug: "malaysia", label: "Bokep Malaysia" },
  { slug: "bokep", label: "Bokep Indo" },
  { slug: "jav", label: "JAV Sub Indo" },
  { slug: "jilbab", label: "Bokep Jilbab" },
  { slug: "viral", label: "Bokep Viral" },
  { slug: "amatir", label: "Bokep Amatir" },
  { slug: "kelas-bintang", label: "Kelas Bintang" },
  { slug: "tante", label: "Bokep Tante" },
  { slug: "istri", label: "Bokep Istri" },
  { slug: "colmek", label: "Colmek" },
  { slug: "chindo", label: "Bokep Chindo" },
  { slug: "hentai", label: "Hentai" },
];

export function PopularCategories() {
  return (
    <nav aria-label="Kategori populer" className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Kategori populer</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        {POPULAR_CATEGORY_LINKS.map((c) => (
          <li key={c.slug}>
            <a href={`/kategori/${c.slug}`} className="text-white/80 underline-offset-2 hover:text-white hover:underline">
              {c.label}
            </a>
          </li>
        ))}
        <li>
          <a href="/kategori" className="font-medium text-white underline-offset-2 hover:underline">
            Semua kategori →
          </a>
        </li>
      </ul>
    </nav>
  );
}
