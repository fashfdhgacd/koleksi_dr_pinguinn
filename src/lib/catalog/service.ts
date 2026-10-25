import { fetchCatalog } from "./client";
import type { CatalogQuery } from "./service-server";
import type { CatalogResponse } from "./types";

export type { CatalogQuery } from "./service-server";

function toNum(value: string | number | null | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Server: reads the bundled catalog directly (service-server.ts). Browser: asks /api/data (edge
 * cached) instead. The server module is only reachable through the SSR branch, so the browser bundle
 * no longer carries the whole video catalog (it was ~1.3 MB of JS on every first visit).
 */
export async function queryCatalog(query: CatalogQuery, signal?: AbortSignal): Promise<CatalogResponse> {
  if (import.meta.env.SSR) {
    const { queryCatalogServer } = await import("./service-server");
    return queryCatalogServer(query, signal);
  }
  return fetchCatalog(
    {
      type: String(query.type || "latest"),
      page: toNum(query.page),
      limit: toNum(query.limit),
      category: query.category || undefined,
      q: query.q || undefined,
      id: query.id || undefined,
    },
    signal,
  );
}
