import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  beforeLoad: () => {
    throw redirect({ to: "/privasi", replace: true, statusCode: 301 });
  },
  component: () => null,
});
