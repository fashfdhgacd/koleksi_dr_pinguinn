import type { VideoCard as VideoCardType } from "@/lib/catalog/types";
import { isRealMinor } from "@/lib/minor-terms";
import { Skeleton } from "@/components/ui/skeleton";
import { AdSlot } from "@/components/ad-slot";
import { onCatalogCardClick } from "@/components/card-popunder";
import { VideoCard } from "./video-card";
import { Fragment, useEffect } from "react";
import { restoreCatalogScroll } from "@/lib/catalog/last-catalog";

const DEFAULT_GRID =
  "grid grid-cols-2 gap-x-2.5 gap-y-5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 lg:grid-cols-4";
const CATALOG_GRID =
  "relative left-1/2 grid w-full max-w-screen-2xl -translate-x-1/2 auto-rows-fr grid-cols-1 gap-3 lg:w-[calc(100%+2rem)] lg:grid-cols-3 lg:gap-4";

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
  /** Keep the catalog layout but render no ad slots and no card-click popunder (IndoAV source pages). */
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
    <div
      className={ads ? CATALOG_GRID : DEFAULT_GRID}
      // Catalog grids only: first video-card click per session also opens the popunder.
      onClickCapture={ads && !adFree ? (e) => onCatalogCardClick(e, (id) => String(shown.find((v) => v.id === id)?.creator || "")) : undefined}
    >
      {shown.map((video, index) => {
        const count = index + 1;
        const mobileAd = showAds && count % 4 === 0;
        const desktopAd = showAds && count % 5 === 2;
        return (
          <Fragment key={video.id}>
            <VideoCard video={video} catalog={ads} eager={index < eagerCount} />
            {(mobileAd || desktopAd) && (
              <AdSlot className={mobileAd && desktopAd ? "" : mobileAd ? "lg:hidden" : "hidden lg:block"} />
            )}
          </Fragment>
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
          <Skeleton className={ads ? "aspect-[16/10] rounded-xl" : "aspect-video rounded-xl"} />
          <Skeleton className="mt-3 h-4 w-4/5 rounded-sm" />
          <Skeleton className="mt-2 h-3 w-1/3 rounded-sm" />
        </div>
      ))}
    </div>
  );
}
