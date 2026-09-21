import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const BRAND_POSTER = "/brand-poster.jpg";

/** Cached JPEG frame blob URLs keyed by video src — revisiting a card is instant. */
const frameCache = new Map<string, string>();

function isVideoSrc(src: string): boolean {
  return /\.(mp4|mov|webm)(\?|$)/i.test(src) || /cdn\.videy\.co\//i.test(src);
}

function BrandFallback({ className, alt }: { className?: string; alt?: string }) {
  return (
    <img
      src={BRAND_POSTER}
      alt={alt || "DR. PINGUIN"}
      className={cn("media-thumb size-full object-cover", className)}
      loading="lazy"
      decoding="async"
    />
  );
}

function ThumbShell({ children, loaded }: { children: ReactNode; loaded: boolean }) {
  return (
    <div className="relative size-full overflow-hidden bg-zinc-900">
      {!loaded ? <div className="absolute inset-0 skeleton-shimmer" aria-hidden /> : null}
      {children}
    </div>
  );
}

/**
 * Videy / mp4 / webm thumbs: never eager-download 64MB files, never treat
 * "slow" as "missing". Only load near viewport, seek to a visible frame,
 * optionally freeze that frame to a blob <img> so decoders can be released.
 */
function VideoFrameThumb({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const [failed, setFailed] = useState(false);
  const [frameUrl, setFrameUrl] = useState<string | null>(() => frameCache.get(src) ?? null);
  const [showVideoFrame, setShowVideoFrame] = useState(false);

  const loaded = Boolean(frameUrl) || showVideoFrame;

  useEffect(() => {
    const cached = frameCache.get(src);
    setFrameUrl(cached ?? null);
    setShowVideoFrame(false);
    setFailed(false);
    setInView(false);
  }, [src]);

  // Only attach the <video> when the card is near the viewport.
  useEffect(() => {
    if (frameCache.has(src)) return;
    const el = shellRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [src]);

  // Seek + capture once the video element is mounted and near viewport.
  useEffect(() => {
    if (!inView || failed || frameUrl) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let captured = false;

    const releaseDecoder = () => {
      try {
        video.removeAttribute("src");
        video.load();
      } catch {
        /* ignore */
      }
    };

    const markVideoVisible = () => {
      if (cancelled || captured) return;
      captured = true;
      setShowVideoFrame(true);
    };

    const captureToBlob = () => {
      if (cancelled || captured) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) {
        markVideoVisible();
        return;
      }
      try {
        const canvas = document.createElement("canvas");
        const maxW = 480;
        const scale = Math.min(1, maxW / w);
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          markVideoVisible();
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (cancelled) return;
            if (!blob) {
              markVideoVisible();
              return;
            }
            captured = true;
            const url = URL.createObjectURL(blob);
            const prev = frameCache.get(src);
            frameCache.set(src, url);
            if (prev && prev !== url) URL.revokeObjectURL(prev);
            setFrameUrl(url);
            setShowVideoFrame(false);
            releaseDecoder();
          },
          "image/jpeg",
          0.82,
        );
      } catch {
        // Cross-origin without CORS taints the canvas — keep the seeked <video> frame.
        markVideoVisible();
      }
    };

    const seekToFrame = () => {
      if (cancelled) return;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const target =
        duration > 0 ? Math.min(0.45, Math.max(0.2, duration * 0.02)) : 0.3;
      try {
        if (Math.abs(video.currentTime - target) > 0.05) {
          video.currentTime = target;
        } else if (video.readyState >= 2) {
          captureToBlob();
        }
      } catch {
        if (video.readyState >= 2) captureToBlob();
      }
    };

    const onSeeked = () => captureToBlob();
    const onLoadedData = () => {
      if (video.currentTime > 0.05 && video.readyState >= 2) captureToBlob();
    };
    const onError = () => {
      if (!cancelled) setFailed(true);
    };

    video.addEventListener("loadedmetadata", seekToFrame);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("error", onError);

    if (video.readyState >= 1) seekToFrame();

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", seekToFrame);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("error", onError);
    };
  }, [inView, failed, frameUrl, src]);

  if (failed) {
    return <BrandFallback className={className} alt={alt} />;
  }

  return (
    <div ref={shellRef} className="relative size-full overflow-hidden bg-zinc-900">
      {!loaded ? <div className="absolute inset-0 skeleton-shimmer" aria-hidden /> : null}
      {frameUrl ? (
        <img
          src={frameUrl}
          alt={alt}
          decoding="async"
          className={cn(
            "media-thumb relative size-full object-cover transition-opacity duration-300 opacity-100",
            className,
          )}
        />
      ) : inView ? (
        <video
          ref={videoRef}
          src={`${src}#t=0.3`}
          muted
          playsInline
          preload="metadata"
          className={cn(
            "media-thumb relative size-full object-cover transition-opacity duration-300",
            showVideoFrame ? "opacity-100" : "opacity-0",
            className,
          )}
          aria-label={alt}
        />
      ) : null}
    </div>
  );
}

export function VideoThumb({
  src,
  alt,
  eager = false,
  className,
}: {
  src: string;
  alt: string;
  eager?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  if (!src || src === BRAND_POSTER) {
    return <BrandFallback className={className} alt={alt} />;
  }

  if (failed) {
    return <BrandFallback className={className} alt={alt} />;
  }

  if (isVideoSrc(src)) {
    // eager must NOT mean "download 64MB" — VideoFrameThumb is viewport-gated.
    return <VideoFrameThumb src={src} alt={alt} className={className} />;
  }

  return (
    <ThumbShell loaded={loaded}>
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "low"}
        referrerPolicy="no-referrer"
        className={cn(
          "media-thumb relative size-full object-cover transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0",
          className,
        )}
        onError={() => setFailed(true)}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth <= 2 && img.naturalHeight <= 2) {
            setFailed(true);
            return;
          }
          setLoaded(true);
        }}
      />
    </ThumbShell>
  );
}
