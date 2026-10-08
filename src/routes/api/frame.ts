import { createFileRoute } from "@tanstack/react-router";

/**
 * RETIRED (security audit 2026-10-08). This used to proxy IndoAV embed HTML and serve it on our own
 * origin (with `frame-ancestors *`, following redirects without re-checking the host), which would let
 * third-party scripts run as koleksidrpinguin.com. Nothing in the site uses it any more, so every
 * method now answers a plain 404. The file only stays so the route tree keeps a stable shape; it can be
 * deleted together with its routeTree.gen.ts entry.
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

export const Route = createFileRoute("/api/frame")({
  server: {
    handlers: {
      GET: async () => gone(),
      POST: async () => gone(),
    },
  },
});
