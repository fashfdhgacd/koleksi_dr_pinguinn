import { createFileRoute, notFound, redirect, useNavigate } from "@tanstack/react-router";
import { enHref, parseHalamanParam } from "@/lib/catalog/halaman";
import { findEnLanding } from "@/lib/catalog/en-landing";
import { listEnLandingPage } from "@/lib/catalog/en-landing-query";
import { SITE_ORIGIN } from "@/lib/seo";
import { EnExperience, enLandingHead } from "./en.$slug";

/** /en/<slug>/halaman/N */
export const Route = createFileRoute("/en/$slug/halaman/$page")({
  beforeLoad: ({ params }) => {
    if (!findEnLanding(params.slug)) throw notFound();
    if (params.page === "1") {
      throw redirect({ href: `${SITE_ORIGIN}${enHref(params.slug, 1)}`, statusCode: 301 });
    }
    if (!parseHalamanParam(params.page)) throw notFound();
  },
  loader: ({ params }) => listEnLandingPage(params.slug, parseHalamanParam(params.page) || 2),
  head: ({ params, loaderData }) => enLandingHead(params.slug, parseHalamanParam(params.page) || 2, loaderData),
  component: EnHalaman,
});

function EnHalaman() {
  const { slug, page: raw } = Route.useParams();
  const page = parseHalamanParam(raw) || 2;
  const data = Route.useLoaderData();
  const navigate = useNavigate({ from: "/en/$slug/halaman/$page" });
  return (
    <EnExperience
      slug={slug}
      data={data}
      onPage={(next) => {
        if (next <= 1) navigate({ to: "/en/$slug", params: { slug } });
        else if (next !== page) navigate({ to: "/en/$slug/halaman/$page", params: { slug, page: String(next) } });
      }}
    />
  );
}
