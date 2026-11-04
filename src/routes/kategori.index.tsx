import { Link, createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/layout/shell";
import { PUBLIC_CATEGORY_LIST } from "@/lib/catalog/categories";
import { RANKINGS } from "@/lib/catalog/rankings";
import { LANDINGS } from "@/lib/catalog/landing";
import { queryCatalog } from "@/lib/catalog/service";
import type { CategoryInfo } from "@/lib/catalog/types";
import { HOME_CANONICAL, SITE_NAME, SITE_ORIGIN, breadcrumbJsonLd, collectionPageJsonLd } from "@/lib/seo";
import { jsonLdString } from "@/lib/json-ld";
import { PixelSparkle } from "@/components/pixel-icons";
import { VideoThumb } from "@/components/video/thumb";

const countFmt = new Intl.NumberFormat("id-ID");

export const Route = createFileRoute("/kategori/")({
  loader: async (): Promise<{ categories: CategoryInfo[]; specials: CategoryInfo[]; extra: Record<string, number | undefined> }> => {
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
    if (res.ok && res.type === "categories" && res.categories.length) return { categories: res.categories, specials: res.specials || [], extra };
    return { categories: PUBLIC_CATEGORY_LIST, specials: [], extra };
  },
  head: () => {
    // CTR experiment 2026-11-02 (GSC pos 13.2, CTR 7.4%): the old 83-char title was cut off in the SERP.
    const title = "Kategori Bokep Indo Viral, JAV, AI & Videy | koleksidrpinguin.com";
    const description =
      "Semua kategori Koleksi Dr. Pinguin di satu halaman: bokep indo viral, videy, JAV sub indo, AI indo, Malaysia, jilbab, tante dan lainnya. Pilih, lalu tonton di HP.";
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
      scripts: [
        {
          type: "application/ld+json",
          children: jsonLdString(collectionPageJsonLd({ name: title, url, description })),
        },
        {
          type: "application/ld+json",
          children: jsonLdString(
            breadcrumbJsonLd([
              { name: SITE_NAME, url: HOME_CANONICAL },
              { name: "Kategori", url },
            ]),
          ),
        },
      ],
    };
  },
  component: CategoriesPage,
});

const coverCardClass =
  "group relative block h-full min-h-[132px] overflow-hidden rounded-none border border-white/45 bg-black text-white transition-colors duration-150 hover:border-white/85 sm:min-h-[150px]";

/** Thumbnail (server-picked, unique on the page; poster when empty) with label + count over a dark gradient. */
function CoverInner({ label, count, cover, coverId }: { label: string; count?: number; cover?: string; coverId?: string }) {
  return (
    <>
      <VideoThumb src={cover || ""} videoId={coverId || ""} alt={label} className="absolute inset-0" />
      <span className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/90 via-black/60 to-transparent px-2 pb-1.5 pt-6">
        <span className="pixel text-[11px] leading-tight sm:text-[13px]">{label}</span>
        {typeof count === "number" ? (
          <span className="pixel text-[10px] text-white/60 sm:text-xs">{countFmt.format(count)} video</span>
        ) : null}
      </span>
    </>
  );
}

/** A category or ranking card (/kategori/<slug>). */
function CoverCard({ slug, label, count, cover, coverId }: CategoryInfo) {
  return (
    <li>
      <Link to="/kategori/$slug" params={{ slug }} search={{ page: undefined, periode: undefined }} className={coverCardClass}>
        <CoverInner label={label} count={count} cover={cover} coverId={coverId} />
      </Link>
    </li>
  );
}

function CategoriesPage() {
  const { categories, extra, specials } = Route.useLoaderData();
  const special = (slug: string) => {
    const s = specials.find((x) => x.slug === slug);
    return { cover: s?.cover, coverId: s?.coverId };
  };
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
            <CoverCard key={r.slug} {...special(r.slug)} slug={r.slug} label={r.label} count={extra?.[r.slug]} />
          ))}
          <li>
            <Link to="/" search={{ q: undefined, category: undefined }} className={coverCardClass}>
              <CoverInner label="Terbaru" count={extra?.terbaru} {...special("terbaru")} />
            </Link>
          </li>
          {categories.map((cat) => (
            <CoverCard key={cat.slug} {...cat} />
          ))}
        </ul>

        <nav aria-label="Pencarian populer">
          <h2 className="mb-2 text-sm font-semibold text-zinc-300">Pencarian populer</h2>
          <div className="flex flex-wrap gap-2">
            {LANDINGS.map((l) => (
              <a
                key={l.slug}
                href={`/cari/${l.slug}`}
                className="inline-flex h-8 items-center rounded-full border border-white/10 px-3 text-sm text-zinc-300 hover:border-teal-400/60 hover:text-teal-200"
              >
                {l.h1}
              </a>
            ))}
          </div>
        </nav>
      </section>
    </Shell>
  );
}
