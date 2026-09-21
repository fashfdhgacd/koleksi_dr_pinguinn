import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const BRAND_POSTER = "/brand-poster.jpg";

const VIDEO_FRAME_TIMEOUT_MS = 2800;

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
      {!loaded ? (
        <>
          <div className="absolute inset-0 skeleton-shimmer" aria-hidden />
          <img
            src={BRAND_POSTER}
            alt=""
            aria-hidden
            className="absolute inset-0 size-full object-cover opacity-35"
            loading="eager"
            decoding="async"
          />
        </>
      ) : null}
      {children}
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

  // Videy/video-src: don't leave a black frame forever — fall back to brand poster.
  useEffect(() => {
    if (!src || failed || loaded || !isVideoSrc(src)) return;
    const tid = window.setTimeout(() => setFailed(true), VIDEO_FRAME_TIMEOUT_MS);
    return () => window.clearTimeout(tid);
  }, [src, failed, loaded]);

  if (!src || src === BRAND_POSTER) {
    return <BrandFallback className={className} alt={alt} />;
  }

  if (failed) {
    return <BrandFallback className={className} alt={alt} />;
  }

  if (isVideoSrc(src)) {
    return (
      <ThumbShell loaded={loaded}>
        <video
          src={src}
          muted
          playsInline
          preload={eager ? "auto" : "metadata"}
          poster={BRAND_POSTER}
          className={cn(
            "media-thumb relative size-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
            className,
          )}
          onLoadedData={() => setLoaded(true)}
          onError={() => setFailed(true)}
          aria-label={alt}
        />
      </ThumbShell>
    );
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
