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
  const dmm = dmmCoverFromTitle(alt);
  const real = src && src !== BRAND_POSTER && !isVideoSrc(src) && !src.startsWith("data:") ? src : "";
  const local = videoId && real ? `/thumb/${videoId}.jpg` : "";
  const first = local || real || dmm;
  const [current, setCurrent] = useState(first);
  const [step, setStep] = useState(0);
  const warm = isPosterWarm(current);

  useEffect(() => {
    setCurrent(first);
    setStep(0);
  }, [first]);

  useEffect(() => {
    if (step > 2) onUnavailable?.();
  }, [step, onUnavailable]);

  if (!current || step > 2) {
    return <div className="size-full bg-zinc-900" aria-label={alt} />;
  }

  return (
    <img
      src={current}
      alt={alt}
      width={320}
      height={180}
      loading={eager || warm ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "low"}
      className={cn("media-thumb size-full object-cover", className)}
      onError={() => {
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
        setStep(3);
      }}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalWidth > 2) markPosterWarm(current);
        else setStep(3);
      }}
    />
  );
}
