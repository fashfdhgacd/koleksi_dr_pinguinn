import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  beforeLoad: () => {
    throw redirect({ to: "/syarat", replace: true, statusCode: 301 });
  },
  component: () => null,
});
