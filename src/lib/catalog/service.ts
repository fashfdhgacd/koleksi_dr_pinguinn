import { CATEGORY_LIST, findCategory } from "./categories";
import {
  getDetail,
  listCategory,
  listFeatured,
  listLatest,
  listRelated,
  listSearch,
} from "./archive";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./types";
import type { CatalogError, CatalogResponse, CatalogType, VideoCard } from "./types";

export type CatalogQuery = {
  type?: string | null;
  page?: string | number | null;
  limit?: string | number | null;
  category?: string | null;
  q?: string | null;
  id?: string | null;
};

function toInt(value: string | number | null | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseType(raw: string | null | undefined): CatalogType {
  const type = (raw || "latest").trim().toLowerCase();
  switch (type) {
    case "home":
    case "latest":
    case "featured":
    case "category":
    case "search":
    case "detail":
    case "related":
    case "categories":
      return type;
    default:
      throw Object.assign(new Error("Tipe permintaan tidak dikenal"), { code: "bad_request" as const });
  }
}

function wrapError(err: unknown): CatalogError {
  const code =
    err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : "";
  const message = err instanceof Error && err.message ? err.message : "Gagal memuat katalog.";
  if (code === "bad_request") return { ok: false, error: message, code: "bad_request" };
  if (code === "not_found") return { ok: false, error: message, code: "not_found" };
  return { ok: false, error: message, code: "upstream" };
}

export async function queryCatalog(query: CatalogQuery, signal?: AbortSignal): Promise<CatalogResponse> {
  try {
    const type = parseType(query.type);
    const page = toInt(query.page);
    const limit = toInt(query.limit);

    if (limit != null && (limit < 1 || limit > MAX_PAGE_SIZE)) {
      return { ok: false, error: `Limit harus 1–${MAX_PAGE_SIZE}.`, code: "bad_request" };
    }

    switch (type) {
      case "categories":
        return { ok: true, type, categories: CATEGORY_LIST };
      case "latest": {
        const data = await listLatest(page, limit, signal);
        return { ok: true, type, ...data };
      }
      case "featured": {
        const data = await listFeatured(page, limit ?? 8, signal);
        return { ok: true, type, ...data };
      }
      case "category": {
        const slug = (query.category || "").trim();
        if (!slug) return { ok: false, error: "Kategori wajib diisi.", code: "bad_request" };
        if (!findCategory(slug)) return { ok: false, error: "Kategori tidak dikenal.", code: "bad_request" };
        const data = await listCategory(slug, page, limit, signal);
        return { ok: true, type, ...data };
      }
      case "search": {
        const q = (query.q || "").trim();
        if (!q) return { ok: false, error: "Kata kunci wajib diisi.", code: "bad_request" };
        const data = await listSearch(q, page, limit, signal);
        return { ok: true, type, ...data };
      }
      case "related": {
        const id = (query.id || "").trim();
        if (!id) return { ok: false, error: "ID wajib diisi.", code: "bad_request" };
        const data = await listRelated(id, limit ?? 12, signal);
        return { ok: true, type, ...data };
      }
      case "detail": {
        const id = (query.id || "").trim();
        if (!id) return { ok: false, error: "ID wajib diisi.", code: "bad_request" };
        const [item, related] = await Promise.all([
          getDetail(id, signal),
          listRelated(id, 12, signal).catch(() => ({ items: [] as VideoCard[] })),
        ]);
        return { ok: true, type, item, related: related.items };
      }
      case "home": {
        const [featured, latest] = await Promise.all([
          listFeatured(1, 8, signal),
          listLatest(page ?? 1, limit ?? DEFAULT_PAGE_SIZE, signal),
        ]);
        return {
          ok: true,
          type,
          featured: featured.items,
          latest,
          categories: CATEGORY_LIST,
        };
      }
    }
  } catch (err) {
    return wrapError(err);
  }
}
