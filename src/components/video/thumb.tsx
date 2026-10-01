import { useEffect, useMemo, useState } from "react";
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

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function labelOf(title: string, id: string): string {
  const code = String(title).match(/\b([A-Z]{2,8})[-_ ]?(\d{3,5})\b/i);
  if (code) return `${code[1].toUpperCase()}-${code[2]}`;
  const words = String(title || id)
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 3);
  return (words.join(" ") || id).slice(0, 22);
}

/** Poster lokal dari id+judul. Tidak butuh request, tidak bisa hilang. */
export function posterFromVideo(id: string, title: string): string {
  const h = hash(`${id}|${title}`);
  const hue = h % 360;
  const hue2 = (hue + 38) % 360;
  const text = labelOf(title, id)
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 42% 22%)"/><stop offset="1" stop-color="hsl(${hue2} 48% 12%)"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><circle cx="520" cy="70" r="90" fill="hsl(${hue} 50% 32%)" opacity="0.35"/><text x="32" y="196" fill="#f4f4f5" font-family="Arial,sans-serif" font-size="36" font-weight="700">${text}</text><text x="32" y="232" fill="#a1a1aa" font-family="Arial,sans-serif" font-size="16">${id.slice(0, 16)}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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
  onUnavailable?: () => void;
}) {
  const stuck = useMemo(() => posterFromVideo(alt, alt), [alt]);
  const dmm = dmmCoverFromTitle(alt);
  const remote = src && src !== BRAND_POSTER && !isVideoSrc(src) ? src : dmm;
  const [current, setCurrent] = useState(remote);
  const [hideRemote, setHideRemote] = useState(!remote);
  const warm = isPosterWarm(current);

  useEffect(() => {
    setCurrent(remote);
    setHideRemote(!remote);
  }, [remote]);

  return (
    <div className="relative size-full overflow-hidden bg-zinc-900">
      <img src={stuck} alt="" aria-hidden className="absolute inset-0 size-full object-cover" decoding="async" />
      {hideRemote ? null : (
        <img
          src={current}
          alt={alt}
          loading={eager || warm ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={eager ? "high" : "low"}
          referrerPolicy="no-referrer"
          className={cn("media-thumb relative size-full object-cover", className)}
          onError={() => {
            if (dmm && current !== dmm) {
              setCurrent(dmm);
              return;
            }
            setHideRemote(true);
          }}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth <= 2 && img.naturalHeight <= 2) {
              if (dmm && current !== dmm) {
                setCurrent(dmm);
                return;
              }
              setHideRemote(true);
              return;
            }
            markPosterWarm(current);
          }}
        />
      )}
    </div>
  );
}
