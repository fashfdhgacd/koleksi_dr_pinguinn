import { PUBLIC_CATEGORY_LIST, findCategory } from "./categories";
import {
  getDetail,
  listCategory,
  listFeatured,
  listLatest,
  listListedCategories,
  terbaruCoverSource,
  listRelated,
  listSearch,
} from "./local";
import { fetchCatalog } from "./client";
import { uploadDateOf } from "./sitemap-entries";
import { listRanking, rankedAllTime, withVideyViews } from "./ranking-list";
import { parseRankingKey } from "./rankings";
import { LANDING_PAGE_SIZE, LANDING_POOL, acceptLandingCard, findLanding } from "./landing";
import { isSeoBlockedId } from "./seo-block";
import { isMinorContentTitle } from "./minor-detector.js";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./types";
import type { CatalogError, CatalogResponse, CatalogType, CategoryInfo, VideoCard } from "./types";

/** Featured/hero: only keep thumbs that are known real art (not brand / speculative *-thumb). */
function isRealFeaturedThumb(url: string | null | undefined): boolean {
  const u = (url || "").trim();
  if (!u || /brand-poster/i.test(u)) return false;
  if (/\/api\/embed-thumb\?/i.test(u)) return false;
  if (/\/api\/(tape|puterin)-thumb\?/i.test(u)) return false;
  // Videy removed — never treat CDN / raw video as featured art.
  if (/cdn\.videy\.co\/|videy\.co\//i.test(u)) return false;
  if (/\.(mp4|mov|webm)(\?|$)/i.test(u)) return false;
  if (/\/api\/img-proxy\?/i.test(u)) return false;
  if (/^https?:\/\//i.test(u)) return true;
  return false;
}

async function listFeaturedWithArt(page = 1, limit = 8, signal?: AbortSignal) {
  const want = Math.max(1, limit);
  // Over-fetch so we can drop speculative embed-thumb leftovers and still fill `limit`.
  const raw = await listFeatured(page, Math.max(want * 8, 64), signal);
  const withArt = raw.items.filter((x) => isRealFeaturedThumb(x.thumbnail));
  // Homepage page 1 (hero included) is IndoAV-only; UserBokep starts from Terbaru page 2.
  const indo = withArt.filter((x) => x.creator === "IndoAV");
  const items = (indo.length >= want ? indo : withArt).slice(0, want);
  return {
    ...raw,
    limit: want,
    total: items.length,
    hasMore: false,
    items,
  };
}

async function heroFeatured(signal?: AbortSignal): Promise<{ items: VideoCard[] }> {
  try {
    if (!import.meta.env.SSR) throw new Error("client");
    const { heroState } = await import("./hero-pick");
    const state = await heroState();
    if (state.current) return { items: [state.current] };
  } catch {
    /* fall back below */
  }
  const old = await listFeaturedWithArt(1, 8, signal);
  return { items: old.items.slice(0, 1) };
}

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
    case "landing":
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

export async function queryCatalogServer(query: CatalogQuery, signal?: AbortSignal): Promise<CatalogResponse> {
  try {
    const type = parseType(query.type);
    const page = toInt(query.page);
    const limit = toInt(query.limit);

    if (limit != null && (limit < 1 || limit > MAX_PAGE_SIZE)) {
      return { ok: false, error: `Limit harus 1–${MAX_PAGE_SIZE}.`, code: "bad_request" };
    }

    switch (type) {
      case "categories": {
        // Special-card covers need the likes ranking (server only): in the browser ask /api/data.
        if (typeof window !== "undefined") return fetchCatalog({ type: "categories" }, signal);
        const [views, likes, newest] = await Promise.all([
          rankedAllTime("views"),
          rankedAllTime("likes"),
          terbaruCoverSource(),
        ]);
        const specials: CategoryInfo[] = [];
        const categories = await listListedCategories({
          specials: [
            { slug: "paling-ditonton", list: views },
            { slug: "paling-disukai", list: likes },
            { slug: "terbaru", list: newest },
          ],
          specialOut: specials,
        });
        return { ok: true, type, categories, specials };
      }
      case "latest": {
        const data = await listLatest(page, limit, signal);
        return { ok: true, type, ...data, items: await withVideyViews(data.items) };
      }
      case "featured": {
        const data = await listFeaturedWithArt(page, limit ?? 1, signal);
        return { ok: true, type, ...data };
      }
      case "category": {
        const slug = (query.category || "").trim();
        if (!slug) return { ok: false, error: "Kategori wajib diisi.", code: "bad_request" };
        // Ranking pages (paling-ditonton / paling-disukai, optional "~minggu" / "~bulan").
        const rank = parseRankingKey(slug);
        if (rank) {
          // D1/KV likes only exist on the server: in the browser ask /api/data (edge cached).
          if (typeof window !== "undefined") {
            return fetchCatalog({ type: "category", category: slug, page: page ?? 1, limit: limit ?? DEFAULT_PAGE_SIZE }, signal);
          }
          const data = await listRanking(rank.def.kind, rank.period.period, page ?? 1, limit ?? DEFAULT_PAGE_SIZE);
          return { ok: true, type, ...data, items: await withVideyViews(data.items) };
        }
        if (!findCategory(slug)) return { ok: false, error: "Kategori tidak dikenal.", code: "bad_request" };
        const data = await listCategory(slug, page, limit, signal);
        return { ok: true, type, ...data, items: await withVideyViews(data.items) };
      }
      case "search": {
        const q = (query.q || "").trim();
        if (!q) return { ok: false, error: "Kata kunci wajib diisi.", code: "bad_request" };
        const data = await listSearch(q, page, limit, signal);
        return { ok: true, type, ...data, items: await withVideyViews(data.items) };
      }
      case "landing": {
        // /cari/<slug>: own catalog (IndoAV + UserBokep), clean titles, most viewed first,
        // then /halaman/N. Blocklist ids never appear. School-word JAV is not a title block.
        const def = findLanding(query.q);
        if (!def || !findCategory(def.category)) return { ok: false, error: "Halaman tidak dikenal.", code: "not_found" };
        const requested = Math.max(1, page ?? 1);
        const limit = LANDING_PAGE_SIZE;
        const pool = await listCategory(def.category, 1, LANDING_POOL, signal);
        const clean = pool.items.filter(
          (c) => acceptLandingCard(c, def) && !isMinorContentTitle(c.title) && !isSeoBlockedId(c.id),
        );
        const withViews = await withVideyViews(clean);
        const sorted = withViews
          .map((c, i) => ({ c, i }))
          .sort((a, b) => (b.c.views || 0) - (a.c.views || 0) || a.i - b.i)
          .map((x) => x.c);
        const total = sorted.length;
        const last = Math.max(1, Math.ceil(total / limit) || 1);
        const safePage = Math.min(requested, last);
        const start = (safePage - 1) * limit;
        const items = sorted.slice(start, start + limit);
        return { ok: true, type, items, total, page: safePage, limit, hasMore: start + items.length < total };
      }
      case "related": {
        const id = (query.id || "").trim();
        if (!id) return { ok: false, error: "ID wajib diisi.", code: "bad_request" };
        const data = await listRelated(id, limit ?? 12, signal);
        return { ok: true, type, ...data, items: await withVideyViews(data.items) };
      }
      case "detail": {
        const id = (query.id || "").trim();
        if (!id) return { ok: false, error: "ID wajib diisi.", code: "bad_request" };
        const [item, related] = await Promise.all([
          getDetail(id, signal),
          listRelated(id, 12, signal).catch(() => ({ items: [] as VideoCard[] })),
        ]);
        const [itemV] = await withVideyViews([item]);
        const uploadDate = await uploadDateOf(itemV.id).catch(() => undefined);
        return { ok: true, type, item: uploadDate != null ? { ...itemV, uploadDate } : itemV, related: await withVideyViews(related.items) };
      }
      case "home": {
        // Hero: one video per WIB time slot (hero-pick.ts); old featured list only as a fallback.
        const [featured, latest] = await Promise.all([
          heroFeatured(signal),
          listLatest(page ?? 1, limit ?? DEFAULT_PAGE_SIZE, signal),
        ]);
        return {
          ok: true,
          type,
          featured: featured.items,
          latest: { ...latest, items: await withVideyViews(latest.items) },
          categories: PUBLIC_CATEGORY_LIST,
        };
      }
    }
  } catch (err) {
    return wrapError(err);
  }
}
