import { Link, createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { CATEGORY_LIST } from "@/lib/catalog/categories";
import { RANKINGS } from "@/lib/catalog/rankings";
import { queryCatalog } from "@/lib/catalog/service";
import type { CategoryInfo } from "@/lib/catalog/types";
import { SITE_ORIGIN } from "@/lib/seo";

const countFmt = new Intl.NumberFormat("id-ID");

export const Route = createFileRoute("/kategori/")({
  // Live counts; categories with too few videos are left out by the service.
  loader: async (): Promise<{ categories: CategoryInfo[] }> => {
    const res = await queryCatalog({ type: "categories" });
    if (res.ok && res.type === "categories" && res.categories.length) return { categories: res.categories };
    return { categories: CATEGORY_LIST };
  },
  head: () => {
    const title = "Kategori | Dr. Pinguin";
    const description =
      "Pilih kategori di Dr. Pinguin: Jav, AI+, Jilbab, Tante, Selingkuh, Bule, Mahasiswi, Tobrut, Outdoor, Hotel, dan lainnya.";
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

function CategoriesPage() {
  const { categories } = Route.useLoaderData();
  return (
    <Shell>
      <section className="space-y-6">
        <div>
          <h1 className="font-display text-3xl text-foreground sm:text-4xl">Kategori</h1>
          <p className="mt-1 text-sm text-muted">Pilih kategori tanpa scroll panjang di header.</p>
        </div>

        <ul className="grid grid-cols-2 gap-3" aria-label="Peringkat">
          {RANKINGS.map((r) => (
            <li key={r.slug}>
              <Link
                to="/kategori/$slug"
                params={{ slug: r.slug }}
                className="flex h-20 flex-col items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 text-center text-base font-semibold leading-tight text-foreground active:scale-[0.98]"
              >
                <span>{r.kind === "views" ? "\u{1F525}" : "\u2764\uFE0F"} {r.label}</span>
                <span className="mt-1 text-[11px] font-normal text-muted">
                  {r.kind === "views" ? "Urut jumlah tayangan" : "Urut jumlah suka"}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          <li>
            <Link
              to="/"
              search={{ q: undefined, category: undefined }}
              className="flex h-14 items-center justify-center rounded-xl border border-border bg-secondary/40 px-3 text-center text-sm font-medium text-foreground active:scale-[0.98]"
            >
              Terbaru
            </Link>
          </li>
          {categories.map((cat) => (
            <li key={cat.slug}>
              <Link
                to="/kategori/$slug"
                params={{ slug: cat.slug }}
                className="flex h-14 flex-col items-center justify-center rounded-xl border border-border bg-secondary/40 px-3 text-center text-sm font-medium leading-tight text-foreground active:scale-[0.98]"
              >
                <span>{cat.label}</span>
                {typeof cat.count === "number" ? (
                  <span className="mt-0.5 text-[11px] font-normal text-muted">{countFmt.format(cat.count)} video</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  );
}
