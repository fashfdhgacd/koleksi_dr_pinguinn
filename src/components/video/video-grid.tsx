// Grid: 2 / 3 / 4 kolom (mobile / tablet / desktop).
// withAd: one ExoClick 300x250 slot (full-width row, centered) after the 8th card. Opt-in:
// only listing grids (Terbaru / kategori / search) pass it, never the watch page.
import type { VideoCard as VideoCardType } from "@/lib/catalog/types";
import { isRealMinor } from "@/lib/minor-terms";
import { Skeleton } from "@/components/ui/skeleton";
import { AdSlot } from "@/components/ad-slot";
import { VideoCard } from "./video-card";

const AD_AFTER = 8;

function visibleCards(items: VideoCardType[]): VideoCardType[] {
  return items.filter((video) => !isRealMinor({ title: video.title, tags: video.category }));
}

export function VideoGrid({
  items,
  eagerCount = 4,
  withAd = false,
}: {
  items: VideoCardType[];
  eagerCount?: number;
  withAd?: boolean;
}) {
  const shown = visibleCards(items);
  const showAd = withAd && shown.length > AD_AFTER;
  // Remount the slot (=> fresh serve push) whenever the listing changes (SPA page/route change).
  const adKey = showAd ? `ad-${shown[0]?.id ?? ""}-${shown.length}` : "";
  return (
    <div className="grid grid-flow-row-dense grid-cols-2 gap-x-2.5 gap-y-5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 lg:grid-cols-4">
      {shown.map((video, index) => [
        <VideoCard key={video.id} video={video} eager={index < eagerCount} />,
        showAd && index === AD_AFTER - 1 ? <AdSlot key={adKey} /> : null,
      ])}
    </div>
  );
}

export function VideoGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-2.5 gap-y-5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-1">
          <Skeleton className="aspect-video rounded-xl" />
          <Skeleton className="mt-3 h-4 w-4/5 rounded-sm" />
          <Skeleton className="mt-2 h-3 w-1/3 rounded-sm" />
        </div>
      ))}
    </div>
  );
}
