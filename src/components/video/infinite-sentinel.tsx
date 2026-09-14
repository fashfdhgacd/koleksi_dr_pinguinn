import { useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import { VideoGridSkeleton } from "./video-grid";

export function InfiniteSentinel({
  enabled,
  loading,
  onLoadMore,
}: {
  enabled: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, onLoadMore]);

  return (
    <div ref={ref} className="mt-6">
      {loading ? (
        <>
          <div className="mb-4 flex items-center justify-center gap-2 text-sm text-muted">
            <LoaderCircle className="size-4 animate-spin" />
            Memuat batch berikutnya
          </div>
          <VideoGridSkeleton count={6} />
        </>
      ) : null}
    </div>
  );
}
