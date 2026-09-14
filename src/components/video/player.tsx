import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VideoDetail, VideoQuality } from "@/lib/catalog/types";
import { hostLabel, resolveSource, type ResolvedSource } from "@/lib/catalog/embed";
import { VideoThumb } from "./thumb";
import { cn } from "@/lib/utils";

function sourcesFromItem(item: VideoDetail): ResolvedSource[] {
  const raw = [item.video_url, ...item.qualities.map((q) => q.url)].filter((u): u is string => Boolean(u));
  const seen = new Set<string>();
  const out: ResolvedSource[] = [];
  for (const url of raw) {
    const resolved = resolveSource(url);
    if (!resolved || seen.has(resolved.url)) continue;
    seen.add(resolved.url);
    out.push(resolved);
  }
  return out;
}

function isFileUrl(url: string | null): boolean {
  return Boolean(url && /\.(mp4|mov|webm)($|\?)/i.test(url));
}

export function VideoPlayer({ item }: { item: VideoDetail }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const list = useMemo(() => sourcesFromItem(item), [item]);
  const [active, setActive] = useState(0);
  const [started, setStarted] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fallbackAt, setFallbackAt] = useState(0);

  const current = list[active] ?? null;
  const playUrl = current?.fallbacks[fallbackAt] ?? current?.url ?? null;
  const useVideo = isFileUrl(playUrl);

  useEffect(() => {
    setActive(0);
    setStarted(false);
    setBuffering(false);
    setFailed(false);
    setFallbackAt(0);
  }, [item.id]);

  function start() {
    if (!current || !playUrl) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setStarted(true);
    setBuffering(useVideo);
  }

  function pickSource(index: number) {
    setActive(index);
    setFallbackAt(0);
    setFailed(false);
    setStarted(true);
    setBuffering(isFileUrl(list[index]?.url ?? null));
  }

  function changeQuality(next: VideoQuality) {
    const resolved = resolveSource(next.url);
    if (!resolved) return;
    const idx = list.findIndex((s) => s.url === resolved.url);
    pickSource(idx >= 0 ? idx : 0);
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
              onClick={start}
              disabled={!current}
              aria-label={current ? `Putar ${item.title}` : "Video tidak tersedia"}
            >
              <span className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-150 active:scale-[0.96]">
                <Play className="size-6 fill-current" style={{ marginLeft: 3 }} />
              </span>
            </button>
          </>
        ) : !useVideo && playUrl ? (
          <iframe
            key={playUrl}
            src={playUrl}
            title={item.title}
            className="size-full border-0 bg-background"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <video
            key={playUrl ?? item.id}
            ref={videoRef}
            className="size-full bg-background object-contain"
            poster={item.thumbnail}
            controls
            playsInline
            preload="metadata"
            autoPlay
            referrerPolicy="strict-origin-when-cross-origin"
            src={playUrl ?? undefined}
            onWaiting={() => setBuffering(true)}
            onPlaying={() => {
              setBuffering(false);
              setFailed(false);
            }}
            onCanPlay={() => setBuffering(false)}
            onError={() => {
              const next = fallbackAt + 1;
              if (current && next < current.fallbacks.length) {
                setFallbackAt(next);
                return;
              }
              setBuffering(false);
              setFailed(true);
            }}
          />
        )}

        {buffering && started && useVideo ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/30">
            <LoaderCircle className="size-8 animate-spin text-foreground" />
          </div>
        ) : null}

        {failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 px-6 text-center">
            <AlertTriangle className="size-7 text-destructive" />
            <p className="max-w-sm text-sm text-muted">Sumber gagal dimuat. Coba host lain atau ulangi.</p>
            <Button
              onClick={() => {
                setFailed(false);
                setFallbackAt(0);
                start();
              }}
            >
              Coba lagi
            </Button>
          </div>
        ) : null}

        {!current && !started ? (
          <div className="absolute inset-x-0 bottom-0 p-4 text-center text-sm text-muted">
            File putar tidak tersedia untuk judul ini.
          </div>
        ) : null}
      </div>

      {list.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <span className="text-xs text-muted">Host</span>
          {list.map((src, i) => (
            <button
              key={src.url}
              type="button"
              onClick={() => pickSource(i)}
              className={cn(
                "h-8 rounded-md px-2.5 text-xs font-medium transition-colors duration-150",
                i === active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted",
              )}
            >
              {src.host}
            </button>
          ))}
        </div>
      ) : item.qualities.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <span className="text-xs text-muted">Kualitas</span>
          {item.qualities.map((q) => (
            <button
              key={q.url}
              type="button"
              onClick={() => changeQuality(q)}
              className={cn(
                "h-8 rounded-md px-2.5 text-xs font-medium transition-colors duration-150",
                resolveSource(q.url)?.url === current?.url ? "bg-primary text-primary-foreground" : "bg-secondary text-muted",
              )}
            >
              {q.label || hostLabel(q.url)}
            </button>
          ))}
        </div>
      ) : current ? (
        <div className="border-t border-border px-4 py-2 text-xs text-muted">Sumber: {current.host}</div>
      ) : null}
    </div>
  );
}
