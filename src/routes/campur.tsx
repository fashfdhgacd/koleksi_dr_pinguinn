import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/campur")({
  beforeLoad: () => {
    throw redirect({ to: "/kategori", replace: true, statusCode: 301 });
  },
  component: () => null,
});
