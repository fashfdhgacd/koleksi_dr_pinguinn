import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Fallback resmi saat poster asli tidak ada / gagal load */
export const BRAND_POSTER = "/brand-poster.jpg";

function isVideoSrc(src: string): boolean {
  return /\.(mp4|mov|webm)(\?|$)/i.test(src) || /cdn\.videy\.co\//i.test(src);
}

/** Logo DR. PINGUIN — dipakai SEMUA slot tanpa gambar. */
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

/**
 * Prioritas: poster asli → kalau kosong/gagal → logo brand DR. PINGUIN.
 */
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

  // Tidak ada src ATAU gagal load → logo brand (wajib seragam)
  if (!src || failed || src === BRAND_POSTER) {
    return <BrandFallback className={className} alt={alt} />;
  }

  if (isVideoSrc(src)) {
    return (
      <video
        src={src}
        muted
        playsInline
        preload="metadata"
        className={cn("media-thumb size-full object-cover bg-surface-2", className)}
        onError={() => setFailed(true)}
        onLoadedData={() => setLoaded(true)}
        aria-label={alt}
      />
    );
  }

  return (
    <div className={cn("relative size-full overflow-hidden bg-surface-2", className)}>
      {!loaded ? (
        <img
          src={BRAND_POSTER}
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover opacity-60"
        />
      ) : null}
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        className={cn(
          "media-thumb relative size-full object-cover transition-opacity duration-150",
          loaded ? "opacity-100" : "opacity-0",
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
    </div>
  );
}
