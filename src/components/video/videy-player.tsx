import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoDetail } from "@/lib/catalog/types";

/**
 * Videy player: the cdn mp4 plays straight from Videy in a native <video> (no crossorigin, so
 * nothing passes through our Worker). No pre-roll: a tap on the poster starts the video.
 *
 * Fullscreen (native video button): a landscape video locks the screen to landscape where the
 * browser allows it, and unlocks on exit.
 */

function videyFileOf(item: VideoDetail): string {
  const urls = [item.video_url, ...item.qualities.map((q) => q.url)].filter((u): u is string => Boolean(u));
  const direct = urls.find((u) => /^https:\/\/cdn\d*\.videy\.co\/[A-Za-z0-9]+\.(mp4|mov)$/i.test(u));
  if (direct) return direct.replace(/^https:\/\/cdn\d*\./i, "https://cdn.");
  return `https://cdn.videy.co/${encodeURIComponent(item.id)}.mp4`;
}

type OrientationLock = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };

function fullscreenEl(): Element | null {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return d.fullscreenElement || d.webkitFullscreenElement || null;
}

type Phase = "idle" | "main";

export function VideyPlayer({ item }: { item: VideoDetail }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const file = videyFileOf(item);
  const poster = item.thumbnail || undefined;

  // New video (SPA navigation, e.g. Tonton juga): the old video is stopped and unloaded,
  // back to the poster.
  useEffect(() => {
    setPhase("idle");
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.controls = false;
      v.muted = false;
      v.load();
    }
  }, [item.id]);

  // Landscape lock while fullscreen (wrapper or native video button), unlock on exit.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let locked = false;
    const orient = () => (typeof screen !== "undefined" ? (screen.orientation as OrientationLock | undefined) : undefined);
    const lock = () => {
      const o = orient();
      if (!o?.lock || locked) return;
      if (!(v.videoWidth > v.videoHeight)) return;
      locked = true;
      o.lock("landscape").catch(() => {
        locked = false;
      });
    };
    const unlock = () => {
      if (!locked) return;
      locked = false;
      try {
        orient()?.unlock?.();
      } catch {
        /* not supported */
      }
    };
    const onChange = () => {
      const el = fullscreenEl();
      if (el && (el === wrapRef.current || el === v || wrapRef.current?.contains(el))) {
        if (v.videoWidth) lock();
        else v.addEventListener("loadedmetadata", lock, { once: true });
      } else unlock();
    };
    // Metadata arriving while already fullscreen: check the size again.
    const onMeta = () => {
      if (!fullscreenEl()) return;
      if (v.videoWidth > v.videoHeight) lock();
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    v.addEventListener("webkitbeginfullscreen", lock);
    v.addEventListener("webkitendfullscreen", unlock);
    v.addEventListener("loadedmetadata", onMeta);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      v.removeEventListener("webkitbeginfullscreen", lock);
      v.removeEventListener("webkitendfullscreen", unlock);
      v.removeEventListener("loadedmetadata", onMeta);
      unlock();
    };
  }, []);

  const start = useCallback(() => {
    if (phase !== "idle") return;
    setPhase("main");
    const v = videoRef.current;
    if (!v) return;
    // Inside the tap, so mobile browsers allow playback with sound.
    v.muted = false;
    v.src = file;
    v.controls = true;
    void v.play().catch(() => undefined);
  }, [phase, file]);

  return (
    <div
      ref={wrapRef}
      className="relative aspect-video max-h-[min(70vh,720px)] w-full overflow-hidden bg-black sm:mx-auto sm:rounded-xl [&:fullscreen]:max-h-none [&:fullscreen]:rounded-none"
    >
      <video
        ref={videoRef}
        className="size-full bg-black object-contain"
        playsInline
        preload="none"
        poster={poster}
        controls={phase === "main"}
      />
      {phase === "idle" ? (
        <button
          type="button"
          onClick={start}
          aria-label={`Putar ${item.title}`}
          className="absolute inset-0 flex items-center justify-center bg-black/30"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground sm:size-16">
            <svg viewBox="0 0 24 24" className="ml-0.5 size-6 fill-current" aria-hidden="true">
              <polygon points="6 3 20 12 6 21 6 3" />
            </svg>
          </span>
        </button>
      ) : null}
    </div>
  );
}
