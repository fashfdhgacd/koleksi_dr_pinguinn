import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, LoaderCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VideoDetail, VideoQuality } from "@/lib/catalog/types";
import { hostLabel, hostPriority, isIndoAvUrl, resolveSource, type ResolvedSource } from "@/lib/catalog/embed";
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
  // IndoAV first so viewer bonus can fire. Direct files are fallback only.
  out.sort((a, b) => hostPriority(`${a.host} ${a.url}`) - hostPriority(`${b.host} ${b.url}`));
  return out;
}

function isFileUrl(url: string | null): boolean {
  return Boolean(url && /\.(mp4|mov|webm)($|\?)/i.test(url));
}

function normalizePlayUrl(url: string, host: string): string {
  try {
    const u = new URL(url);
    if (/streamtape|strcloud/i.test(host + u.hostname)) {
      u.pathname = u.pathname.replace(/\/(?:v|d)\//, "/e/");
      return u.toString();
    }
    if (/indoav|userbokep/i.test(host + u.hostname)) {
      u.pathname = u.pathname.replace(/\/d\//, "/e/");
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
  const [failed, setFailed] = useState(false);
  const [fallbackAt, setFallbackAt] = useState(0);

  const current = list[active] ?? null;
  const rawPlay = current?.fallbacks[fallbackAt] ?? current?.url ?? null;
  const playUrl = rawPlay && current ? normalizePlayUrl(rawPlay, current.host) : rawPlay;
  const useVideo = isFileUrl(playUrl);
  const indoFirst = Boolean(current && isIndoAvUrl(current.url));

  useEffect(() => {
    setActive(0);
    setFailed(false);
    setFallbackAt(0);
    setBuffering(false);
    // Auto-start IndoAV embed so the partner player can count a view.
    const first = list[0];
    const auto = Boolean(first && isIndoAvUrl(first.url));
    setStarted(auto);
  }, [item.id, list]);

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

  function openExternal() {
    if (playUrl) window.open(playUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-surface">
      <div className="relative aspect-video bg-background">
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
          <iframe
            key={playUrl}
            src={playUrl}
            title={item.title}
            className="size-full border-0 bg-background"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
            loading="eager"
          />
        ) : (
          <video
            key={playUrl ?? item.id}
            ref={videoRef}
            className="size-full bg-background object-contain"
            poster={item.thumbnail || undefined}
            controls
            playsInline
            preload="auto"
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
            <p className="max-w-sm text-sm text-muted">
              Sumber gagal dimuat. Coba host lain atau ulangi.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                onClick={() => {
                  setFailed(false);
                  setFallbackAt(0);
                  start();
                }}
              >
                Coba lagi
              </Button>
              {playUrl ? (
                <Button variant="secondary" onClick={openExternal}>
                  <ExternalLink className="mr-1.5 size-4" />
                  Buka sumber
                </Button>
              ) : null}
            </div>
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
              {isIndoAvUrl(src.url) ? " · prioritas" : ""}
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
                resolveSource(q.url)?.url === current?.url
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted",
              )}
            >
              {q.label || hostLabel(q.url)}
            </button>
          ))}
        </div>
      ) : current ? (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted">
          <span>Sumber: {current.host}{indoFirst ? " · DR. PINGUIN 18+" : ""}</span>
        </div>
      ) : null}
    </div>
  );
}
