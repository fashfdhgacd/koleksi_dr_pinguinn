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
  const paramsKey = `${params.mode}:${params.category ?? ""}:${params.q ?? ""}`;
  const cached = feedCache.get(feedKey(params, 1));
  const warm = Boolean(cached && Date.now() - cached.at < FEED_TTL_MS);

  const [items, setItems] = useState<VideoCard[]>(() => (warm && cached ? cached.items : []));
  const [featured, setFeatured] = useState<VideoCard[]>(() => (warm && cached ? cached.featured : []));
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(() => (warm && cached ? cached.hasMore : true));
  const [total, setTotal] = useState(() => (warm && cached ? cached.total : 0));
  const [status, setStatus] = useState<CatalogStatus>(() =>
    warm && cached ? (cached.items.length ? "success" : "empty") : "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const seenRef = useRef(new Set<string>());
  const inflightRef = useRef(false);
  const genRef = useRef(0);
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const itemsRef = useRef<VideoCard[]>(items);
  itemsRef.current = items;

  const load = useCallback(
    async (nextPage: number, reason: "reset" | "more" | "retry" | "silent") => {
      if (reason === "more" && (inflightRef.current || !hasMoreRef.current)) return;
      if ((reason === "silent" || reason === "retry") && inflightRef.current) return;

      const gen = reason === "more" || reason === "silent" ? genRef.current : ++genRef.current;
      inflightRef.current = true;
      if (reason !== "silent") setError(null);
      if (reason === "more") setStatus("loadingMore");
      else if (reason === "retry" && !itemsRef.current.length) setStatus("retrying");
      else if (reason === "reset" && !itemsRef.current.length) setStatus("loading");

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
        const res = await fetchCatalog(query);
        if (gen !== genRef.current) return;
        if (!res.ok) {
          if (reason === "silent") return;
          setError(res.error);
          setStatus(itemsRef.current.length ? "success" : "error");
          return;
        }
        const pageData = extractPage(res);
        if (nextPage === 1) seenRef.current = new Set();
        const base = nextPage === 1 ? [] : itemsRef.current;
        const merged: VideoCard[] = [...base];
        for (const item of pageData.items) {
          if (!item?.id || seenRef.current.has(item.id)) continue;
          seenRef.current.add(item.id);
          merged.push(item);
        }
        setItems(merged);
        itemsRef.current = merged;
        const nextFeatured = nextPage === 1 && pageData.featured.length ? pageData.featured : undefined;
        if (nextFeatured) setFeatured(nextFeatured);
        const resolvedPage = pageData.page || nextPage;
        setPage(resolvedPage);
        pageRef.current = resolvedPage;
        setHasMore(pageData.hasMore);
        hasMoreRef.current = pageData.hasMore;
        setTotal(pageData.total);
        if (nextPage === 1) {
          feedCache.set(feedKey(params, 1), {
            items: merged,
            featured: nextFeatured ?? [],
            page: resolvedPage,
            hasMore: pageData.hasMore,
            total: pageData.total,
            at: Date.now(),
          });
        }
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
    pageRef.current = 1;
    hasMoreRef.current = true;
    const snap = feedCache.get(feedKey(params, 1));
    if (snap && Date.now() - snap.at < FEED_TTL_MS) {
      seenRef.current = new Set(snap.items.map((x) => x.id));
      setItems(snap.items);
      itemsRef.current = snap.items;
      setFeatured(snap.featured);
      setPage(snap.page);
      pageRef.current = snap.page;
      setHasMore(snap.hasMore);
      hasMoreRef.current = snap.hasMore;
      setTotal(snap.total);
      setStatus(snap.items.length ? "success" : "empty");
      void load(1, "silent");
    } else {
      void load(1, "reset");
    }
    return () => {
      genRef.current += 1;
      inflightRef.current = false;
    };
    // paramsKey drives category/home/search switches
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, paramsKey]);

  useEffect(() => {
    if (params.mode !== "home") return;
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
  }, [load, params.mode]);

  useEffect(() => {
    if (params.mode !== "home") return;
    const run = () => {
      for (const slug of ["jav", "ai-plus"] as const) {
        void fetchCatalog({ type: "category", category: slug, page: 1, limit: DEFAULT_PAGE_SIZE }).then((res) => {
          if (!res.ok || res.type !== "category") return;
          feedCache.set(feedKey({ mode: "category", category: slug }, 1), {
            items: res.items,
            featured: [],
            page: res.page,
            hasMore: res.hasMore,
            total: res.total,
            at: Date.now(),
          });
        });
      }
    };
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback;
    if (typeof ric === "function") {
      const id = ric(run, { timeout: 2500 });
      return () => {
        const cancel = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
        cancel?.(id);
      };
    }
    const tid = window.setTimeout(run, 600);
    return () => window.clearTimeout(tid);
  }, [params.mode]);

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
