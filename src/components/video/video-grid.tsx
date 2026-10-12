// Grid: 2 / 3 / 4 kolom (mobile / tablet / desktop).
// Catalog grids (ads): fluid columns filling the content width (1 / 3 / 4), card thumbs 300:250
// like the ad card, one ExoClick ad card at cell 10 (row 3, column 2 at 4 columns). Pages hold 35 videos (DEFAULT_PAGE_SIZE),
// so videos + ad = 36 cells and every row is full at 4 and 3 columns. The watch page keeps the default grid.
import type { VideoCard as VideoCardType } from "@/lib/catalog/types";
import { isRealMinor } from "@/lib/minor-terms";
import { Skeleton } from "@/components/ui/skeleton";
import { AdSlot } from "@/components/ad-slot";
import { VideoCard } from "./video-card";

const DEFAULT_GRID =
  "grid grid-cols-2 gap-x-2.5 gap-y-5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 lg:grid-cols-4";
const AD_GRID =
  "grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-3 sm:gap-y-7 lg:grid-cols-4 [&>a>div:first-child]:aspect-[300/250]";
/** Ad cell index: cell 10 of 36 (row 3, column 2 at 4 columns); short lists: after the 4th video. */
function adIndex(count: number): number {
  return count + 1 >= 12 ? 9 : Math.min(4, count);
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
  ads?: boolean;
}) {
  const shown = visibleCards(items);
  const at = adIndex(shown.length);
  return (
    <div className={ads ? AD_GRID : DEFAULT_GRID}>
      {shown.map((video, index) => (
        <VideoCardWithAd
          key={video.id}
          video={video}
          eager={index < eagerCount}
          adBefore={ads && index === at}
        />
      ))}
      {ads && shown.length > 0 && at >= shown.length ? <AdSlot /> : null}
    </div>
  );
}

function VideoCardWithAd({
  video,
  eager,
  adBefore,
}: {
  video: VideoCardType;
  eager: boolean;
  adBefore: boolean;
}) {
  if (!adBefore) return <VideoCard video={video} eager={eager} />;
  return (
    <>
      <AdSlot />
      <VideoCard video={video} eager={eager} />
    </>
  );
}

export function VideoGridSkeleton({ count = 12, ads = false }: { count?: number; ads?: boolean }) {
  return (
    <div className={ads ? AD_GRID : DEFAULT_GRID}>
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
