import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/v/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/watch/$id",
      params: { id: params.id },
    });
  },
});
