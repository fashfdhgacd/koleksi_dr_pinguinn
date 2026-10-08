import { createFileRoute } from "@tanstack/react-router";
import { getOwnerStats } from "@/lib/owner-analytics";
import { isOwnerRequest } from "@/lib/owner-auth";

export const Route = createFileRoute("/api/analytics/overview")({
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
          onlineNow: stats.online,
          peakToday: stats.peakToday,
          views24h: stats.views24h,
          viewsToday: stats.viewsToday,
          uniqueToday: stats.uniqueToday,
          views7d: stats.views7d,
          views30d: stats.views30d,
          updatedAt: stats.updatedAt,
          status: stats.analytics === "operational" ? "ok" : "unavailable",
          database: stats.database,
          storage: stats.storage,
          persistOk: stats.persistOk,
          topPaths: stats.topPaths,
          topVideos: stats.topVideos,
          topRefs: stats.topRefs,
          devices: stats.devices,
        }, { headers: { "cache-control": "private, no-store" } });
      },
    },
  },
});
