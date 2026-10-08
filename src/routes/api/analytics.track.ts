import { createFileRoute } from "@tanstack/react-router";

/**
 * RETIRED (security audit 2026-10-08). This public endpoint wrote to D1 on every call with no rate
 * limit, and the site never used it (presence/pageviews go through /api/online). Every method now
 * answers a plain 404 without touching storage. The file only stays so the route tree keeps a stable
 * shape; it can be deleted together with its routeTree.gen.ts entry.
 */
function gone(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export const Route = createFileRoute("/api/analytics/track")({
  server: {
    handlers: {
      GET: async () => gone(),
      POST: async () => gone(),
    },
  },
});
