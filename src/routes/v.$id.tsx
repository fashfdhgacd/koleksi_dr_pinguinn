import { createFileRoute, redirect } from "@tanstack/react-router";
import { SITE_ORIGIN } from "@/lib/seo";

export const Route = createFileRoute("/v/$id")({
  beforeLoad: ({ params }) => {
    const id = encodeURIComponent((params.id || "").trim());
    throw redirect({
      href: `${SITE_ORIGIN}/watch/${id}`,
      statusCode: 301,
    });
  },
});
