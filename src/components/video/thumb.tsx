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

/** Hanya kode bertanda hubung (IPZZ-567). Hindari false match "HD 1080". */
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
  const [retried, setRetried] = useState(false);
  const [triedDmm, setTriedDmm] = useState(!dmm || initial === dmm);
  const [currentSrc, setCurrentSrc] = useState(initial);
  const brandOrEmpty =
    !currentSrc || currentSrc === BRAND_POSTER || /brand-poster/i.test(currentSrc) || isVideoSrc(currentSrc);

  useEffect(() => {
    const next = src && src !== BRAND_POSTER ? src : dmm;
    setFailed(false);
    setRetried(false);
    setTriedDmm(!dmm || next === dmm);
    setCurrentSrc(next);
  }, [src, dmm]);

  useEffect(() => {
    if (!(brandOrEmpty || failed)) return;
    onUnavailable?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandOrEmpty, failed, src]);

  if (failed || brandOrEmpty) {
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
          if (!retried && currentSrc && !/r=1/.test(currentSrc) && !/pics\.dmm\.co\.jp/.test(currentSrc)) {
            setRetried(true);
            setCurrentSrc(withRetryParam(currentSrc));
            return;
          }
          if (!triedDmm && dmm && currentSrc !== dmm) {
            setTriedDmm(true);
            setRetried(false);
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
          }
        }}
      />
    </div>
  );
}
