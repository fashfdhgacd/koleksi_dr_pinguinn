import { Link, createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { CATEGORY_LIST } from "@/lib/catalog/categories";
import { RANKINGS } from "@/lib/catalog/rankings";
import { queryCatalog } from "@/lib/catalog/service";
import type { CategoryInfo } from "@/lib/catalog/types";
import { SITE_ORIGIN } from "@/lib/seo";
import { PixelIcon, PixelSparkle } from "@/components/pixel-icons";

const countFmt = new Intl.NumberFormat("id-ID");

const cardClass =
  "flex h-full min-h-[132px] flex-col items-center justify-center gap-1.5 rounded-none border border-white/45 bg-black px-2 py-4 text-center text-white transition-colors duration-150 hover:border-white/85 sm:min-h-[150px]";

export const Route = createFileRoute("/kategori/")({
  loader: async (): Promise<{ categories: CategoryInfo[]; extra: Record<string, number | undefined> }> => {
    const totalOf = async (p: Promise<unknown>): Promise<number | undefined> => {
      try {
        const r = (await p) as { ok?: boolean; total?: unknown };
        return r && r.ok && typeof r.total === "number" ? r.total : undefined;
      } catch {
        return undefined;
      }
    };
    const [res, latest, views, likes] = await Promise.all([
      queryCatalog({ type: "categories" }),
      totalOf(queryCatalog({ type: "latest", page: 1, limit: 1 })),
      totalOf(queryCatalog({ type: "category", category: "paling-ditonton", page: 1, limit: 1 })),
      totalOf(queryCatalog({ type: "category", category: "paling-disukai", page: 1, limit: 1 })),
    ]);
    const extra = { terbaru: latest, "paling-ditonton": views, "paling-disukai": likes };
    if (res.ok && res.type === "categories" && res.categories.length) return { categories: res.categories, extra };
    return { categories: CATEGORY_LIST, extra };
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
        <PixelIcon slug={slug} className="mb-1" />
        <span className="pixel text-[11px] leading-tight sm:text-[13px]">{label}</span>
        {typeof count === "number" ? (
          <span className="pixel text-[10px] text-white/50 sm:text-xs">{countFmt.format(count)} video</span>
        ) : null}
      </Link>
    </li>
  );
}

function CategoriesPage() {
  const { categories, extra } = Route.useLoaderData();
  return (
    <Shell>
      <section className="relative space-y-6">
        <div className="relative">
          <h1 className="font-display text-5xl leading-none text-foreground sm:text-7xl">Kategori</h1>
          <p className="pixel mt-2 text-[11px] text-white/55 sm:text-sm">Jelajahi koleksi video berdasarkan kategori</p>
          <PixelSparkle className="absolute right-0 top-2 hidden h-[18px] w-[128px] sm:block" />
        </div>

        <ul className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4">
          {RANKINGS.map((r) => (
            <CatCard
              key={r.slug}
              to="/kategori/$slug"
              params={{ slug: r.slug }}
              slug={r.slug}
              label={r.label}
              count={extra?.[r.slug]}
            />
          ))}
          <CatCard
            to="/"
            search={{ q: undefined, category: undefined }}
            slug="terbaru"
            label="Terbaru"
            count={extra?.terbaru}
          />
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
      </section>
    </Shell>
  );
}
