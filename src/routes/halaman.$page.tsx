import { createFileRoute, notFound, redirect, useNavigate } from "@tanstack/react-router";
import { homeHref, parseHalamanParam } from "@/lib/catalog/halaman";
import { HOME_CANONICAL, SITE_ORIGIN, homeJsonLd } from "@/lib/seo";
import { jsonLdString } from "@/lib/json-ld";
import { HomeExperience, loadHome } from "./index";

const DEEP_PAGE_NOINDEX = 5;

/** /halaman/N: crawlable home pagination. /halaman/1 is redirected to /. */
export const Route = createFileRoute("/halaman/$page")({
  beforeLoad: ({ params }) => {
    if (params.page === "1") throw redirect({ href: HOME_CANONICAL, statusCode: 301 });
    if (!parseHalamanParam(params.page)) throw notFound();
  },
  loader: ({ params }) => loadHome({ search: { page: parseHalamanParam(params.page) || 2 } }),
  head: ({ params }) => {
    const page = parseHalamanParam(params.page) || 2;
    const title = `Bokep Indo Terbaru Halaman ${page} | Dr. Pinguin`;
    const description = `Halaman ${page}: bokep indo terbaru, update setiap hari, streaming tanpa VPN di koleksidrpinguin.com. Khusus 18+.`;
    const url = `${SITE_ORIGIN}${homeHref(page)}`;
    const indexable = page <= DEEP_PAGE_NOINDEX;
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
        { rel: "prev", href: page === 2 ? HOME_CANONICAL : `${SITE_ORIGIN}${homeHref(page - 1)}` },
        { rel: "next", href: `${SITE_ORIGIN}${homeHref(page + 1)}` },
      ],
      scripts: [{ type: "application/ld+json", children: jsonLdString(homeJsonLd()) }],
    };
  },
  component: HalamanHome,
});

function HalamanHome() {
  const { page: raw } = Route.useParams();
  const page = parseHalamanParam(raw) || 2;
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate({ from: "/halaman/$page" });
  return (
    <HomeExperience
      page={page}
      loaderData={loaderData}
      onPage={(next) => {
        if (next <= 1) navigate({ to: "/" });
        else navigate({ to: "/halaman/$page", params: { page: String(next) } });
      }}
    />
  );
}
