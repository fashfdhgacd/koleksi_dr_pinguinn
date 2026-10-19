// Grid: 2 / 3 / 4 kolom (mobile / tablet / desktop).
// Catalog grids (home, kategori; `ads` prop kept as the catalog-layout flag, no ads are rendered):
// fluid columns filling the content width (1 / 3 / 4), card thumbs 300:250. Pages hold 36 videos
// (DEFAULT_PAGE_SIZE), a multiple of 12, so every row is full at 1, 3 and 4 columns.
// The watch page keeps the default grid.
import type { VideoCard as VideoCardType } from "@/lib/catalog/types";
import { isRealMinor } from "@/lib/minor-terms";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoCard } from "./video-card";

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
  /** Catalog layout (1 / 3 / 4 columns, 300:250 thumbs). Name kept for existing callers; renders no ads. */
  ads?: boolean;
}) {
  const shown = visibleCards(items);
  return (
    <div className={ads ? CATALOG_GRID + trimClass(shown.length) : DEFAULT_GRID}>
      {shown.map((video, index) => (
        <VideoCard key={video.id} video={video} eager={index < eagerCount} />
      ))}
    </div>
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
