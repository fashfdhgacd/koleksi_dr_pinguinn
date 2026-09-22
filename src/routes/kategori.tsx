import { Link, createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { CATEGORY_LIST } from "@/lib/catalog/categories";
import { SITE_ORIGIN } from "@/lib/seo";

export const Route = createFileRoute("/kategori")({
  head: () => {
    const title = "Kategori | Dr. Pinguin";
    const description = "Pilih kategori di Dr. Pinguin: Jav, AI+, Jilbab, Tante, dan lainnya.";
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
  return (
    <Shell>
      <section className="space-y-6">
        <div>
          <h1 className="font-display text-3xl text-foreground sm:text-4xl">Kategori</h1>
          <p className="mt-1 text-sm text-muted">Pilih kategori tanpa scroll panjang di header.</p>
        </div>

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
          {CATEGORY_LIST.map((cat) => (
            <li key={cat.slug}>
              <Link
                to="/kategori/$slug"
                params={{ slug: cat.slug }}
                className="flex h-14 items-center justify-center rounded-xl border border-border bg-secondary/40 px-3 text-center text-sm font-medium text-foreground active:scale-[0.98]"
              >
                {cat.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  );
}
