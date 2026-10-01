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
  const local = videoId && (real || dmm) ? `/thumb/${videoId}.jpg` : "";
  const [current, setCurrent] = useState(local || real || dmm);
  const [failed, setFailed] = useState(!local && !real && !dmm);
  const warm = isPosterWarm(current);

  useEffect(() => {
    setCurrent(local || real || dmm);
    setFailed(!local && !real && !dmm);
  }, [local, real, dmm]);

  if (failed || !current) {
    return <div className="size-full bg-zinc-900" aria-label={alt} />;
  }

  return (
    <img
      src={current}
      alt={alt}
      loading={eager || warm ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "low"}
      className={cn("media-thumb size-full object-cover", className)}
      onError={() => {
        if (local && current === local && real) {
          setCurrent(real);
          return;
        }
        if (dmm && current !== dmm) {
          setCurrent(dmm);
          return;
        }
        setFailed(true);
      }}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalWidth <= 2 && img.naturalHeight <= 2) {
          setFailed(true);
          return;
        }
        markPosterWarm(current);
      }}
    />
  );
}
