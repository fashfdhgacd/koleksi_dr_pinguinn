import { cleanDisplayTitle } from "@/lib/seo";
import { Link } from "@tanstack/react-router";
import { Clock, Eye, Heart, Play } from "lucide-react";
import type { VideoCard as VideoCardType } from "@/lib/catalog/types";
import { rememberCatalog } from "@/lib/catalog/last-catalog";
import { useSiteLikes } from "@/lib/live-likes";
import { VideoThumb } from "./thumb";

function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return String(n);
}

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
  // 0 is shown too (own-pageview sources start at 0); null = no count known.
  const views = typeof video.views === "number" && video.views >= 0 ? video.views : null;
  // Likes = source likes (folder stats) + our own D1 likes, 0 when none. Our likes start from the
  // 12-hour snapshot and switch to the live count (/api/likes-live, ~60 s) once the page has loaded.
  // Always shown, so every card has the same plain stats row (never a bare category label).
  const ours = useSiteLikes(video.id, video.siteLikes);
  const likes = Math.max(0, typeof video.likes === "number" ? video.likes : 0) + ours;
  const showDuration = Boolean(video.durationLabel && video.durationLabel !== "\u2014");

  return (
    <Link
      to="/watch/$id"
      params={{ id: video.id }}
      preload={preload}
      onClick={() => rememberCatalog()}
      className="group block rounded-xl p-1 transition-colors duration-150 ease-out hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-1.5"
    >
      <div className="relative aspect-video overflow-hidden rounded-xl bg-surface-2">
        <VideoThumb
          src={typeof video.thumbnail === "string" ? video.thumbnail : ""}
          alt={video.title}
          videoId={video.id}
          eager={eager}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-80" />
        <div className="pointer-events-none absolute inset-0 hidden items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 sm:flex">
          <span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Play className="size-4 fill-current" style={{ marginLeft: 2 }} />
          </span>
        </div>
      </div>
      <div className="px-1 pb-1 pt-2.5 sm:px-1.5 sm:pt-3">
        <h3 className="line-clamp-2 min-h-[2.5em] text-[13px] font-medium leading-snug text-foreground sm:text-[15px]">
          {cleanDisplayTitle(video.title)}
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-muted sm:text-xs">
          {typeof video.periodViews === "number" && video.periodLabel ? (
            <span
              className="inline-flex items-center gap-1"
              aria-label={`${video.periodViews} kali ditonton ${video.periodLabel}`}
            >
              <Eye className="size-3.5" aria-hidden="true" />
              {video.periodViews.toLocaleString("id-ID")} tayangan {video.periodLabel}
            </span>
          ) : views != null ? (
            <span className="inline-flex items-center gap-1" aria-label={`${views} kali ditonton`}>
              <Eye className="size-3.5" aria-hidden="true" />
              {compactNumber(views)}
            </span>
          ) : null}
          {showDuration ? (
            <span className="inline-flex items-center gap-1" aria-label="Durasi">
              <Clock className="size-3.5" aria-hidden="true" />
              {video.durationLabel}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1" aria-label={`${likes} suka`}>
            <Heart className="size-3.5" aria-hidden="true" />
            {compactNumber(likes)}
          </span>
        </div>
      </div>
    </Link>
  );
}
