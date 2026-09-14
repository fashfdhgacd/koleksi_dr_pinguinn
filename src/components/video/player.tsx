import { useEffect, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VideoDetail, VideoQuality } from "@/lib/catalog/types";
import { VideoThumb } from "./thumb";
import { cn } from "@/lib/utils";

export function VideoPlayer({ item }: { item: VideoDetail }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [qualityUrl, setQualityUrl] = useState(item.video_url);

  useEffect(() => {
    setStarted(false);
    setBuffering(false);
    setFailed(false);
    setQualityUrl(item.video_url);
  }, [item.id, item.video_url]);

  const qualities = item.qualities;
  const canPlay = Boolean(qualityUrl);

  function startPlayback(url = qualityUrl) {
    if (!url) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setQualityUrl(url);
    setStarted(true);
    setBuffering(true);
  }

  function changeQuality(next: VideoQuality) {
    const node = videoRef.current;
    const time = node?.currentTime ?? 0;
    const wasPaused = node?.paused ?? false;
    setQualityUrl(next.url);
    setFailed(false);
    setStarted(true);
    requestAnimationFrame(() => {
      const el = videoRef.current;
      if (!el) return;
      const resume = () => {
        el.currentTime = time;
        if (!wasPaused) void el.play().catch(() => setFailed(true));
        el.removeEventListener("loadedmetadata", resume);
      };
      el.addEventListener("loadedmetadata", resume);
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-surface">
      <div className="relative aspect-video bg-background">
        {!started ? (
          <>
            <VideoThumb src={item.thumbnail} alt={item.title} eager className="size-full object-cover" />
            <div className="absolute inset-0 bg-background/25" />
            <button
              type="button"
              className="absolute inset-0 flex items-center justify-center"
              onClick={() => startPlayback()}
              disabled={!canPlay}
              aria-label={canPlay ? `Putar ${item.title}` : "Video tidak tersedia"}
            >
              <span className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-150 active:scale-[0.96]">
                <Play className="size-6 fill-current" style={{ marginLeft: 3 }} />
              </span>
            </button>
          </>
        ) : (
          <video
            key={qualityUrl ?? item.id}
            ref={videoRef}
            className="size-full bg-background object-contain"
            poster={item.thumbnail}
            controls
            playsInline
            preload="metadata"
            autoPlay
            src={qualityUrl ?? undefined}
            onWaiting={() => setBuffering(true)}
            onPlaying={() => {
              setBuffering(false);
              setFailed(false);
            }}
            onCanPlay={() => setBuffering(false)}
            onError={() => {
              setBuffering(false);
              setFailed(true);
            }}
          />
        )}

        {buffering && started ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/30">
            <LoaderCircle className="size-8 animate-spin text-foreground" />
          </div>
        ) : null}

        {failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 px-6 text-center">
            <AlertTriangle className="size-7 text-destructive" />
            <p className="max-w-sm text-sm text-muted">
              Sumber video gagal dimuat. Coba kualitas lain atau ulangi.
            </p>
            <Button
              onClick={() => {
                setFailed(false);
                startPlayback(qualityUrl);
              }}
            >
              Coba lagi
            </Button>
          </div>
        ) : null}

        {!canPlay && !started ? (
          <div className="absolute inset-x-0 bottom-0 p-4 text-center text-sm text-muted">
            File putar tidak tersedia untuk judul ini.
          </div>
        ) : null}
      </div>

      {qualities.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <span className="text-xs text-muted">Kualitas</span>
          {qualities.map((q) => (
            <button
              key={q.url}
              type="button"
              onClick={() => changeQuality(q)}
              className={cn(
                "h-8 rounded-md px-2.5 text-xs font-medium transition-colors duration-150",
                q.url === qualityUrl ? "bg-primary text-primary-foreground" : "bg-secondary text-muted",
              )}
            >
              {q.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
