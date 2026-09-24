import { createFileRoute } from "@tanstack/react-router";
import { getOwnerStats } from "@/lib/owner-analytics";

function viewSecret(): string {
  const a = (process.env.ONLINE_VIEW_SECRET || "").trim();
  if (a) return a;
  return (process.env.OWNER_SECRET || process.env.PEMILIK_SECRET || "").trim();
}

function isOwner(request: Request): boolean {
  const secret = viewSecret();
  if (!secret) return false;
  const key =
    request.headers.get("x-online-key") ||
    new URL(request.url).searchParams.get("key") ||
    "";
  return key.trim() === secret;
}

export const Route = createFileRoute("/api/analytics/hourly")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isOwner(request)) {
          return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
        }
        const stats = await getOwnerStats();
        return Response.json({
          ok: true,
          hourly: stats.hourly,
          updatedAt: stats.updatedAt,
        });
      },
    },
  },
});
