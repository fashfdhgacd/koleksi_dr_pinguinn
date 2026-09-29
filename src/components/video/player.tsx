import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, LoaderCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VideoDetail } from "@/lib/catalog/types";
import { hostPriority, resolveSource, type ResolvedSource } from "@/lib/catalog/embed";
import { VideoThumb } from "./thumb";

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
  out.sort((a, b) => hostPriority(`${a.host} ${a.url}`) - hostPriority(`${b.host} ${b.url}`));
  return out;
}

function isFileUrl(url: string | null): boolean {
  return Boolean(url && /\.(mp4|mov|webm)($|\?)/i.test(url));
}

function normalizePlayUrl(url: string, host: string): string {
  try {
    const u = new URL(url);
    const blob = `${host} ${u.hostname} ${u.pathname}`;
    if (/streamtape|strcloud|puterin|putarin|indoav|userbokep|lulu/i.test(blob)) {
      u.pathname = u.pathname.replace(/\/(?:v|d|watch)\//, "/e/");
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

export function VideoPlayer({ item }: { item: VideoDetail }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const list = useMemo(() => sourcesFromItem(item), [item]);
  const [active, setActive] = useState(0);
  const [started, setStarted] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [embedReady, setEmbedReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fallbackAt, setFallbackAt] = useState(0);

  const current = list[active] ?? null;
  const rawPlay = current?.fallbacks[fallbackAt] ?? current?.url ?? null;
  const playUrl = rawPlay && current ? normalizePlayUrl(rawPlay, current.host) : rawPlay;
  const useVideo = isFileUrl(playUrl);
  const lastIframe =
    Boolean(current && !useVideo && fallbackAt >= Math.max(0, (current.fallbacks.length || 1) - 1));

  useEffect(() => {
    setActive(0);
    setFailed(false);
    setFallbackAt(0);
    setBuffering(false);
    setEmbedReady(false);
    setStarted(false);
  }, [item.id]);

  useEffect(() => {
    if (!started || useVideo || lastIframe) return;
    const t = window.setTimeout(() => {
      setFallbackAt((n) => n + 1);
      setEmbedReady(false);
    }, 2500);
    return () => window.clearTimeout(t);
  }, [started, useVideo, lastIframe, playUrl]);

  function start() {
    if (!current || !playUrl) {
      startTransition(() => setFailed(true));
      return;
    }
    startTransition(() => {
      setFailed(false);
      setStarted(true);
      setEmbedReady(false);
      setBuffering(useVideo);
    });
  }

  function openSource() {
    if (playUrl) window.open(playUrl, "_blank", "noopener");
  }

  function pickSource(index: number) {
    setActive(index);
    setFallbackAt(0);
    setFailed(false);
    setStarted(true);
    setEmbedReady(false);
    setBuffering(isFileUrl(list[index]?.url ?? null));
  }

  function retryQuiet() {
    if (active + 1 < list.length) {
      pickSource(active + 1);
      return;
    }
    setFailed(false);
    setFallbackAt(0);
    start();
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-surface">
      <div className="relative aspect-video max-h-[min(70vh,720px)] w-full bg-background sm:mx-auto">
        {!started ? (
          <>
            <VideoThumb src={item.thumbnail} alt={item.title} eager className="size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-transparent" />
            <button
              type="button"
              className="absolute inset-0 flex items-center justify-center"
              onClick={start}
              disabled={!current}
              aria-label={current ? `Putar ${item.title}` : "Video tidak tersedia"}
            >
              <span className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-150 active:scale-[0.96] sm:size-20">
                <Play className="size-7 fill-current sm:size-8" style={{ marginLeft: 3 }} />
              </span>
            </button>
          </>
        ) : !useVideo && playUrl ? (
          <>
            <iframe
              key={playUrl}
              src={playUrl}
              title={item.title}
              className="absolute inset-0 size-full border-0 bg-background"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              loading="eager"
              onLoad={() => setEmbedReady(true)}
            />
            {!embedReady ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 px-4">
                <LoaderCircle className="size-8 animate-spin text-foreground" />
                <button
                  type="button"
                  className="flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
                  onClick={openSource}
                >
                  <ExternalLink className="size-4" />
                  Buka pemutar
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <video
            key={playUrl ?? item.id}
            ref={videoRef}
            className="size-full bg-background object-contain"
            poster={item.thumbnail || undefined}
            controls
            playsInline
            preload="metadata"
            autoPlay
            referrerPolicy="no-referrer-when-downgrade"
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
              if (active + 1 < list.length) {
                pickSource(active + 1);
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/85 px-6 text-center">
            <AlertTriangle className="size-7 text-destructive" />
            <p className="max-w-sm text-sm text-muted">Hosternya menolak diputar di sini.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={openSource}>Buka pemutar</Button>
              <Button variant="secondary" onClick={retryQuiet}>
                Coba lagi
              </Button>
            </div>
          </div>
        ) : null}

        {!current && !started ? (
          <div className="absolute inset-x-0 bottom-0 p-4 text-center text-sm text-muted">
            Video tidak tersedia untuk judul ini.
          </div>
        ) : null}
      </div>
    </div>
  );
}
