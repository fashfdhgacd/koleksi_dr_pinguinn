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
};

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
  const [items, setItems] = useState<VideoCard[]>([]);
  const [featured, setFeatured] = useState<VideoCard[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<CatalogStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const seenRef = useRef(new Set<string>());
  const abortRef = useRef<AbortController | null>(null);
  const inflightRef = useRef(false);
  const genRef = useRef(0);
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const itemsRef = useRef<VideoCard[]>([]);
  itemsRef.current = items;
  const paramsKey = `${params.mode}:${params.category ?? ""}:${params.q ?? ""}`;

  const load = useCallback(
    async (nextPage: number, reason: "reset" | "more" | "retry") => {
      if (reason === "more" && (inflightRef.current || !hasMoreRef.current)) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const gen = reason === "more" ? genRef.current : ++genRef.current;
      inflightRef.current = true;
      setError(null);
      setStatus(reason === "more" ? "loadingMore" : reason === "retry" ? "retrying" : "loading");

      const query =
        params.mode === "search"
          ? { type: "search", q: params.q ?? "", page: nextPage, limit: DEFAULT_PAGE_SIZE }
          : params.mode === "category"
            ? {
                type: "category",
                category: params.category ?? "",
                page: nextPage,
                limit: DEFAULT_PAGE_SIZE,
              }
            : nextPage === 1 && params.mode === "home"
              ? { type: "home", page: 1, limit: DEFAULT_PAGE_SIZE }
              : { type: "latest", page: nextPage, limit: DEFAULT_PAGE_SIZE };

      try {
        const res = await fetchCatalog(query, controller.signal);
        if (gen !== genRef.current) return;
        if (!res.ok) {
          setError(res.error);
          setStatus(itemsRef.current.length ? "success" : "error");
          return;
        }
        const pageData = extractPage(res);
        if (nextPage === 1) seenRef.current = new Set();
        const base = nextPage === 1 ? [] : itemsRef.current;
        const merged: VideoCard[] = [...base];
        for (const item of pageData.items) {
          if (seenRef.current.has(item.id)) continue;
          seenRef.current.add(item.id);
          merged.push(item);
        }
        setItems(merged);
        itemsRef.current = merged;
        if (nextPage === 1) setFeatured(pageData.featured);
        setPage(pageData.page);
        pageRef.current = pageData.page;
        setHasMore(pageData.hasMore);
        hasMoreRef.current = pageData.hasMore;
        setTotal(pageData.total);
        setStatus(merged.length ? "success" : "empty");
      } catch (err) {
        if (controller.signal.aborted) return;
        if (gen !== genRef.current) return;
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
    pageRef.current = 1;
    hasMoreRef.current = true;
    void load(1, "reset");
    return () => abortRef.current?.abort();
  }, [load, paramsKey]);

  // Hero IndoAV: ganti tiap slot 5 menit menurut jam, meski tab ditutup lalu dibuka lagi.
  useEffect(() => {
    if (params.mode !== "home") return;
    const SLOT = 5 * 60 * 1000;
    let tid = 0;
    const arm = () => {
      const wait = Math.max(1500, SLOT - (Date.now() % SLOT) + 50);
      tid = window.setTimeout(() => {
        void load(1, "retry");
        arm();
      }, wait);
    };
    arm();
    return () => window.clearTimeout(tid);
  }, [load, params.mode]);

  const loadMore = useCallback(() => {
    if (inflightRef.current || !hasMoreRef.current) return;
    void load(pageRef.current + 1, "more");
  }, [load]);

  const retry = useCallback(() => {
    void load(1, "retry");
  }, [load]);

  return {
    items,
    featured,
    page,
    hasMore,
    total,
    status,
    error,
    loadMore,
    retry,
    loading: status === "loading" || status === "retrying",
    loadingMore: status === "loadingMore",
  };
}
