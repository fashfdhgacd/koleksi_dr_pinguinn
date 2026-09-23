import { createFileRoute } from "@tanstack/react-router";
import { OwnerDashboard } from "@/components/owner-dashboard";

export const Route = createFileRoute("/pemilik")({
  head: () => ({
    meta: [
      { title: "Pemilik | Dr. Pinguin" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: Page,
});

function Page() {
  return <OwnerDashboard />;
}
