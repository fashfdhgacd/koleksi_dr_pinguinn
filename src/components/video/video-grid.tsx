import type { VideoCard as VideoCardType } from "@/lib/catalog/types";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoCard } from "./video-card";

export function VideoGrid({
  items,
  eagerCount = 0,
}: {
  items: VideoCardType[];
  eagerCount?: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((video, index) => (
        <VideoCard key={video.id} video={video} eager={index < eagerCount} />
      ))}
    </div>
  );
}

export function VideoGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-1">
          <Skeleton className="aspect-video rounded-lg" />
          <Skeleton className="mt-3 h-4 w-4/5 rounded-sm" />
          <Skeleton className="mt-2 h-3 w-1/3 rounded-sm" />
        </div>
      ))}
    </div>
  );
}
