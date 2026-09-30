import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/putarin")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true, statusCode: 301 });
  },
  component: () => null,
});
