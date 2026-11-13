import { createFileRoute } from "@tanstack/react-router";
import blockFile from "@/lib/catalog/catalog-blocklist.json";
import { removedReport } from "@/lib/catalog/catalog-block.js";

/**
 * Removed ids (bundled blocklist + the owner's /pemilik removals) in the same
 * `{ ids: { [id]: { at } } }` shape as src/lib/catalog/catalog-blocklist.json, so the satellite
 * daily sync can merge it into its own copy. One KV read, edge cached; nothing is written.
 */
const CACHE = "public, max-age=60, s-maxage=300";

export const Route = createFileRoute("/api/satelit/catalog-blocklist.json")({
  server: {
    handlers: {
      GET: async () => {
        let kv: unknown = { ids: {} };
        try {
          const { readCatalogBlockState } = await import("@/lib/catalog/catalog-block-store");
          kv = await readCatalogBlockState();
        } catch {
          kv = { ids: {} };
        }
        const ids: Record<string, { at: number }> = {};
        for (const row of removedReport(blockFile, kv) as Array<{ id: string; at?: number }>) {
          ids[row.id] = { at: Number(row.at) || 0 };
        }
        return new Response(JSON.stringify({ ids }), {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": CACHE,
            "cdn-cache-control": CACHE,
            "x-robots-tag": "noindex, nofollow",
          },
        });
      },
    },
  },
});
