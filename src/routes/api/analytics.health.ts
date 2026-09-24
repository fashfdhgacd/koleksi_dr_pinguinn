import { createFileRoute } from "@tanstack/react-router";
import { analyticsHealth } from "@/lib/owner-analytics";

export const Route = createFileRoute("/api/analytics/health")({
  server: {
    handlers: {
      GET: async () => {
        const health = await analyticsHealth();
        return Response.json({
          database: health.database,
          analytics: health.analytics,
          timestamp: health.timestamp,
        });
      },
    },
  },
});
