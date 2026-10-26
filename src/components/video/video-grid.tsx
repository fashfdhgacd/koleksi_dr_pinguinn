// Grid: 2 / 3 / 4 kolom (mobile / tablet / desktop) for the watch page; catalog grids 1 / 3 / 4.
// Catalog grids (home, kategori; `ads` prop): 1 / 3 / 4 columns (cards sized for a 300x250 ad),
// card thumbs 300:250, and an ExoClick 300x250 card (ad-slot.tsx, zone 6053864) as every 8th card
// (cells 8, 16, 24, 32; max 4), each one card footprint, lazy-loaded. Pages hold 36 videos; trailing videos are trimmed so rows stay full at 3 and 4 columns.
// The watch page ("Tonton juga") keeps the default grid, no ads.
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
  "grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-3 sm:gap-y-7 lg:grid-cols-4 [&>a>div:first-child]:aspect-[300/250]";

/**
 * Rows full: hide trailing videos so the cell count (videos + ads) is a multiple of the column
 * count, 3 on tablet (sm..lg) and 4 on laptop (lg+). Ads are divs, videos are links, so
 * nth-last-of-type only counts videos. Static strings so Tailwind generates them.
 */
const TRIM_SM = [
  "",
  " sm:max-lg:[&>a:nth-last-of-type(-n+1)]:hidden",
  " sm:max-lg:[&>a:nth-last-of-type(-n+2)]:hidden",
];
const TRIM_LG = [
  "",
  " lg:[&>a:nth-last-of-type(-n+1)]:hidden",
  " lg:[&>a:nth-last-of-type(-n+2)]:hidden",
  " lg:[&>a:nth-last-of-type(-n+3)]:hidden",
];
function trimClass(count: number): string {
  if (count <= 12) return "";
  return TRIM_SM[count % 3] + TRIM_LG[count % 4];
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
  // Up to 4 slots, every 8th card; each lazy-loads (an unfilled slot stays a blank card footprint).
  const slots = ads
    ? AD_POSITIONS.map((at, slot) => ({ at, slot })).filter((x) => x.at < shown.length)
    : [];
  const cells = shown.length + slots.length;
  // "Kembali ke katalog" with a full load: scroll back to where the card was clicked.
  const hasItems = shown.length > 0;
  useEffect(() => {
    if (ads && hasItems) restoreCatalogScroll();
  }, [ads, hasItems]);
  return (
    <div
      className={ads ? CATALOG_GRID + trimClass(cells) : DEFAULT_GRID}
      // Catalog grids only: first video-card click per session also opens the popunder.
      onClickCapture={ads ? (e) => onCatalogCardClick(e, (id) => String(shown.find((v) => v.id === id)?.creator || "")) : undefined}
    >
      {shown.map((video, index) => {
        const s = slots.find((x) => x.at === index);
        return (
          <Cell
            key={video.id}
            ad={s ? <AdSlot key={`exo-ad-${s.slot}`} /> : null}
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
