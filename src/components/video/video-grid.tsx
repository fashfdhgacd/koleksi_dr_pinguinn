// Grid: 2 / 3 / 4 kolom (mobile / tablet / desktop).
// Catalog grids (ads): fixed 312px columns (1 / 2 / 3), card thumbs 300:250 like the ad card,
// one ExoClick ad card after the 4th video. The watch page keeps the default grid, no ads.
import type { VideoCard as VideoCardType } from "@/lib/catalog/types";
import { isRealMinor } from "@/lib/minor-terms";
import { Skeleton } from "@/components/ui/skeleton";
import { AdSlot } from "@/components/ad-slot";
import { VideoCard } from "./video-card";

const DEFAULT_GRID =
  "grid grid-cols-2 gap-x-2.5 gap-y-5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 lg:grid-cols-4";
const AD_GRID =
  "grid grid-cols-[minmax(0,312px)] justify-center gap-x-4 gap-y-5 sm:grid-cols-[repeat(2,312px)] sm:gap-y-7 lg:grid-cols-[repeat(3,312px)] [&>a>div:first-child]:aspect-[300/250]";
const AD_AFTER = 4;

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
  return (
    <div className={ads ? AD_GRID : DEFAULT_GRID}>
      {shown.map((video, index) => (
        <VideoCardWithAd
          key={video.id}
          video={video}
          eager={index < eagerCount}
          adBefore={ads && index === AD_AFTER}
        />
      ))}
      {ads && shown.length > 0 && shown.length <= AD_AFTER ? <AdSlot /> : null}
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
