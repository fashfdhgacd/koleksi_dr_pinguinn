import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VideoCard as VideoCardType } from "@/lib/catalog/types";
import { VideoThumb } from "./thumb";

export function Hero({ video }: { video: VideoCardType }) {
  return (
    <section className="relative overflow-hidden rounded-[28px] bg-surface">
      <div className="relative aspect-[4/5] sm:aspect-[16/9] lg:aspect-[21/9]">
        <VideoThumb
          src={video.thumbnail}
          alt={video.title}
          eager
          className="size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/10" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-5 sm:p-8 lg:max-w-2xl lg:p-10">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Pilihan arsip</p>
          <h1 className="font-display text-4xl leading-[1.1] text-foreground sm:text-5xl">{video.title}</h1>
          <p className="line-clamp-3 max-w-xl text-sm leading-relaxed text-muted">{video.description}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            {video.year ? <span>{video.year}</span> : null}
            <span>{video.durationLabel}</span>
            <span>{video.category}</span>
          </div>
          <div>
            <Button asChild size="lg" className="rounded-lg pl-5 pr-4">
              <Link to="/watch/$id" params={{ id: video.id }}>
                <Play className="size-4 fill-current" style={{ marginLeft: 2 }} />
                Putar sekarang
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
