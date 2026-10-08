import { createFileRoute } from "@tanstack/react-router";
import { getOwnerStats } from "@/lib/owner-analytics";
import { isOwnerRequest } from "@/lib/owner-auth";

export const Route = createFileRoute("/api/analytics/hourly")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await isOwnerRequest(request))) {
          return Response.json(
            { ok: false, error: "forbidden" },
            { status: 403, headers: { "cache-control": "no-store" } },
          );
        }
        const stats = await getOwnerStats();
        return Response.json({
          ok: true,
          hourly: stats.hourly,
          updatedAt: stats.updatedAt,
        }, { headers: { "cache-control": "private, no-store" } });
      },
    },
  },
});
