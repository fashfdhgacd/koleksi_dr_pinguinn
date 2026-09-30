import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import type { VideoCard as VideoCardType } from "@/lib/catalog/types";
import { rememberCatalog } from "@/lib/catalog/last-catalog";
import { VideoThumb } from "./thumb";

type VideoCardPreload = false | "intent" | "viewport";

export function VideoCard({
  video,
  eager = false,
  preload = false,
}: {
  video: VideoCardType;
  eager?: boolean;
  preload?: VideoCardPreload;
}) {
  const showDuration = video.durationLabel && video.durationLabel !== "\u2014";

  return (
    <Link
      to="/watch/$id"
      params={{ id: video.id }}
      preload={preload}
      onClick={() => rememberCatalog()}
      className="group block rounded-xl p-0.5 transition-colors duration-150 ease-out hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-1"
    >
      <div className="relative aspect-video overflow-hidden rounded-lg bg-surface-2">
        <VideoThumb src={video.thumbnail} alt={video.title} eager={eager} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-80" />
        {showDuration ? (
          <div className="absolute bottom-1.5 left-1.5 text-[10px] font-medium tabular-nums text-foreground sm:bottom-2 sm:left-2 sm:text-[11px]">
            <span className="rounded-sm bg-background/70 px-1.5 py-0.5">{video.durationLabel}</span>
          </div>
        ) : null}
        <div className="pointer-events-none absolute inset-0 hidden items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 sm:flex">
          <span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Play className="size-4 fill-current" style={{ marginLeft: 2 }} />
          </span>
        </div>
      </div>
      <div className="px-0.5 pb-2 pt-2 sm:px-1.5 sm:pt-2.5">
        <h3 className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground sm:text-sm">{video.title}</h3>
        <p className="mt-0.5 truncate text-[11px] text-muted sm:mt-1 sm:text-xs">{video.category}</p>
      </div>
    </Link>
  );
}
