import { createFileRoute } from "@tanstack/react-router";
import blockFile from "@/lib/catalog/catalog-blocklist.json";
import { removedReport } from "@/lib/catalog/catalog-block.js";
import { CONFIG_CACHE, toPublicConfig } from "@/lib/satelit/config";

/**
 * Public read-only satellite config. One KV read for settings and one for the catalog
 * blocklist, then the edge cache (scripts/cf-worker-entry.mjs) serves it. Nothing is written.
 */
async function blockedIds(): Promise<string[]> {
  let kv: unknown = { ids: {} };
  try {
    const { readCatalogBlockState } = await import("@/lib/catalog/catalog-block-store");
    kv = await readCatalogBlockState();
  } catch {
    kv = { ids: {} };
  }
  return removedReport(blockFile, kv).map((row) => row.id);
}

function json(data: unknown, status = 200): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": status === 200 ? CONFIG_CACHE : "no-store",
    "cdn-cache-control": status === 200 ? CONFIG_CACHE : "no-store",
    "x-robots-tag": "noindex, nofollow",
  };
  return new Response(JSON.stringify(data), { status, headers });
}

export const Route = createFileRoute("/api/satelit/config.json")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { readSatelitState } = await import("@/lib/satelit/store");
          const [state, blocked] = await Promise.all([readSatelitState(), blockedIds()]);
          return json(toPublicConfig(state, blocked));
        } catch {
          return json({ ok: false, error: "unavailable" }, 503);
        }
      },
    },
  },
});
