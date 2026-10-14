import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { isPosterWarm, markPosterWarm } from "@/lib/poster-warm";

export const BRAND_POSTER = "/brand-poster-v2.jpg";
// 6x5 pixel-art penguin card shown (uncropped) when a video has no usable thumbnail.
export const FALLBACK_POSTER = "/brand-poster-6x5.jpg";

const FALLBACK_CLASS = "media-thumb size-full object-contain bg-[#0e0d12]";

function isVideoSrc(src: string): boolean {
  if (!src || typeof src !== "string") return false;
  return /\.(mp4|mov|webm)(\?|$)/i.test(src) || /cdn\.videy\.co\//i.test(src);
}

function isPosterSrc(src: string): boolean {
  return src === BRAND_POSTER || src === FALLBACK_POSTER;
}

function dmmCoverFromTitle(title = ""): string {
  const m = String(title).match(/\b([A-Z]{2,8})-(\d{3,5})\b/i);
  if (!m) return "";
  const code = `${m[1].toLowerCase()}${String(Number(m[2])).padStart(5, "0")}`;
  return `https://pics.dmm.co.jp/digital/video/${code}/${code}pl.jpg`;
}

export function VideoThumb({
  src,
  alt,
  videoId = "",
  eager = false,
  className,
  onUnavailable,
}: {
  src: string;
  alt: string;
  videoId?: string;
  eager?: boolean;
  className?: string;
  onUnavailable?: () => void;
}) {
  const srcStr = typeof src === "string" ? src : "";
  const dmm = dmmCoverFromTitle(alt);
  const real = srcStr && !isPosterSrc(srcStr) && !isVideoSrc(srcStr) && !srcStr.startsWith("data:") ? srcStr : "";
  // No .jpg suffix: old /thumb/{id}.jpg responses are cached as the brand penguin (immutable).
  // Our own static files (e.g. /videy-thumbs/{id}.jpg) are used as they are.
  const local = videoId && real && /^https?:\/\//i.test(real) ? `/thumb/${videoId}` : "";
  const first = local || real || dmm || FALLBACK_POSTER;
  const [current, setCurrent] = useState(first);
  const [step, setStep] = useState(0);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const warm = isPosterWarm(current);

  useEffect(() => {
    setCurrent(first);
    setStep(0);
  }, [first]);

  useEffect(() => {
    if (step > 3) onUnavailable?.();
  }, [step, onUnavailable]);

  const handleError = useCallback(() => {
    if (step === 0 && real && current !== real) {
      setStep(1);
      setCurrent(real);
      return;
    }
    if (step < 2 && dmm && current !== dmm) {
      setStep(2);
      setCurrent(dmm);
      return;
    }
    if (!isPosterSrc(current)) {
      setStep(3);
      setCurrent(FALLBACK_POSTER);
      return;
    }
    setStep(4);
  }, [step, real, dmm, current]);

  // An image that failed before hydration never reaches React's onError, so mobile
  // browsers keep showing the broken-image icon. Check once mounted and on every src change.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) handleError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!current || step > 3) {
    return (
      <img
        src={FALLBACK_POSTER}
        alt={alt}
        width={320}
        height={180}
        loading="lazy"
        decoding="async"
        className={cn(FALLBACK_CLASS, className)}
      />
    );
  }

  const poster = isPosterSrc(current);

  return (
    <img
      ref={imgRef}
      src={poster ? FALLBACK_POSTER : current}
      alt={alt}
      width={320}
      height={180}
      loading={eager || warm ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "low"}
      className={cn(poster ? FALLBACK_CLASS : "media-thumb size-full object-cover", className)}
      onError={handleError}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalWidth > 2) markPosterWarm(current);
        else if (!isPosterSrc(current)) {
          setStep(3);
          setCurrent(FALLBACK_POSTER);
        } else {
          setStep(4);
        }
      }}
    />
  );
}
