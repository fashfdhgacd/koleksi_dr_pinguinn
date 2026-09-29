import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { isPosterWarm, markPosterWarm } from "@/lib/poster-warm";

export const BRAND_POSTER = "/brand-poster.jpg";

function isVideoSrc(src: string): boolean {
  return /\.(mp4|mov|webm)(\?|$)/i.test(src) || /cdn\.videy\.co\//i.test(src);
}

function dmmCoverFromTitle(title = ""): string {
  const m = String(title).match(/\b([A-Z]{2,8})-(\d{3,5})\b/i);
  if (!m) return "";
  const code = `${m[1].toLowerCase()}${String(Number(m[2])).padStart(5, "0")}`;
  return `https://pics.dmm.co.jp/digital/video/${code}/${code}pl.jpg`;
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
  const dmm = dmmCoverFromTitle(alt);
  const initial = src && src !== BRAND_POSTER ? src : dmm;
  const [failed, setFailed] = useState(false);
  const [triedDmm, setTriedDmm] = useState(!dmm || initial === dmm);
  const [currentSrc, setCurrentSrc] = useState(initial);
  const warm = isPosterWarm(currentSrc);
  const brandOrEmpty =
    !currentSrc || currentSrc === BRAND_POSTER || /brand-poster/i.test(currentSrc) || isVideoSrc(currentSrc);

  useEffect(() => {
    const next = src && src !== BRAND_POSTER ? src : dmm;
    setFailed(false);
    setTriedDmm(!dmm || next === dmm);
    setCurrentSrc(next);
  }, [src, dmm]);

  useEffect(() => {
    if (!(brandOrEmpty || failed)) return;
    onUnavailable?.();
  }, [brandOrEmpty, failed, src, onUnavailable]);

  if (failed || brandOrEmpty) {
    return <BrandFallback className={className} alt={alt} />;
  }

  return (
    <div className="relative size-full overflow-hidden bg-zinc-900">
      <img
        src={currentSrc}
        alt={alt}
        loading={eager || warm ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "low"}
        referrerPolicy="no-referrer"
        className={cn("media-thumb relative size-full object-cover", className)}
        onError={() => {
          if (!triedDmm && dmm && currentSrc !== dmm) {
            setTriedDmm(true);
            setCurrentSrc(dmm);
            return;
          }
          setFailed(true);
        }}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth <= 2 && img.naturalHeight <= 2) {
            if (!triedDmm && dmm && currentSrc !== dmm) {
              setTriedDmm(true);
              setCurrentSrc(dmm);
              return;
            }
            setFailed(true);
            return;
          }
          markPosterWarm(currentSrc);
        }}
      />
    </div>
  );
}
