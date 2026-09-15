import { useState } from "react";
import { cn } from "@/lib/utils";

function isVideoSrc(src: string): boolean {
  return /\.(mp4|mov|webm)(\?|$)/i.test(src) || /cdn\.videy\.co\//i.test(src);
}

/** Branded placeholder — no external dependency */
function Placeholder({ alt, className }: { alt: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black text-zinc-600",
        className,
      )}
      role="img"
      aria-label={alt || "Thumbnail"}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-10 opacity-40"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"
        />
      </svg>
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
        preload={eager ? "metadata" : "metadata"}
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
    />
  );
}
