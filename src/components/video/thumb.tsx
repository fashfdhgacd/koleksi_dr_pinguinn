import { useState } from "react";
import { cn } from "@/lib/utils";

function isVideoSrc(src: string): boolean {
  return /\.(mp4|mov|webm)(\?|$)/i.test(src) || /cdn\.videy\.co\//i.test(src);
}

/** Hash string → index warna supaya tiap judul beda gradasi */
function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

/**
 * Placeholder kaya — jangan pernah kotak hitam polos.
 * Gradient berwarna + ikon play + cuplikan judul.
 */
function Placeholder({
  alt,
  className,
}: {
  alt: string;
  className?: string;
}) {
  const title = (alt || "Video").trim();
  const hue = hashHue(title);
  const short =
    title.length > 48 ? `${title.slice(0, 46).trimEnd()}…` : title;

  return (
    <div
      className={cn(
        "relative flex size-full flex-col items-center justify-center overflow-hidden px-3 text-center",
        className,
      )}
      style={{
        background: `linear-gradient(145deg,
          hsl(${hue} 45% 18%) 0%,
          hsl(${(hue + 40) % 360} 40% 12%) 50%,
          hsl(${(hue + 80) % 360} 35% 8%) 100%)`,
      }}
      role="img"
      aria-label={title}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full opacity-30 blur-2xl"
        style={{ background: `hsl(${hue} 70% 45%)` }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-10 -left-6 size-28 rounded-full opacity-20 blur-2xl"
        style={{ background: `hsl(${(hue + 60) % 360} 65% 40%)` }}
        aria-hidden
      />

      <div className="relative z-[1] mb-2 flex size-12 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
        <svg
          viewBox="0 0 24 24"
          className="ml-0.5 size-5 text-white/90"
          fill="currentColor"
          aria-hidden
        >
          <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86a1 1 0 00-1.5.86z" />
        </svg>
      </div>

      <p className="relative z-[1] line-clamp-2 max-w-[90%] text-[11px] font-medium leading-snug text-white/85 sm:text-xs">
        {short}
      </p>
      <p className="relative z-[1] mt-1 text-[10px] uppercase tracking-wider text-white/40">
        Dr. Pinguin
      </p>
    </div>
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

  if (!src || failed) {
    return <Placeholder alt={alt} className={className} />;
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
      className={cn("media-thumb size-full object-cover", className)}
      onError={() => setFailed(true)}
      onLoad={(e) => {
        // GIF 1x1 dari API gagal → ganti kartu kaya
        const img = e.currentTarget;
        if (img.naturalWidth <= 2 && img.naturalHeight <= 2) {
          setFailed(true);
        }
      }}
    />
  );
}
