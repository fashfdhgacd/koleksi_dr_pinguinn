import { Outlet, createFileRoute } from "@tanstack/react-router";

/** /en: English keyword landings. */
export const Route = createFileRoute("/en")({
  component: () => <Outlet />,
});
