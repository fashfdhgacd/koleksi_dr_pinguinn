import { createFileRoute, notFound, redirect, useNavigate } from "@tanstack/react-router";
import { LEGACY_CATEGORY_SLUGS, findCategory } from "@/lib/catalog/categories";
import { categorySeo } from "@/lib/catalog/category-seo";
import { categoryHref, parseHalamanParam } from "@/lib/catalog/halaman";
import { findRanking, periodFromKey, rankingKey, rankingSeo } from "@/lib/catalog/rankings";
import { SITE_ORIGIN } from "@/lib/seo";
import { CategoryExperience } from "./kategori.$slug";
import { queryCatalog } from "@/lib/catalog/service";
import { DEFAULT_PAGE_SIZE } from "@/lib/catalog/types";

function periodeOf(value: unknown): "minggu" | "bulan" | undefined {
  return value === "minggu" || value === "bulan" ? value : undefined;
}

/** /kategori/<slug>/halaman/N */
export const Route = createFileRoute("/kategori/$slug/halaman/$page")({
  validateSearch: (search: Record<string, unknown>) => ({
    periode: periodeOf(search.periode),
  }),
  beforeLoad: ({ params, search }) => {
    const renamed = LEGACY_CATEGORY_SLUGS[String(params.slug || "").trim().toLowerCase()];
    const page = parseHalamanParam(params.page);
    if (renamed) {
      throw redirect({
        href: `${SITE_ORIGIN}${categoryHref(renamed, page || 1, search.periode)}`,
        statusCode: 301,
      });
    }
    if (params.page === "1" || !page) {
      throw redirect({
        href: `${SITE_ORIGIN}${categoryHref(params.slug, 1, search.periode)}`,
        statusCode: params.page === "1" ? 301 : 302,
      });
    }
    if (!findRanking(params.slug) && !findCategory(params.slug)) throw notFound();
  },
  loader: async ({ params, location }) => {
    const page = parseHalamanParam(params.page) || 2;
    const periode = periodeOf((location.search as { periode?: unknown }).periode);
    const rank = findRanking(params.slug);
    if (rank) {
      return queryCatalog({
        type: "category",
        category: rankingKey(rank.slug, periode),
        page,
        limit: DEFAULT_PAGE_SIZE,
      });
    }
    const res = await queryCatalog({ type: "category", category: params.slug, page, limit: DEFAULT_PAGE_SIZE });
    if (res.ok && res.type === "category" && res.total > 0) {
      const last = Math.max(1, Math.ceil(res.total / (res.limit || DEFAULT_PAGE_SIZE)));
      if (page > last) {
        throw redirect({ href: `${SITE_ORIGIN}${categoryHref(params.slug, last)}`, statusCode: 302 });
      }
    }
    return res;
  },
  head: ({ params, match }) => {
    const page = parseHalamanParam(params.page) || 2;
    const periode = match.search.periode;
    const rank = findRanking(params.slug);
    const seo = rank ? rankingSeo(rank, periodFromKey(periode).period) : categorySeo(params.slug);
    const title = seo.title.replace(/ \| koleksidrpinguin\.com$/, ` – Halaman ${page} | koleksidrpinguin.com`);
    const description = `Halaman ${page}: ${seo.description}`;
    const url = `${SITE_ORIGIN}${categoryHref(params.slug, page, periode)}`;
    const indexable = page <= 5;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: indexable ? "index,follow" : "noindex,follow" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
      ],
      links: [
        { rel: "canonical", href: url },
        { rel: "prev", href: `${SITE_ORIGIN}${categoryHref(params.slug, page - 1, periode)}` },
        { rel: "next", href: `${SITE_ORIGIN}${categoryHref(params.slug, page + 1, periode)}` },
      ],
    };
  },
  component: CategoryHalaman,
});

function CategoryHalaman() {
  const { slug, page: raw } = Route.useParams();
  const { periode } = Route.useSearch();
  const page = parseHalamanParam(raw) || 2;
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate({ from: "/kategori/$slug/halaman/$page" });
  return (
    <CategoryExperience
      slug={slug}
      page={page}
      periode={periode}
      loaderData={loaderData}
      onPage={(next) => {
        if (next <= 1) {
          navigate({ to: "/kategori/$slug", params: { slug }, search: { page: undefined, periode } });
        } else if (next !== page) {
          navigate({
            to: "/kategori/$slug/halaman/$page",
            params: { slug, page: String(next) },
            search: { periode },
          });
        }
      }}
    />
  );
}
