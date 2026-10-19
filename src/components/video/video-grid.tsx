// Grid: 2 / 3 / 4 kolom (mobile / tablet / desktop).
// Catalog grids (home, kategori; `ads` prop kept as the catalog-layout flag, no ads are rendered):
// fluid columns filling the content width (1 / 3 / 4), card thumbs 300:250. Pages hold 36 videos
// (DEFAULT_PAGE_SIZE), a multiple of 12, so every row is full at 1, 3 and 4 columns.
// Two TrafficStars cards (ts-grid-ad.tsx): before video 10 (row 3, center column at 4 columns) and
// before video 21; while shown, trailing videos are trimmed at 3/4 columns; each collapses if unfilled.
// The watch page keeps the default grid (no ad).
import type { VideoCard as VideoCardType } from "@/lib/catalog/types";
import { isRealMinor } from "@/lib/minor-terms";
import { Skeleton } from "@/components/ui/skeleton";
import { TsGridAd } from "@/components/ts-grid-ad";
import { VideoCard } from "./video-card";
import { useCallback, useState } from "react";

const DEFAULT_GRID =
  "grid grid-cols-2 gap-x-2.5 gap-y-5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 lg:grid-cols-4";
const CATALOG_GRID =
  "grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-3 sm:gap-y-7 lg:grid-cols-4 [&>a>div:first-child]:aspect-[300/250]";

/**
 * Tablet/desktop: hide up to 3 trailing videos so cells fill whole rows at 3 and 4 columns
 * (multiple of 12, e.g. 39 videos -> 36). Static strings so Tailwind generates them.
 */
const TRIM_CLASS = [
  "",
  " sm:[&>a:nth-last-of-type(-n+1)]:hidden",
  " sm:[&>a:nth-last-of-type(-n+2)]:hidden",
  " sm:[&>a:nth-last-of-type(-n+3)]:hidden",
];
function trimClass(count: number): string {
  const extra = count % 12;
  return count > 12 && extra > 0 && extra <= 3 ? TRIM_CLASS[extra] : "";
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
  /** Catalog layout (1 / 3 / 4 columns, 300:250 thumbs). Also enables the two TrafficStars grid cards. */
  ads?: boolean;
}) {
  const shown = visibleCards(items);
  const [empty, setEmpty] = useState<Record<number, true>>({});
  const onEmpty1 = useCallback(() => setEmpty((e) => ({ ...e, 1: true })), []);
  const onEmpty2 = useCallback(() => setEmpty((e) => ({ ...e, 2: true })), []);
  // Slot 1 before video 10 (row 3 center at 4 columns), slot 2 before video 21; each lazy-loads
  // and collapses on its own if unfilled (the trimmed trailing video then returns).
  const at1 = ads && !empty[1] && shown.length >= 4 ? Math.min(AD_INDEX, shown.length) : -1;
  const at2 = ads && !empty[2] && shown.length > AD_INDEX_2 ? AD_INDEX_2 : -1;
  const cells = shown.length + (at1 >= 0 ? 1 : 0) + (at2 >= 0 ? 1 : 0);
  const ad1 = <TsGridAd key="ts-ad-1" onEmpty={onEmpty1} />;
  const ad2 = <TsGridAd key="ts-ad-2" onEmpty={onEmpty2} />;
  return (
    <div className={ads ? CATALOG_GRID + trimClass(cells) : DEFAULT_GRID}>
      {shown.map((video, index) => (
        <Cell key={video.id} ad={index === at1 ? ad1 : index === at2 ? ad2 : null}>
          <VideoCard video={video} eager={index < eagerCount} />
        </Cell>
      ))}
      {at1 === shown.length ? ad1 : null}
    </div>
  );
}

const AD_INDEX = 9;
const AD_INDEX_2 = 20;

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
