import { useState } from "react";
import { cn } from "@/lib/utils";

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
      <div
        className={cn(
          "flex size-full items-center justify-center bg-surface-2 text-sm tracking-wide text-muted",
          className,
        )}
        aria-hidden="true"
      >
        {alt.slice(0, 1).toUpperCase() || "L"}
      </div>
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
