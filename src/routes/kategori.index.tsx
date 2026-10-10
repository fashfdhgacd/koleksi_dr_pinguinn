import { Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Shell } from "@/components/layout/shell";
import { CATEGORY_LIST } from "@/lib/catalog/categories";
import { RANKINGS } from "@/lib/catalog/rankings";
import { queryCatalog } from "@/lib/catalog/service";
import type { CategoryInfo } from "@/lib/catalog/types";
import { SITE_ORIGIN } from "@/lib/seo";

const countFmt = new Intl.NumberFormat("id-ID");

function Icon({ d, extra }: { d: string; extra?: ReactNode }) {
  return (
    <svg viewBox="0 0 48 48" className="size-11 text-foreground" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="miter" aria-hidden>
      <path d={d} />
      {extra}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  "paling-ditonton": (
    <Icon
      d="M8 24c6-10 26-10 32 0-6 10-26 10-32 0zM24 18a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"
      extra={
        <>
          <circle cx="24" cy="24" r="2.2" fill="currentColor" stroke="none" />
          <path d="M6 10l2 2M42 10l-2 2M6 38l2-2M42 38l-2-2" />
        </>
      }
    />
  ),
  "paling-disukai": (
    <Icon
      d="M14 20v16h6V22h5l8 2V12l-8 2h-5V16a3 3 0 0 0-6 0v4z"
      extra={
        <path d="M36 8l1.5-3M42 16l3-1.5M40 26l3 1.5M34 14l2-2" />
      }
    />
  ),
  terbaru: (
    <Icon
      d="M10 14h28v24H10zM10 20h28M16 10v6M32 10v6"
      extra={
        <>
          <circle cx="34" cy="32" r="6" />
          <path d="M34 29.5V32l2 1.5" />
        </>
      }
    />
  ),
  jav: (
    <svg viewBox="0 0 48 48" className="size-11 text-foreground" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="24" cy="24" r="16" />
      <text x="24" y="27" textAnchor="middle" fill="currentColor" stroke="none" fontSize="9" fontFamily="Silkscreen, monospace">JAV</text>
      <path d="M36 10l2-2M38 14l2-1" />
    </svg>
  ),
  "ai-plus": (
    <svg viewBox="0 0 48 48" className="size-11 text-foreground" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="14" y="14" width="20" height="20" />
      <path d="M14 20h-6M14 28h-6M34 20h6M34 28h6M20 14v-6M28 14v-6M20 34v6M28 34v6" />
      <text x="24" y="27" textAnchor="middle" fill="currentColor" stroke="none" fontSize="8" fontFamily="Silkscreen, monospace">AI</text>
    </svg>
  ),
  jilbab: (
    <Icon
      d="M10 38c2-12 6-18 14-20 8 2 12 8 14 20M16 20c1-6 4-9 8-9s7 3 8 9M18 24c1 3 2.5 4 6 4s5-1 6-4"
      extra={<path d="M34 12l2.5-2.5M36 18l2.5-1" />} />
  ),
  tante: (
    <Icon
      d="M24 12c-5 0-8 5-8 10v3c0 7 3 13 8 13s8-6 8-13v-3c0-5-3-10-8-10zM16 16c-3-1-6 1-7 4M32 16c3-1 6 1 7 4"
      extra={<path d="M34 8l2.5-2.5M38 14l2.5 1" />} />
  ),
  amatir: (
    <Icon
      d="M6 18h22v16H6zM28 24h6l4 3v7h-10"
      extra={
        <>
          <circle cx="17" cy="26" r="4" />
          <circle cx="40" cy="20" r="2" fill="#c45c4a" stroke="none" />
        </>
      }
    />
  ),
  viral: (
    <Icon d="M24 40c-6 0-10-5-10-11 0-5 3-8 4-11 0 3 2 4 3 4 0-6 3-12 9-15 0 6 3 9 5 12 3 1 4 4 4 9 0 7-5 12-9 12z" />
  ),
  percakapan: (
    <Icon
      d="M6 10h20v14H14l-6 6v-6H6zM16 20h22v12h-5l-4 5v-5h-8v-6"
      extra={
        <>
          <circle cx="12" cy="17" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="16" cy="17" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="20" cy="17" r="1.2" fill="currentColor" stroke="none" />
        </>
      }
    />
  ),
  kosan: (
    <Icon
      d="M6 22L24 8l18 14M10 21v18h28V21M20 39v-10h8v10"
      extra={<path d="M34 16c2 2 4 2 6 0l2 5" />} />
  ),
};

const FALLBACK = <Icon d="M12 12h24v24H12zM20 24h8M24 20v8" />;

function Sparkle() {
  return (
    <svg viewBox="0 0 90 28" className="h-7 w-28 text-foreground/80" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M14 2v10M9 7h10M14 7l4 4M14 7l-4 4M14 7l4-4M14 7l-4-4" />
      <path d="M34 14h8M46 14h5M55 14h4M63 14h3" />
    </svg>
  );
}

function Drip() {
  return (
    <svg viewBox="0 0 72 52" className="h-16 w-24 text-foreground/70" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M2 10c8 0 10 8 16 8s8-8 16-8 10 8 16 8 8-8 16-8" />
      <path d="M16 18v12c0 4 3 6 3 6M34 18v16c0 4-3 6-3 6M48 18v10M56 18v14" />
    </svg>
  );
}

const cardClass =
  "pixel flex min-h-[10rem] flex-col items-center justify-center gap-2.5 border border-foreground/35 bg-[#0d0d10] px-3 py-6 text-center text-foreground hover:border-foreground/80 hover:bg-[#141418] active:scale-[0.99]";

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
