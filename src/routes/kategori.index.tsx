import { Link, createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { CATEGORY_LIST } from "@/lib/catalog/categories";
import { RANKINGS } from "@/lib/catalog/rankings";
import { queryCatalog } from "@/lib/catalog/service";
import type { CategoryInfo } from "@/lib/catalog/types";
import { SITE_ORIGIN } from "@/lib/seo";

const countFmt = new Intl.NumberFormat("id-ID");

const ICONS: Record<string, string> = {
  "paling-ditonton": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAATklEQVR4nO3UQQoAIAhEUY3uf2XbB2EoYeB/62pMUBEA6E69A2ZmqQBVN+NZ+M0bIxuQNSOXTr+KtLu8AxRAAaEpSC2XTXkH/l7FANDCAiddFBVdHAg/AAAAAElFTkSuQmCC",
  "paling-disukai": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAS0lEQVR4nO3RQQoAIAgF0ez+d/5t3LQoNIqI5q1ThiwFAPA7iz6UpG7QLDw7U3cseTpg+QTDhcnTbP8BuWsBWeEAc9cCTiGAAAIANNguEBuTVzaaAAAAAElFTkSuQmCC",
  "terbaru": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAX0lEQVR4nO2VsQrAMAgFNfT/f7ldMrUFtVZ0uNtCDJ7Jg4gAQIBz83X/jZXXyqFWQXSiRwNVs0eZgOds+xO0CxyeomwOUpCBUQL3K7XWv0AGRgmQgQoQaBeY/xsCVHMBs7RT1GtiWfwAAAAASUVORK5CYII=",
  "jav": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAZElEQVR4nO2UwQoAIQhEm6X//2X3FHRw18AkgvdORahjTbYGAAABZmaV+Z/K5Cv0TLB3O5I0zsba228RMBf8EhRx/AkQkPZA9pveZ8Ldg+kOD8xde8PkL06Sqsd5KOJYcQCAFV5sWzANach5qQAAAABJRU5ErkJggg==",
  "ai-plus": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAYUlEQVR4nO2USwoAIAhEM7r/lW0lRC2yLMKct+ozgsxkKQEAQHRoJmBmHoqIqL+Ts+P0Dcz2q2RL8Qn+bUAbzXMHika08tBaraxNE7I7BW4iuNaA1nbfDkjO1t8QAABiUwHmQjvq78K6mQAAAABJRU5ErkJggg==",
  "jilbab": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAT0lEQVR4nO2VMQ4AIAjEwP//+ZydBCFhsJ3lrgkJmgHA73j0oSSlgt3D2e3lmZmV1+kFAQQQQGBc4HqvX87wUVD5E6rlkYzxFSCAwLgAwAbpKBgTdtIMtAAAAABJRU5ErkJggg==",
  "tante": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAV0lEQVR4nO2UMQoAIAzEWv//Z10cHARbtZRCMjkcXgQ5EYAH+iStfHcuh3rC1peqquver+XebLvT+QcCCCAA7sk8rVzIDFvLrZmV9E+IAALpArV2ACCCAdFFK/54oTMuAAAAAElFTkSuQmCC",
  "amatir": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAZUlEQVR4nO2VUQ7AIAhDxez+V2b/RpK1kKBL369BKm1wDCGE+BPu7mjNrG7OiGjFooPsS8wsvPsTGQFIbVkGWNoFPGhBNF7Wc1jArlkmL+0WSACVgcp1CwtIb7iFsy247mcTQjC82CMoDO6oNnQAAAAASUVORK5CYII=",
  "viral": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAXUlEQVR4nO3WQQpAIQgEUO9/aVsJEUpF5JT6lm10Yuh/olLKIWZm+HDIEuNQ1yWsYS5LzIZAO3Gdlm717H+7xctzC3k6IPp02lMcO73I1XwL9Gv4DOgPyTNypy8hNCFQc42IVEMvAAAAAElFTkSuQmCC",
  "percakapan": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAb0lEQVR4nO2UQQrAMAgEY8n/v7w99ZLailhF0p1LwIMZotkxCPk7shYAwNVA5NYjhEfAK6txRBvsLXA98Xqmwh2oZmrFkllbVEm8phgAWEmXnpzWBdFfYy7h51nvFciGAhRQk9BLi+R8ooUcJUhrTi9qS+WmEcM6AAAAAElFTkSuQmCC",
  "kosan": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAbElEQVR4nO2UMQ7AIAwDSdX/fzndOqAiUhfjDr49uRMgWjPGmI9kZsrlkoheujViJNsSMZNQI6rLKRFvly6NQJdV5oIlvwURUwctoDJ7oMtXIQ84kaHR0SL3DQU8ydC3Ir8CB8gD/v8TGsPmAlq5U9O89IRZAAAAAElFTkSuQmCC",
};

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
  const src = ICONS[slug];
  return (
    <li>
      <Link to={to} params={params} search={search} className={cardClass}>
        {src ? (
          <img
            src={src}
            alt=""
            width={32}
            height={32}
            className="size-12 [image-rendering:pixelated]"
            style={{ imageRendering: "pixelated" }}
          />
        ) : (
          <span className="size-12 border border-foreground/30" />
        )}
        <span className="text-sm leading-tight">{label}</span>
        {typeof count === "number" ? (
          <span className="text-[11px] text-muted">{countFmt.format(count)} video</span>
        ) : null}
      </Link>
    </li>
  );
}

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
