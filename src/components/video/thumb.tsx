import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const BRAND_POSTER = "/brand-poster.jpg";

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

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || src === BRAND_POSTER) {
    return <BrandFallback className={className} alt={alt} />;
  }

  if (failed) {
    return <BrandFallback className={className} alt={alt} />;
  }

  if (isVideoSrc(src)) {
    return (
      <video
        src={src}
        muted
        playsInline
        preload="metadata"
        className={cn("media-thumb size-full object-cover bg-zinc-900", className)}
        onError={() => setFailed(true)}
        aria-label={alt}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "low"}
      referrerPolicy="no-referrer"
      className={cn("media-thumb size-full object-cover bg-zinc-900", className)}
      onError={() => setFailed(true)}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalWidth <= 2 && img.naturalHeight <= 2) setFailed(true);
      }}
    />
  );
}
