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
      <img
        src="/logo.svg"
        alt=""
        className={cn("size-full object-cover bg-surface-2", className)}
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
