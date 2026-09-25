import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCatalog } from "@/lib/catalog/client";
import type { CatalogResponse, VideoCard } from "@/lib/catalog/types";
import { DEFAULT_PAGE_SIZE } from "@/lib/catalog/types";

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

const FEED_TTL_MS = 5 * 60 * 1000;
const feedCache = new Map<string, FeedSnap>();

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

export function useCatalogFeed(params: BrowseParams) {
  const wantedPage = normPage(params.page);
  const paramsKey = `${params.mode}:${params.category ?? ""}:${params.q ?? ""}:${wantedPage}`;
  const cached = feedCache.get(feedKey(params, wantedPage));
  const warm = Boolean(cached && Date.now() - cached.at < FEED_TTL_MS);

  const [items, setItems] = useState<VideoCard[]>(() => (warm && cached ? cached.items : []));
  const [featured, setFeatured] = useState<VideoCard[]>(() => (warm && cached ? cached.featured : []));
  const [page, setPage] = useState(wantedPage);
  const [hasMore, setHasMore] = useState(() => (warm && cached ? cached.hasMore : wantedPage === 1));
  const [total, setTotal] = useState(() => (warm && cached ? cached.total : 0));
  const [status, setStatus] = useState<CatalogStatus>(() =>
    warm && cached ? (cached.items.length ? "success" : "empty") : "loading",
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
    const snap = feedCache.get(feedKey(params, wantedPage));
    if (snap && Date.now() - snap.at < FEED_TTL_MS) {
      setItems(snap.items);
      itemsRef.current = snap.items;
      setFeatured(snap.featured);
      setPage(snap.page);
      setHasMore(snap.hasMore);
      setTotal(snap.total);
      totalRef.current = snap.total;
      setStatus(snap.items.length ? "success" : "empty");
      void load(wantedPage, "silent");
    } else {
      setItems([]);
      itemsRef.current = [];
      void load(wantedPage, "reset");
    }
    return () => {
      genRef.current += 1;
      inflightRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, paramsKey]);

  useEffect(() => {
    if (params.mode !== "home" || wantedPage !== 1) return;
    const SLOT = 5 * 60 * 1000;
    let tid = 0;
    const arm = () => {
      const wait = Math.max(8000, SLOT - (Date.now() % SLOT) + 50);
      tid = window.setTimeout(() => {
        void load(1, "silent");
        arm();
      }, wait);
    };
    arm();
    return () => window.clearTimeout(tid);
  }, [load, params.mode, wantedPage]);

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
