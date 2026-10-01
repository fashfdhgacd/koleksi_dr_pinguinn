import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCatalog } from "@/lib/catalog/client";
import type { CatalogResponse, VideoCard } from "@/lib/catalog/types";
import { DEFAULT_PAGE_SIZE } from "@/lib/catalog/types";
import { markPosterWarm } from "@/lib/poster-warm";

export type CatalogStatus =
  | "idle"
  | "loading"
  | "loadingMore"
  | "success"
  | "empty"
  | "error"
  | "retrying";

export type BrowseParams = {
  mode: "home" | "latest" | "category" | "search";
  category?: string;
  q?: string;
  page?: number;
};

type FeedSnap = {
  items: VideoCard[];
  featured: VideoCard[];
  page: number;
  hasMore: boolean;
  total: number;
  at: number;
};

const FRESH_MS = 12 * 60 * 60 * 1000;
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const LS_KEY = "dp_feed_v3";
const feedCache = new Map<string, FeedSnap>();

function ls() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hydrateFeeds() {
  if (typeof window === "undefined" || feedCache.size) return;
  const store = ls();
  if (!store) return;
  try {
    const raw = store.getItem(LS_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, FeedSnap>;
    const now = Date.now();
    for (const [k, v] of Object.entries(obj)) {
      if (v?.items?.length && now - v.at < KEEP_MS) feedCache.set(k, v);
    }
  } catch {
    /* ignore */
  }
}

function persistFeeds() {
  if (typeof window === "undefined") return;
  const store = ls();
  if (!store) return;
  try {
    const now = Date.now();
    const obj: Record<string, FeedSnap> = {};
    let n = 0;
    for (const [k, v] of feedCache) {
      if (now - v.at > KEEP_MS) continue;
      obj[k] = v;
      if (++n >= 60) break;
    }
    store.setItem(LS_KEY, JSON.stringify(obj));
  } catch {
    /* quota */
  }
}

if (typeof window !== "undefined") hydrateFeeds();

function normPage(value?: number): number {
  const n = Math.floor(Number(value) || 1);
  return n < 1 ? 1 : n;
}

function feedKey(params: BrowseParams, page = 1): string {
  return `${params.mode}:${params.category ?? ""}:${params.q ?? ""}:${page}`;
}

function extractPage(res: CatalogResponse): {
  items: VideoCard[];
  page: number;
  hasMore: boolean;
  total: number;
  featured: VideoCard[];
} {
  if (!res.ok) return { items: [], page: 1, hasMore: false, total: 0, featured: [] };
  if (res.type === "home") {
    return {
      items: res.latest.items,
      page: res.latest.page,
      hasMore: res.latest.hasMore,
      total: res.latest.total,
      featured: res.featured,
    };
  }
  if (res.type === "categories" || res.type === "detail") {
    return { items: [], page: 1, hasMore: false, total: 0, featured: [] };
  }
  return {
    items: res.items,
    page: res.page,
    hasMore: res.hasMore,
    total: res.total,
    featured: [],
  };
}

function warmPosters(items: VideoCard[]) {
  for (const it of items) markPosterWarm(it.thumbnail);
}

export type CatalogFeedSeed = {
  items: VideoCard[];
  featured?: VideoCard[];
  total: number;
  page?: number;
  hasMore?: boolean;
};

export function useCatalogFeed(params: BrowseParams, ssrSeed?: CatalogFeedSeed | null) {
  const wantedPage = normPage(params.page);
  const paramsKey = `${params.mode}:${params.category ?? ""}:${params.q ?? ""}:${wantedPage}`;
  const cached = feedCache.get(feedKey(params, wantedPage));
  const seed: FeedSnap | null =
    cached ||
    (ssrSeed && ssrSeed.items.length
      ? {
          items: ssrSeed.items,
          featured: ssrSeed.featured ?? [],
          page: ssrSeed.page ?? wantedPage,
          hasMore: ssrSeed.hasMore ?? true,
          total: ssrSeed.total,
          at: Date.now(),
        }
      : null);
  const [items, setItems] = useState<VideoCard[]>(() => (seed ? seed.items : []));
  const [featured, setFeatured] = useState<VideoCard[]>(() => (seed ? seed.featured : []));
  const [page, setPage] = useState(wantedPage);
  const [hasMore, setHasMore] = useState(() => (seed ? seed.hasMore : wantedPage === 1));
  const [total, setTotal] = useState(() => (seed ? seed.total : 0));
  const [status, setStatus] = useState<CatalogStatus>(() =>
    seed ? (seed.items.length ? "success" : "empty") : "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef(false);
  const genRef = useRef(0);
  const itemsRef = useRef<VideoCard[]>(items);
  const totalRef = useRef(total);
  itemsRef.current = items;
  totalRef.current = total;

  const load = useCallback(
    async (nextPage: number, reason: "reset" | "retry" | "silent") => {
      if ((reason === "silent" || reason === "retry") && inflightRef.current) return;

      const gen = reason === "silent" ? genRef.current : ++genRef.current;
      inflightRef.current = true;
      if (reason !== "silent") setError(null);
      if (reason === "retry" && !itemsRef.current.length) setStatus("retrying");
      else if (reason === "reset" && !itemsRef.current.length) setStatus("loading");

      const query =
        params.mode === "search"
          ? { type: "search" as const, q: params.q ?? "", page: nextPage, limit: DEFAULT_PAGE_SIZE }
          : params.mode === "category"
            ? {
                type: "category" as const,
                category: params.category ?? "",
                page: nextPage,
                limit: DEFAULT_PAGE_SIZE,
              }
            : nextPage === 1 && params.mode === "home"
              ? { type: "home" as const, page: 1, limit: DEFAULT_PAGE_SIZE }
              : { type: "latest" as const, page: nextPage, limit: DEFAULT_PAGE_SIZE };

      try {
        const res = await fetchCatalog(query);
        if (gen !== genRef.current) return;
        if (!res.ok) {
          if (reason === "silent") return;
          setError(res.error);
          setStatus(itemsRef.current.length ? "success" : "error");
          return;
        }
        const pageData = extractPage(res);
        const merged = pageData.items.filter((item) => item?.id);
        setItems(merged);
        itemsRef.current = merged;
        warmPosters(merged);
        if (nextPage === 1 && pageData.featured.length) setFeatured(pageData.featured);
        const resolvedPage = pageData.page || nextPage;
        setPage(resolvedPage);
        setHasMore(pageData.hasMore);
        const nextTotal =
          reason === "silent" && totalRef.current > pageData.total && pageData.total > 0
            ? totalRef.current
            : pageData.total;
        setTotal(nextTotal);
        totalRef.current = nextTotal;
        feedCache.set(feedKey(params, resolvedPage), {
          items: merged,
          featured: nextPage === 1 ? pageData.featured : [],
          page: resolvedPage,
          hasMore: pageData.hasMore,
          total: nextTotal,
          at: Date.now(),
        });
        persistFeeds();
        if (reason !== "silent") setStatus(merged.length ? "success" : "empty");
        else if (!merged.length) setStatus("empty");
        else setStatus("success");
      } catch (err) {
        if (gen !== genRef.current) return;
        if (reason === "silent") return;
        const message = err instanceof Error ? err.message : "Gagal memuat katalog.";
        setError(message);
        setStatus(itemsRef.current.length ? "success" : "error");
      } finally {
        if (gen === genRef.current) inflightRef.current = false;
      }
    },
    [params.category, params.mode, params.q],
  );

  useEffect(() => {
    if (ssrSeed?.items?.length && !feedCache.has(feedKey(params, wantedPage))) {
      feedCache.set(feedKey(params, wantedPage), {
        items: ssrSeed.items,
        featured: ssrSeed.featured ?? [],
        page: ssrSeed.page ?? wantedPage,
        hasMore: ssrSeed.hasMore ?? true,
        total: ssrSeed.total,
        at: Date.now(),
      });
    }
    const snap = feedCache.get(feedKey(params, wantedPage));
    const age = snap ? Date.now() - snap.at : Infinity;
    if (snap && age < KEEP_MS) {
      setItems(snap.items);
      itemsRef.current = snap.items;
      setFeatured(snap.featured);
      setPage(snap.page);
      setHasMore(snap.hasMore);
      setTotal(snap.total);
      totalRef.current = snap.total;
      setStatus(snap.items.length ? "success" : "empty");
      warmPosters(snap.items);
      if (age >= FRESH_MS) void load(wantedPage, "silent");
    } else {
      void load(wantedPage, itemsRef.current.length ? "silent" : "reset");
    }
    return () => {
      genRef.current += 1;
      inflightRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, paramsKey]);

  const retry = useCallback(() => {
    void load(wantedPage, "retry");
  }, [load, wantedPage]);

  return {
    items,
    featured,
    page,
    hasMore,
    total,
    limit: DEFAULT_PAGE_SIZE,
    status,
    error,
    retry,
    loading: status === "loading" || status === "retrying",
    loadingMore: status === "loadingMore",
  };
}
