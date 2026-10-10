import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Shell } from "@/components/layout/shell";
import { CATEGORY_LIST } from "@/lib/catalog/categories";
import { RANKINGS } from "@/lib/catalog/rankings";
import { queryCatalog } from "@/lib/catalog/service";
import type { CategoryInfo } from "@/lib/catalog/types";
import { SITE_ORIGIN } from "@/lib/seo";

const countFmt = new Intl.NumberFormat("id-ID");

function Px({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 32 32" className="size-10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden>
      {children}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  "paling-ditonton": (
    <Px>
      <ellipse cx="16" cy="16" rx="10" ry="6" />
      <circle cx="16" cy="16" r="3" />
      <path d="M8 8l1.5 1.5M24 8l-1.5 1.5M8 24l1.5-1.5M24 24l-1.5-1.5" />
    </Px>
  ),
  "paling-disukai": (
    <Px>
      <path d="M10 14v10h4v-8h3l5 1v-6l-5 1h-3V10a2 2 0 0 0-4 0v4z" />
      <path d="M22 8l1-2M26 12l2-1M24 18l2 1" />
    </Px>
  ),
  terbaru: (
    <Px>
      <rect x="6" y="8" width="20" height="18" />
      <path d="M6 13h20M11 6v4M21 6v4" />
      <circle cx="22" cy="22" r="4" />
      <path d="M22 20.5V22l1.5 1" />
    </Px>
  ),
  jav: (
    <Px>
      <circle cx="16" cy="16" r="10" />
      <text x="16" y="19" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7" fontFamily="Silkscreen, monospace">JAV</text>
    </Px>
  ),
  "ai-plus": (
    <Px>
      <rect x="9" y="9" width="14" height="14" />
      <path d="M13 16h6M16 13v6M6 12h3M6 20h3M23 12h3M23 20h3M12 6v3M20 6v3M12 23v3M20 23v3" />
      <text x="16" y="18.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="6" fontFamily="Silkscreen, monospace">AI</text>
    </Px>
  ),
  jilbab: (
    <Px>
      <path d="M8 26c2-8 4-12 8-14 4 2 6 6 8 14" />
      <path d="M11 14c1-4 3-6 5-6s4 2 5 6" />
      <path d="M14 16c.5 2 1.5 3 2 3s1.5-1 2-3" />
      <path d="M22 10l2-2M24 14l2-1" />
    </Px>
  ),
  tante: (
    <Px>
      <path d="M16 10c-3 0-5 3-5 6v2c0 4 2 8 5 8s5-4 5-8v-2c0-3-2-6-5-6z" />
      <path d="M12 12c-2-1-4 0-5 2M20 12c2-1 4 0 5 2" />
      <path d="M22 8l2-2M25 12l2 1" />
    </Px>
  ),
  amatir: (
    <Px>
      <rect x="5" y="12" width="16" height="12" />
      <path d="M21 16h4l2 2v6h-6" />
      <circle cx="12" cy="18" r="3" />
      <circle cx="26" cy="14" r="1.5" fill="currentColor" />
    </Px>
  ),
  viral: (
    <Px>
      <path d="M16 26c-4 0-7-3-7-7 0-3 2-5 3-7 0 2 1 3 2 3 0-4 2-8 6-10 0 4 2 6 3 8 2 1 3 3 3 6 0 4-3 7-6 7z" />
    </Px>
  ),
  percakapan: (
    <Px>
      <path d="M6 8h14v10H12l-4 4v-4H6z" />
      <path d="M12 14h14v8h-3l-3 3v-3h-4v-4" />
      <circle cx="10" cy="13" r="1" fill="currentColor" />
      <circle cx="13" cy="13" r="1" fill="currentColor" />
      <circle cx="16" cy="13" r="1" fill="currentColor" />
    </Px>
  ),
  kosan: (
    <Px>
      <path d="M6 16L16 7l10 9" />
      <path d="M8 15v11h16V15" />
      <path d="M14 26v-7h4v7" />
      <path d="M22 12c1 1 2 1 3 0l1 3" />
    </Px>
  ),
};

const FALLBACK = (
  <Px>
    <rect x="7" y="7" width="18" height="18" />
    <path d="M12 16h8M16 12v8" />
  </Px>
);

function Sparkle() {
  return (
    <svg viewBox="0 0 80 24" className="h-6 w-24 text-foreground/80" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M12 2v8M8 6h8M12 6l3 3M12 6l-3 3M12 6l3-3M12 6l-3-3" />
      <path d="M28 12h6M38 12h4M46 12h3M53 12h2" />
    </svg>
  );
}

function Drip() {
  return (
    <svg viewBox="0 0 64 48" className="h-16 w-20 text-foreground/70" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M4 8c6 0 8 6 12 6s6-6 12-6 8 6 12 6 6-6 12-6 8 6 8 6" />
      <path d="M14 14v10c0 3 2 5 2 5M28 14v14c0 3-2 5-2 5M42 14v8M50 14v12" />
    </svg>
  );
}

const cardClass =
  "pixel flex min-h-[9.5rem] flex-col items-center justify-center gap-2.5 border border-foreground/40 bg-[#0e0e11] px-3 py-6 text-center text-foreground hover:border-foreground hover:bg-[#16161a] active:scale-[0.99]";

export const Route = createFileRoute("/kategori/")({
  loader: async (): Promise<{ categories: CategoryInfo[] }> => {
    const res = await queryCatalog({ type: "categories" });
    if (res.ok && res.type === "categories" && res.categories.length) return { categories: res.categories };
    return { categories: CATEGORY_LIST };
  },
  head: () => {
    const title = "Kategori | koleksidrpinguin.com";
    const description =
      "Pilih kategori di Koleksi Dr. Pinguin: Jav, AI+, Jilbab, Tante, Selingkuh, Bule, Mahasiswi, Tobrut, Outdoor, Hotel, dan lainnya.";
    const url = `${SITE_ORIGIN}/kategori`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { name: "robots", content: "index,follow" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: CategoriesPage,
});

function CatCard({
  to,
  params,
  search,
  slug,
  label,
  count,
}: {
  to: "/" | "/kategori/$slug";
  params?: { slug: string };
  search?: { q?: undefined; category?: undefined };
  slug: string;
  label: string;
  count?: number;
}) {
  return (
    <li>
      <Link to={to} params={params} search={search} className={cardClass}>
        {ICONS[slug] || FALLBACK}
        <span className="text-sm leading-tight">{label}</span>
        {typeof count === "number" ? (
          <span className="text-[11px] text-muted">{countFmt.format(count)} video</span>
        ) : null}
      </Link>
    </li>
  );
}

function CategoriesPage() {
  const { categories } = Route.useLoaderData();
  return (
    <Shell>
      <section className="relative space-y-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="pixel text-3xl text-foreground sm:text-5xl">Kategori</h1>
            <p className="pixel mt-2 text-xs text-muted sm:text-sm">Jelajahi koleksi video berdasarkan kategori</p>
          </div>
          <Sparkle />
        </div>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {RANKINGS.map((r) => (
            <CatCard key={r.slug} to="/kategori/$slug" params={{ slug: r.slug }} slug={r.slug} label={r.label} />
          ))}
          <CatCard to="/" search={{ q: undefined, category: undefined }} slug="terbaru" label="Terbaru" />
          {categories.map((cat) => (
            <CatCard
              key={cat.slug}
              to="/kategori/$slug"
              params={{ slug: cat.slug }}
              slug={cat.slug}
              label={cat.label}
              count={cat.count}
            />
          ))}
        </ul>

        <div className="pointer-events-none absolute -bottom-2 right-0 hidden sm:block">
          <Drip />
        </div>
      </section>
    </Shell>
  );
}
