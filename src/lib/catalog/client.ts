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

const inflight = new Map<string, Promise<CatalogResponse>>();

async function fetchCatalogOnce(path: string, signal?: AbortSignal): Promise<CatalogResponse> {
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

/**
 * Retry 499/502/503/504 — Vercel/CF sometimes cancel (cold start / abort).
 * Without a signal, coalesce identical in-flight GETs.
 * With a signal (pagination / retry), never reuse a possibly-hung promise —
 * mobile cellular stalls used to pin the shared Map entry forever so
 * same-page retry and hard-refetch awaited a dead request.
 */
export function fetchCatalog(query: ClientQuery, signal?: AbortSignal): Promise<CatalogResponse> {
  const path = catalogPath(query);
  if (!signal) {
    const existing = inflight.get(path);
    if (existing) return existing;
  } else {
    // Drop any shared entry so this abortable attempt is what waiters attach to.
    inflight.delete(path);
  }
  const pending = fetchCatalogOnce(path, signal).finally(() => {
    if (inflight.get(path) === pending) inflight.delete(path);
  });
  inflight.set(path, pending);
  return pending;
}

export function prefetchCatalog(query: ClientQuery): void {
  void fetchCatalog(query);
}
