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

export async function fetchCatalog(
  query: ClientQuery,
  signal?: AbortSignal,
): Promise<CatalogResponse> {
  const res = await fetch(catalogPath(query), {
    signal,
    headers: { accept: "application/json" },
  });
  let body: CatalogResponse | null = null;
  try {
    body = (await res.json()) as CatalogResponse;
  } catch {
    body = null;
  }
  if (body && typeof body === "object" && "ok" in body) return body;
  return {
    ok: false,
    error: res.ok ? "Respons katalog tidak valid." : `Gagal memuat katalog (${res.status}).`,
    code: "upstream",
  };
}
