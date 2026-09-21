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
 * Dead path kept for compile safety — VideoThumb no longer mounts this.
 * Videy/mp4 cards use brand poster instead of opening CDN video for thumbs.
 */
function VideoFrameThumb({
  src,
  alt,
  className,
  onUnavailable,
}: {
  src: string;
  alt: string;
  className?: string;
  onUnavailable?: () => void;
}) {
  void src;
  void onUnavailable;
  return <BrandFallback className={className} alt={alt} />;
}

export function VideoThumb({
  src,
  alt,
  eager = false,
  className,
  onUnavailable,
}: {
  src: string;
  alt: string;
  eager?: boolean;
  className?: string;
  /** Fires when thumb is missing/brand or load fails (hero can skip the slide). */
  onUnavailable?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // mp4 / cdn.videy.co → treat as unavailable art (hero skips; grids show brand).
  const brandOrEmpty =
    !src || src === BRAND_POSTER || /brand-poster/i.test(src) || isVideoSrc(src);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  useEffect(() => {
    if (!(brandOrEmpty || failed)) return;
    onUnavailable?.();
    // one-shot per src / failed flip — avoid loops if parent recreates callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandOrEmpty, failed, src]);

  if (brandOrEmpty) {
    return <BrandFallback className={className} alt={alt} />;
  }

  if (failed) {
    return <BrandFallback className={className} alt={alt} />;
  }

  if (isVideoSrc(src)) {
    // Videy/mp4 thumbs removed from site — never open CDN video for grid/related cards.
    return <BrandFallback className={className} alt={alt} />;
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
