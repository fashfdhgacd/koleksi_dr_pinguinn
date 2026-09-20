import type { CatalogResponse } from "./types";

export type ClientQuery = {
  type: string;
  page?: number;
  limit?: number;
  category?: string;
  q?: string;
  id?: string;
};

export function catalogPath(query: ClientQuery): string {
  const params = new URLSearchParams();
  params.set("type", query.type);
  if (query.page != null) params.set("page", String(query.page));
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.category) params.set("category", query.category);
  if (query.q) params.set("q", query.q);
  if (query.id) params.set("id", query.id);
  return `/api/data?${params.toString()}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Retry 499/502/503/504 — Vercel kadang batalkan request (cold start / abort). */
export async function fetchCatalog(
  query: ClientQuery,
  signal?: AbortSignal,
): Promise<CatalogResponse> {
  const path = catalogPath(query);
  const maxAttempts = 3;
  let lastStatus = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      return { ok: false, error: "Dibatalkan.", code: "upstream" };
    }
    try {
      const res = await fetch(path, {
        signal,
        headers: { accept: "application/json" },
      });
      lastStatus = res.status;
      let body: CatalogResponse | null = null;
      try {
        body = (await res.json()) as CatalogResponse;
      } catch {
        body = null;
      }
      if (body && typeof body === "object" && "ok" in body) return body;

      if ([499, 502, 503, 504, 408].includes(res.status) && attempt < maxAttempts) {
        await sleep(300 * attempt);
        continue;
      }

      return {
        ok: false,
        error: res.ok ? "Respons katalog tidak valid." : `Gagal memuat katalog (${res.status}).`,
        code: "upstream",
      };
    } catch (err) {
      if (signal?.aborted) {
        return { ok: false, error: "Dibatalkan.", code: "upstream" };
      }
      if (attempt < maxAttempts) {
        await sleep(300 * attempt);
        continue;
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Gagal memuat katalog.",
        code: "upstream",
      };
    }
  }

  return {
    ok: false,
    error: `Gagal memuat katalog (${lastStatus || "network"}).`,
    code: "upstream",
  };
}
