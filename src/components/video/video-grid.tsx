import type { VideoCard as VideoCardType } from "@/lib/catalog/types";
import { isRealMinor } from "@/lib/minor-terms";
import { Skeleton } from "@/components/ui/skeleton";
import { GridAd } from "@/components/grid-ad";
import { planGrid } from "@/lib/grid-ads";
import { VideoCard } from "./video-card";
import { useEffect } from "react";
import { restoreCatalogScroll } from "@/lib/catalog/last-catalog";

const DEFAULT_GRID =
  "grid grid-cols-2 gap-x-2.5 gap-y-5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 lg:grid-cols-4";
const CATALOG_GRID =
  "relative left-1/2 grid w-full max-w-screen-2xl -translate-x-1/2 auto-rows-fr grid-cols-1 gap-3 lg:w-[calc(100%+2rem)] lg:grid-cols-3 lg:gap-4";

/** Show a cell on one breakpoint only (lg = laptop). */
const BP_ONLY = { mobile: "lg:hidden", desktop: "hidden lg:block" } as const;
/** Hide classes for a video cell by [hidden on mobile][hidden on desktop]. */
const HIDE: Record<string, string> = { "00": "", "10": "hidden lg:block", "01": "lg:hidden", "11": "hidden" };

function visibleCards(items: VideoCardType[]): VideoCardType[] {
  return items.filter((video) => !isRealMinor({ title: video.title, tags: video.category }));
}

export function VideoGrid({
  items,
  eagerCount = 4,
  ads = false,
  adFree = false,
}: {
  items: VideoCardType[];
  eagerCount?: number;
  /** Use the catalog layout and existing catalog ad placements. */
  ads?: boolean;
  /** Keep the catalog layout but render no ad slots. */
  adFree?: boolean;
}) {
  const shown = visibleCards(items);
  const showAds = ads && !adFree;
  // "Kembali ke katalog" with a full load: scroll back to where the card was clicked.
  const hasItems = shown.length > 0;
  useEffect(() => {
    if (ads && hasItems) restoreCatalogScroll();
  }, [ads, hasItems]);
  return (
    <div className={ads ? CATALOG_GRID : DEFAULT_GRID}>
      {/* Exactly 6 ads per breakpoint on every page, each its own zone (src/lib/grid-ads.ts); trailing videos
          hidden per breakpoint so rows stay full. Flat list with stable keys: a re-render keeps every mounted
          ad slot (no second request). */}
      {planGrid(shown.length, showAds).map((cell) => {
        if (cell.kind === "ad") {
          return <GridAd key={cell.key} slot={cell.slot} slotIndex={cell.slotIndex} className={BP_ONLY[cell.breakpoint]} />;
        }
        const video = shown[cell.index];
        const hide = HIDE[`${cell.hidden.mobile ? 1 : 0}${cell.hidden.desktop ? 1 : 0}`];
        return hide ? (
          <div key={video.id} className={hide}>
            <VideoCard video={video} catalog={ads} eager={cell.index < eagerCount} />
          </div>
        ) : (
          <VideoCard key={video.id} video={video} catalog={ads} eager={cell.index < eagerCount} />
        );
      })}
    </div>
  );
}

export function VideoGridSkeleton({ count = 12, ads = false }: { count?: number; ads?: boolean }) {
  return (
    <div className={ads ? CATALOG_GRID : DEFAULT_GRID}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-1 sm:p-1.5">
          <Skeleton className={ads ? "aspect-[16/10] rounded-none" : "aspect-video rounded-xl"} />
          <Skeleton className="mt-3 h-4 w-4/5 rounded-sm" />
          <Skeleton className="mt-2 h-3 w-1/3 rounded-sm" />
        </div>
      ))}
    </div>
  );
}
