// Grid: 2 / 3 / 4 kolom (mobile / tablet / desktop) for the watch page; catalog grids 2 / 3 / 6.
// Catalog grids (home, kategori; `ads` prop): 2 / 3 / 6 columns, card thumbs 300:250, and a
// TrafficStars MasterSpot card (ts-grid-ad.tsx) as every 8th card (cells 8, 16, 24, 32; max 4),
// each one card footprint, lazy-loaded, collapsing on its own if unfilled. Pages hold 36 videos;
// trailing videos are trimmed at 3 / 6 columns so rows stay full (40 cells -> 36 at 3 and 6 cols;
// 2 cols is always even). The watch page ("Tonton juga") keeps the default grid, no ads.
import type { VideoCard as VideoCardType } from "@/lib/catalog/types";
import { isRealMinor } from "@/lib/minor-terms";
import { Skeleton } from "@/components/ui/skeleton";
import { TsGridAd } from "@/components/ts-grid-ad";
import { VideoCard } from "./video-card";
import { useCallback, useState } from "react";

const DEFAULT_GRID =
  "grid grid-cols-2 gap-x-2.5 gap-y-5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 lg:grid-cols-4";
const CATALOG_GRID =
  "grid grid-cols-2 gap-x-2.5 gap-y-5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 lg:grid-cols-6 [&>a>div:first-child]:aspect-[300/250]";

/**
 * Tablet/desktop: hide up to 3 trailing videos so cells fill whole rows at 3 and 4 columns
 * (multiple of 12, e.g. 39 videos -> 36). Static strings so Tailwind generates them.
 */
const TRIM_CLASS = [
  "",
  " sm:[&>a:nth-last-of-type(-n+1)]:hidden",
  " sm:[&>a:nth-last-of-type(-n+2)]:hidden",
  " sm:[&>a:nth-last-of-type(-n+3)]:hidden",
  " sm:[&>a:nth-last-of-type(-n+4)]:hidden",
];
function trimClass(count: number): string {
  const extra = count % 12;
  return count > 12 && extra > 0 && extra <= 4 ? TRIM_CLASS[extra] : "";
}

function visibleCards(items: VideoCardType[]): VideoCardType[] {
  return items.filter((video) => !isRealMinor({ title: video.title, tags: video.category }));
}

export function VideoGrid({
  items,
  eagerCount = 4,
  ads = false,
}: {
  items: VideoCardType[];
  eagerCount?: number;
  /** Catalog layout (1 / 3 / 4 columns, 300:250 thumbs). Also enables the TrafficStars grid card. */
  ads?: boolean;
}) {
  const shown = visibleCards(items);
  const [empty, setEmpty] = useState<Record<number, true>>({});
  const onEmpty = useCallback((slot: number) => setEmpty((e) => ({ ...e, [slot]: true })), []);
  // Up to 4 slots, every 8th card; each lazy-loads and collapses
  // on its own if unfilled (a trimmed trailing video then returns).
  const slots = ads
    ? AD_POSITIONS.map((at, slot) => ({ at, slot })).filter((x) => x.at < shown.length && !empty[x.slot])
    : [];
  const cells = shown.length + slots.length;
  return (
    <div className={ads ? CATALOG_GRID + trimClass(cells) : DEFAULT_GRID}>
      {shown.map((video, index) => {
        const s = slots.find((x) => x.at === index);
        return (
          <Cell
            key={video.id}
            ad={s ? <TsGridAd key={`ts-ad-${s.slot}`} onEmpty={() => onEmpty(s.slot)} /> : null}
          >
            <VideoCard video={video} eager={index < eagerCount} />
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
          <Skeleton className={ads ? "aspect-[300/250] rounded-xl" : "aspect-video rounded-xl"} />
          <Skeleton className="mt-3 h-4 w-4/5 rounded-sm" />
          <Skeleton className="mt-2 h-3 w-1/3 rounded-sm" />
        </div>
      ))}
    </div>
  );
}
