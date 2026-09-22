import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const BRAND_POSTER = "/brand-poster.jpg";

function isVideoSrc(src: string): boolean {
  return /\.(mp4|mov|webm)(\?|$)/i.test(src) || /cdn\.videy\.co\//i.test(src);
}

function withRetryParam(src: string): string {
  const join = src.includes("?") ? "&" : "?";
  return `${src}${join}r=1`;
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
  onUnavailable?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [retried, setRetried] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);
  const brandOrEmpty =
    !src || src === BRAND_POSTER || /brand-poster/i.test(src) || isVideoSrc(src);

  useEffect(() => {
    setFailed(false);
    setRetried(false);
    setCurrentSrc(src);
  }, [src]);

  useEffect(() => {
    if (!(brandOrEmpty || failed)) return;
    onUnavailable?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandOrEmpty, failed, src]);

  if (brandOrEmpty || failed) {
    return <BrandFallback className={className} alt={alt} />;
  }

  return (
    <div className="relative size-full overflow-hidden bg-zinc-900">
      <img
        src={currentSrc}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "low"}
        referrerPolicy="no-referrer"
        className={cn("media-thumb relative size-full object-cover", className)}
        onError={() => {
          if (!retried && src && !/r=1/.test(src)) {
            setRetried(true);
            setCurrentSrc(withRetryParam(src));
            return;
          }
          setFailed(true);
        }}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth <= 2 && img.naturalHeight <= 2) setFailed(true);
        }}
      />
    </div>
  );
}
