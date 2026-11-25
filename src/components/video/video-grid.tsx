import type { VideoCard as VideoCardType } from "@/lib/catalog/types";
import { isRealMinor } from "@/lib/minor-terms";
import { Skeleton } from "@/components/ui/skeleton";
import { AdSlot } from "@/components/ad-slot";
import { onCatalogCardClick } from "@/components/card-popunder";
import { VideoCard } from "./video-card";
import { useEffect } from "react";
import { restoreCatalogScroll } from "@/lib/catalog/last-catalog";

const DEFAULT_GRID =
  "grid grid-cols-2 gap-x-2.5 gap-y-5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 lg:grid-cols-4";
const CATALOG_GRID =
  "grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5";

function visibleCards(items: VideoCardType[]): VideoCardType[] {
  return items.filter((video) => !isRealMinor({ title: video.title, tags: video.category }));
}

export function VideoGrid({
  items,
  eagerCount = 4,
  ads = false,
  adFree = false,
  portrait = ads,
}: {
  items: VideoCardType[];
  eagerCount?: number;
  /** Insert catalog ad slots and enable the catalog click handler. */
  ads?: boolean;
  /** Keep the catalog layout but render no ad slots and no card-click popunder (IndoAV source pages). */
  adFree?: boolean;
  portrait?: boolean;
}) {
  const shown = visibleCards(items);
  // Up to 4 slots, every 8th card; each lazy-loads (an unfilled slot keeps its footprint, showing the penguin card).
  const slots = ads && !adFree
    ? AD_POSITIONS.map((at, slot) => ({ at, slot })).filter((x) => x.at < shown.length)
    : [];
  // "Kembali ke katalog" with a full load: scroll back to where the card was clicked.
  const hasItems = shown.length > 0;
  useEffect(() => {
    if (ads && hasItems) restoreCatalogScroll();
  }, [ads, hasItems]);
  return (
    <div
      className={portrait ? CATALOG_GRID : DEFAULT_GRID}
      // Catalog grids only: first video-card click per session also opens the popunder.
      onClickCapture={ads && !adFree ? (e) => onCatalogCardClick(e, (id) => String(shown.find((v) => v.id === id)?.creator || "")) : undefined}
    >
      {shown.map((video, index) => {
        const s = slots.find((x) => x.at === index);
        return (
          <Cell
            key={video.id}
            ad={s ? <AdSlot key={`exo-ad-${s.slot}`} /> : null}
          >
            <VideoCard portrait={portrait} video={video} eager={index < eagerCount} />
          </Cell>
        );
      })}
    </div>
  );
}

const AD_POSITIONS = [7, 14, 21, 28]; // every 8th card (cells 8, 16, 24, 32)

function Cell({ ad, children }: { ad: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      {ad}
      {children}
    </>
  );
}

export function VideoGridSkeleton({ count = 12, ads = false }: { count?: number; ads?: boolean }) {
  return (
    <div className={ads ? CATALOG_GRID : DEFAULT_GRID}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-1 sm:p-1.5">
          <Skeleton className={ads ? "aspect-[3/4] rounded-xl" : "aspect-video rounded-xl"} />
          <Skeleton className="mt-3 h-4 w-4/5 rounded-sm" />
          <Skeleton className="mt-2 h-3 w-1/3 rounded-sm" />
        </div>
      ))}
    </div>
  );
}
