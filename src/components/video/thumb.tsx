import { useState } from "react";
import { cn } from "@/lib/utils";

function isVideoSrc(src: string): boolean {
  return /\.(mp4|mov|webm)(\?|$)/i.test(src) || /cdn\.videy\.co\//i.test(src);
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
    return (
      <img
        src="/logo.svg"
        alt=""
        className={cn("size-full object-cover bg-surface-2", className)}
      />
    );
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
