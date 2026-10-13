import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoDetail } from "@/lib/catalog/types";

/**
 * Videy player: the cdn mp4 plays straight from Videy in a native <video> (no crossorigin, so
 * nothing passes through our Worker), with one ExoClick VAST pre-roll before it.
 *
 * Pre-roll: the VAST tag (wrappers followed, max 4 levels) gives an mp4 creative that plays in
 * the same <video>. Skip shows after the ad's skipoffset (5 s when missing). No ad, a broken ad
 * or no answer within AD_TIMEOUT_MS: the video starts right away.
 */
const VAST_TAG = "https://s.magsrv.com/v1/vast.php?idz=6054340";
const AD_TIMEOUT_MS = 4000;
const SKIP_DEFAULT_S = 5;
const MAX_WRAPPERS = 4;

type Ad = {
  media: string;
  clickThrough: string;
  clickTracking: string[];
  impressions: string[];
  tracking: Record<string, string[]>;
  skipAfter: number;
};

function videyFileOf(item: VideoDetail): string {
  const urls = [item.video_url, ...item.qualities.map((q) => q.url)].filter((u): u is string => Boolean(u));
  const direct = urls.find((u) => /^https:\/\/cdn\d*\.videy\.co\/[A-Za-z0-9]+\.(mp4|mov)$/i.test(u));
  if (direct) return direct.replace(/^https:\/\/cdn\d*\./i, "https://cdn.");
  return `https://cdn.videy.co/${encodeURIComponent(item.id)}.mp4`;
}

function texts(root: Element | Document, tag: string): string[] {
  return Array.from(root.getElementsByTagName(tag))
    .map((n) => (n.textContent || "").trim())
    .filter(Boolean);
}

function seconds(v: string | null | undefined): number | null {
  const m = String(v || "").trim().match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function ping(urls: string[] | undefined): void {
  for (const u of urls || []) {
    if (!/^https?:\/\//i.test(u)) continue;
    try {
      const img = new Image();
      img.src = u;
    } catch {
      /* tracking is best effort */
    }
  }
}

async function loadAd(signal: AbortSignal): Promise<Ad | null> {
  let url = VAST_TAG;
  const impressions: string[] = [];
  const tracking: Record<string, string[]> = {};
  const clickTracking: string[] = [];
  for (let depth = 0; depth <= MAX_WRAPPERS; depth++) {
    const res = await fetch(url, { signal, credentials: "include" });
    if (!res.ok) return null;
    const doc = new DOMParser().parseFromString(await res.text(), "text/xml");
    const ad = doc.getElementsByTagName("Ad")[0];
    if (!ad) return null;
    impressions.push(...texts(ad, "Impression"));
    clickTracking.push(...texts(ad, "ClickTracking"));
    for (const t of Array.from(ad.getElementsByTagName("Tracking"))) {
      const ev = t.getAttribute("event") || "";
      const u = (t.textContent || "").trim();
      if (!ev || !u) continue;
      if (!tracking[ev]) tracking[ev] = [];
      tracking[ev].push(u);
    }
    const wrapper = ad.getElementsByTagName("Wrapper")[0];
    if (wrapper) {
      const next = texts(wrapper, "VASTAdTagURI")[0];
      if (!next) return null;
      url = next;
      continue;
    }
    const linear = ad.getElementsByTagName("Linear")[0];
    if (!linear) return null;
    const media = Array.from(linear.getElementsByTagName("MediaFile"))
      .filter((m) => /mp4/i.test(m.getAttribute("type") || ""))
      .map((m) => (m.textContent || "").trim())
      .find((u) => /^https:\/\//i.test(u));
    if (!media) return null;
    return {
      media,
      clickThrough: texts(linear, "ClickThrough")[0] || "",
      clickTracking,
      impressions,
      tracking,
      skipAfter: seconds(linear.getAttribute("skipoffset")) ?? SKIP_DEFAULT_S,
    };
  }
  return null;
}

type Phase = "idle" | "loading" | "ad" | "main";

export function VideyPlayer({ item }: { item: VideoDetail }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const adRef = useRef<Ad | null>(null);
  const firedRef = useRef<Set<string>>(new Set());
  const [phase, setPhase] = useState<Phase>("idle");
  const [left, setLeft] = useState(SKIP_DEFAULT_S);
  const file = videyFileOf(item);
  const poster = item.thumbnail || undefined;

  const fire = useCallback((ev: string) => {
    const ad = adRef.current;
    if (!ad || firedRef.current.has(ev)) return;
    firedRef.current.add(ev);
    ping(ad.tracking[ev]);
  }, []);

  const playMain = useCallback(() => {
    adRef.current = null;
    setPhase("main");
    const v = videoRef.current;
    if (!v) return;
    v.src = file;
    v.controls = true;
    void v.play().catch(() => undefined);
  }, [file]);

  // New video (SPA navigation): back to the poster.
  useEffect(() => {
    adRef.current = null;
    firedRef.current = new Set();
    setPhase("idle");
  }, [item.id]);

  const start = useCallback(() => {
    if (phase !== "idle") return;
    setPhase("loading");
    const v = videoRef.current;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), AD_TIMEOUT_MS);
    void loadAd(ctrl.signal)
      .catch(() => null)
      .then((ad) => {
        window.clearTimeout(timer);
        const el = videoRef.current;
        if (!ad || !el) return playMain();
        adRef.current = ad;
        firedRef.current = new Set();
        setLeft(Math.ceil(ad.skipAfter));
        setPhase("ad");
        el.controls = false;
        el.src = ad.media;
        el.play().catch(() => playMain());
      });
  }, [phase, playMain]);

  // Ad events: impression on first frame, quartiles, end/error -> main video.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || phase !== "ad") return;
    const onPlaying = () => {
      const ad = adRef.current;
      if (ad && !firedRef.current.has("impression")) {
        firedRef.current.add("impression");
        ping(ad.impressions);
      }
      fire("creativeView");
      fire("start");
    };
    const onTime = () => {
      const ad = adRef.current;
      if (!ad) return;
      if (!firedRef.current.has("impression")) onPlaying();
      const d = v.duration || 0;
      const t = v.currentTime || 0;
      setLeft(Math.max(0, Math.ceil(ad.skipAfter - t)));
      if (d > 0) {
        if (t >= d * 0.25) fire("firstQuartile");
        if (t >= d * 0.5) fire("midpoint");
        if (t >= d * 0.75) fire("thirdQuartile");
      }
    };
    const onEnded = () => {
      fire("complete");
      playMain();
    };
    const onError = () => playMain();
    // An ad that stalls for 8 s is dropped.
    let stall = window.setTimeout(onError, 8000);
    const onProgress = () => {
      window.clearTimeout(stall);
      stall = window.setTimeout(onError, 8000);
    };
    v.addEventListener("playing", onPlaying);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("timeupdate", onProgress);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);
    return () => {
      window.clearTimeout(stall);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("timeupdate", onProgress);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
    };
  }, [phase, fire, playMain]);

  const skip = () => {
    fire("skip");
    playMain();
  };

  const openAd = () => {
    const ad = adRef.current;
    if (!ad?.clickThrough) return;
    ping(ad.clickTracking);
    window.open(ad.clickThrough, "_blank", "noopener");
  };

  return (
    <div className="relative aspect-video max-h-[min(70vh,720px)] w-full overflow-hidden bg-black sm:mx-auto sm:rounded-xl">
      <video
        ref={videoRef}
        className="size-full bg-black object-contain"
        playsInline
        preload="none"
        poster={poster}
        controls={phase === "main"}
      />
      {phase === "idle" || phase === "loading" ? (
        <button
          type="button"
          onClick={start}
          aria-label={`Putar ${item.title}`}
          className="absolute inset-0 flex items-center justify-center bg-black/30"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground sm:size-16">
            {phase === "loading" ? (
              <span className="size-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <svg viewBox="0 0 24 24" className="ml-0.5 size-6 fill-current" aria-hidden="true">
                <polygon points="6 3 20 12 6 21 6 3" />
              </svg>
            )}
          </span>
        </button>
      ) : null}
      {phase === "ad" ? (
        <>
          <button type="button" onClick={openAd} className="absolute inset-0" aria-label="Iklan" />
          <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-[3px] bg-[#ecb43c] px-2 py-0.5 text-xs font-semibold text-[#16130e]">
            Iklan
          </span>
          <button
            type="button"
            onClick={skip}
            disabled={left > 0}
            className="absolute bottom-4 right-0 border border-r-0 border-white/30 bg-black/75 px-3.5 py-2 text-[13px] text-foreground disabled:text-muted"
          >
            {left > 0 ? `Lewati dalam ${left}` : "Lewati iklan"}
          </button>
        </>
      ) : null}
    </div>
  );
}
