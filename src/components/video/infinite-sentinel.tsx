import { useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import { VideoGridSkeleton } from "./video-grid";

export function InfiniteSentinel({
  enabled,
  loading,
  onLoadMore,
  shown,
  total,
}: {
  enabled: boolean;
  loading: boolean;
  onLoadMore: () => void;
  shown?: number;
  total?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, onLoadMore]);

  const count =
    typeof shown === "number" && typeof total === "number" && total > 0
      ? `${shown.toLocaleString("id-ID")} / ${total.toLocaleString("id-ID")} judul`
      : null;

  return (
    <div ref={ref} className="mt-8 min-h-16">
      {loading ? (
        <>
          <div className="mb-4 flex items-center justify-center gap-2 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" />
            Memuat batch berikutnya
          </div>
          <VideoGridSkeleton count={6} />
        </>
      ) : enabled ? (
        <div className="flex flex-col items-center gap-2">
          {count ? <p className="text-xs text-muted">{count}</p> : null}
          <button
            type="button"
            onClick={onLoadMore}
            className="rounded-full bg-secondary px-4 py-2 text-sm text-foreground hover:bg-secondary/80"
          >
            Tampilkan lagi
          </button>
        </div>
      ) : count ? (
        <p className="text-center text-xs text-muted">{count}</p>
      ) : null}
    </div>
  );
}
