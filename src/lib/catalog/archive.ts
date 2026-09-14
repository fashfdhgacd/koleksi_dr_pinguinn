import { cacheGet, cachePeekStale, cacheSet, singleflight } from "./cache";
import { findCategory } from "./categories";
import { asString, asStringList, docToCard, isSafeId, sanitizeSearch, toDetail } from "./normalize";
import type { PagedVideos, VideoCard, VideoDetail } from "./types";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./types";

const SEARCH_URL = "https://archive.org/advancedsearch.php";
const META_URL = "https://archive.org/metadata/";
const UA = "LAYAR/1.0 (public-archive catalog; educational streaming UI)";
const SEARCH_TTL = 5 * 60 * 1000;
const DETAIL_TTL = 30 * 60 * 1000;
const UPSTREAM_MS = 8000;

const BASE_QUERY =
  "mediatype:(movies) AND format:(MPEG4) AND -collection:(adultsonly)";
const FEATURE_QUERY = `${BASE_QUERY} AND collection:(feature_films) AND -subject:(exploitation)`;

const LIST_FIELDS = [
  "identifier",
  "title",
  "description",
  "year",
  "creator",
  "subject",
  "runtime",
  "downloads",
  "publicdate",
] as const;

type SearchDoc = Record<string, unknown>;

type SearchResponse = {
  response?: {
    numFound?: number;
    start?: number;
    docs?: SearchDoc[];
  };
};

type MetadataResponse = {
  metadata?: Record<string, unknown>;
  files?: unknown;
};

function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(limit)));
}

function clampPage(page: number | undefined): number {
  if (!Number.isFinite(page) || !page) return 1;
  return Math.min(500, Math.max(1, Math.trunc(page)));
}

function asFileList(files: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(files)) return files as Array<Record<string, unknown>>;
  if (files && typeof files === "object") {
    return Object.values(files as Record<string, Record<string, unknown>>);
  }
  return [];
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const combined = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(UPSTREAM_MS)])
    : AbortSignal.timeout(UPSTREAM_MS);
  const res = await fetch(url, {
    signal: combined,
    headers: {
      accept: "application/json",
      "user-agent": UA,
    },
  });
  if (!res.ok) {
    throw new Error(`Sumber katalog gagal (${res.status})`);
  }
  return (await res.json()) as T;
}

function searchParams(query: string, page: number, limit: number, sort?: string): string {
  const params = new URLSearchParams();
  params.set("q", query);
  for (const field of LIST_FIELDS) params.append("fl[]", field);
  params.set("rows", String(limit));
  params.set("page", String(page));
  params.set("output", "json");
  if (sort) params.append("sort[]", sort);
  return params.toString();
}

async function searchArchive(
  query: string,
  page: number,
  limit: number,
  sort: string | undefined,
  signal?: AbortSignal,
): Promise<PagedVideos> {
  const cacheKey = `search:${sort ?? "rel"}:${page}:${limit}:${query}`;
  const cached = cacheGet<PagedVideos>(cacheKey);
  if (cached) return cached;

  return singleflight(cacheKey, async () => {
    const again = cacheGet<PagedVideos>(cacheKey);
    if (again) return again;
    try {
      const url = `${SEARCH_URL}?${searchParams(query, page, limit, sort)}`;
      const json = await fetchJson<SearchResponse>(url, signal);
      const docs = Array.isArray(json.response?.docs) ? json.response!.docs! : [];
      const items: VideoCard[] = [];
      const seen = new Set<string>();
      for (const doc of docs) {
        const card = docToCard(doc);
        if (!card || seen.has(card.id)) continue;
        seen.add(card.id);
        items.push(card);
      }
      const total = Math.max(0, json.response?.numFound ?? items.length);
      const pageSafe = clampPage(page);
      const limitSafe = clampLimit(limit);
      const result: PagedVideos = {
        page: pageSafe,
        limit: limitSafe,
        total,
        hasMore: pageSafe * limitSafe < total,
        items,
      };
      cacheSet(cacheKey, result, SEARCH_TTL);
      return result;
    } catch (err) {
      const stale = cachePeekStale<PagedVideos>(cacheKey);
      if (stale) return { ...stale };
      throw err;
    }
  });
}

export async function listLatest(page?: number, limit?: number, signal?: AbortSignal) {
  return searchArchive(FEATURE_QUERY, clampPage(page), clampLimit(limit), "publicdate desc", signal);
}

export async function listFeatured(page?: number, limit?: number, signal?: AbortSignal) {
  return searchArchive(FEATURE_QUERY, clampPage(page), clampLimit(limit), "downloads desc", signal);
}

export async function listCategory(slug: string, page?: number, limit?: number, signal?: AbortSignal) {
  const cat = findCategory(slug);
  if (!cat) {
    throw Object.assign(new Error("Kategori tidak dikenal"), { code: "bad_request" as const });
  }
  return searchArchive(
    `${BASE_QUERY} AND (${cat.query})`,
    clampPage(page),
    clampLimit(limit),
    "downloads desc",
    signal,
  );
}

export async function listSearch(q: string, page?: number, limit?: number, signal?: AbortSignal) {
  const cleaned = sanitizeSearch(q);
  if (cleaned.length < 2) {
    return {
      page: 1,
      limit: clampLimit(limit),
      total: 0,
      hasMore: false,
      items: [] as VideoCard[],
    };
  }
  return searchArchive(
    `${BASE_QUERY} AND (title:(${cleaned}) OR creator:(${cleaned}))`,
    clampPage(page),
    clampLimit(limit),
    "downloads desc",
    signal,
  );
}

export async function listRelated(id: string, limit?: number, signal?: AbortSignal) {
  if (!isSafeId(id)) {
    throw Object.assign(new Error("ID tidak valid"), { code: "bad_request" as const });
  }
  const detail = await getDetail(id, signal);
  const subject = detail.subjects[0] || detail.category;
  const cleanedSubject = sanitizeSearch(subject);
  const query = cleanedSubject
    ? `${BASE_QUERY} AND subject:(${cleanedSubject}) AND -identifier:(${id})`
    : `${FEATURE_QUERY} AND -identifier:(${id})`;
  const page = await searchArchive(query, 1, clampLimit(limit ?? 12), "downloads desc", signal);
  return {
    ...page,
    items: page.items.filter((item) => item.id !== id).slice(0, clampLimit(limit ?? 12)),
  };
}

export async function getDetail(id: string, signal?: AbortSignal): Promise<VideoDetail> {
  if (!isSafeId(id)) {
    throw Object.assign(new Error("ID tidak valid"), { code: "bad_request" as const });
  }
  const cacheKey = `detail:${id}`;
  const cached = cacheGet<VideoDetail>(cacheKey);
  if (cached) return cached;

  return singleflight(cacheKey, async () => {
    const again = cacheGet<VideoDetail>(cacheKey);
    if (again) return again;
    try {
      const json = await fetchJson<MetadataResponse>(`${META_URL}${encodeURIComponent(id)}`, signal);
      const meta = json.metadata ?? {};
      const identifier = asString(meta.identifier) || id;
      const card = docToCard({
        identifier,
        title: meta.title,
        description: meta.description,
        year: meta.year,
        creator: meta.creator,
        subject: meta.subject,
        runtime: meta.runtime,
        downloads: meta.downloads,
      });
      if (!card) {
        throw Object.assign(new Error("Video tidak ditemukan"), { code: "not_found" as const });
      }
      const subjects = asStringList(meta.subject);
      const detail = toDetail(card, asFileList(json.files), meta.runtime);
      detail.subjects = subjects.length ? subjects : card.category ? [card.category] : [];
      cacheSet(cacheKey, detail, DETAIL_TTL);
      return detail;
    } catch (err) {
      const stale = cachePeekStale<VideoDetail>(cacheKey);
      if (stale) return stale;
      throw err;
    }
  });
}

export { FEATURE_QUERY, BASE_QUERY };
