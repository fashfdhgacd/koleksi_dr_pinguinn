import { createFileRoute, notFound, redirect, useNavigate } from "@tanstack/react-router";
import { cariHref, parseHalamanParam } from "@/lib/catalog/halaman";
import { findLanding } from "@/lib/catalog/landing";
import { SITE_ORIGIN } from "@/lib/seo";
import { CariExperience, landingHead, loadLanding } from "./cari.$slug";

/** /cari/<slug>/halaman/N */
export const Route = createFileRoute("/cari/$slug/halaman/$page")({
  beforeLoad: ({ params }) => {
    if (!findLanding(params.slug)) throw notFound();
    if (params.page === "1") {
      throw redirect({ href: `${SITE_ORIGIN}${cariHref(params.slug, 1)}`, statusCode: 301 });
    }
    if (!parseHalamanParam(params.page)) throw notFound();
  },
  loader: ({ params }) => loadLanding(params.slug, parseHalamanParam(params.page) || 2),
  head: ({ params, loaderData }) => landingHead(params.slug, parseHalamanParam(params.page) || 2, loaderData),
  component: CariHalaman,
});

function CariHalaman() {
  const { slug, page: raw } = Route.useParams();
  const page = parseHalamanParam(raw) || 2;
  const data = Route.useLoaderData();
  const navigate = useNavigate({ from: "/cari/$slug/halaman/$page" });
  return (
    <CariExperience
      slug={slug}
      data={data}
      onPage={(next) => {
        if (next <= 1) navigate({ to: "/cari/$slug", params: { slug } });
        else if (next !== page) navigate({ to: "/cari/$slug/halaman/$page", params: { slug, page: String(next) } });
      }}
    />
  );
}
