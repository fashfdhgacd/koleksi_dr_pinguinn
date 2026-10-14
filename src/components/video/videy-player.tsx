import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoDetail } from "@/lib/catalog/types";

/**
 * Videy player: the cdn mp4 plays straight from Videy in a native <video> (no crossorigin, so
 * nothing passes through our Worker), with one ExoClick VAST pre-roll before it.
 *
 * Pre-roll: the VAST tag (wrappers followed, max 4 levels) gives an mp4 creative that plays in
 * the same <video>. Skip shows after the ad's skipoffset (HH:MM:SS(.mmm) or a percent of the ad,
 * 10 s when missing); skipping earlier is never allowed. No ad, a broken ad
 * or no answer within AD_TIMEOUT_MS: the video starts right away. The VAST request starts when the
 * player mounts, so the tap only waits for whatever is left of it. An ad the browser refuses to
 * play with sound plays muted with a sound button. Ad states are counted through /api/ad-log.
 *
 * Fullscreen (own button on the wrapper, or the native video button): a landscape video locks the
 * screen to landscape where the browser allows it, and unlocks on exit.
 */
const VAST_TAG = "https://s.magsrv.com/v1/vast.php?idz=6054340";
const AD_TIMEOUT_MS = 7000;
const SKIP_DEFAULT_S = 10;
const MAX_WRAPPERS = 4;

type Ad = {
  media: string;
  clickThrough: string;
  clickTracking: string[];
  impressions: string[];
  tracking: Record<string, string[]>;
  /** VAST "progress" events (ExoClick counts a View from its progress pixel at 00:00:10). */
  progress: { at: number | null; pct: number | null; url: string }[];
  errors: string[];
  /** Seconds before skip is allowed. */
  skipAfter: number;
  /** Set when skipoffset was a percent: recomputed from the real ad duration. */
  skipPercent: number | null;
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

/** VAST skipoffset: "HH:MM:SS(.mmm)" or "NN%". */
function skipOffset(v: string | null | undefined): { s: number | null; pct: number | null } {
  const raw = String(v || "").trim();
  const pct = raw.match(/^(\d+(?:\.\d+)?)%$/);
  if (pct) return { s: null, pct: Math.min(100, Number(pct[1])) };
  return { s: seconds(raw), pct: null };
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

type AdLogEvent = "vast_empty" | "vast_timeout" | "vast_error" | "ad_play" | "ad_muted" | "ad_error" | "ad_skip" | "ad_complete";

/** Daily counter for an ad state (no personal data), once per event per page view. */
function adLog(id: string, event: AdLogEvent, sent: Set<string>): void {
  if (sent.has(event)) return;
  sent.add(event);
  try {
    const body = JSON.stringify({ id, event });
    if (!navigator.sendBeacon?.("/api/ad-log", body)) {
      void fetch("/api/ad-log", { method: "POST", body, keepalive: true }).catch(() => undefined);
    }
  } catch {
    /* best effort */
  }
}

type AdResult = { ad: Ad | null; reason: "ok" | "empty" | "timeout" | "error" };

async function fetchAd(): Promise<AdResult> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), AD_TIMEOUT_MS);
  try {
    const ad = await loadAd(ctrl.signal);
    return { ad, reason: ad ? "ok" : "empty" };
  } catch {
    return { ad: null, reason: ctrl.signal.aborted ? "timeout" : "error" };
  } finally {
    window.clearTimeout(timer);
  }
}

type OrientationLock = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };

function fullscreenEl(): Element | null {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return d.fullscreenElement || d.webkitFullscreenElement || null;
}

function skipOf(linear: Element): { skipAfter: number; skipPercent: number | null } {
  const off = skipOffset(linear.getAttribute("skipoffset"));
  if (off.pct != null) {
    const dur = seconds(texts(linear, "Duration")[0]);
    return { skipAfter: dur != null ? (dur * off.pct) / 100 : SKIP_DEFAULT_S, skipPercent: off.pct };
  }
  return { skipAfter: off.s ?? SKIP_DEFAULT_S, skipPercent: null };
}

async function loadAd(signal: AbortSignal): Promise<Ad | null> {
  let url = VAST_TAG;
  const impressions: string[] = [];
  const tracking: Record<string, string[]> = {};
  const clickTracking: string[] = [];
  const progress: Ad["progress"] = [];
  const errors: string[] = [];
  for (let depth = 0; depth <= MAX_WRAPPERS; depth++) {
    // Fresh answer for every video: a cache-buster on the first (our) request and no HTTP cache.
    const reqUrl = depth === 0 ? `${url}${url.includes("?") ? "&" : "?"}cb=${Date.now()}${Math.floor(Math.random() * 1e6)}` : url;
    const res = await fetch(reqUrl, { signal, credentials: "include", cache: "no-store" });
    if (!res.ok) return null;
    const doc = new DOMParser().parseFromString(await res.text(), "text/xml");
    const ad = doc.getElementsByTagName("Ad")[0];
    if (!ad) return null;
    impressions.push(...texts(ad, "Impression"));
    clickTracking.push(...texts(ad, "ClickTracking"));
    errors.push(...texts(ad, "Error"));
    for (const t of Array.from(ad.getElementsByTagName("Tracking"))) {
      const ev = t.getAttribute("event") || "";
      const u = (t.textContent || "").trim();
      if (!ev || !u) continue;
      if (ev === "progress") {
        const off = skipOffset(t.getAttribute("offset"));
        if (off.s != null || off.pct != null) progress.push({ at: off.s, pct: off.pct, url: u });
        continue;
      }
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
      progress,
      errors,
      ...skipOf(linear),
    };
  }
  return null;
}

type Phase = "idle" | "loading" | "ad" | "main";

export function VideyPlayer({ item }: { item: VideoDetail }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const adReq = useRef<Promise<AdResult> | null>(null);
  const logged = useRef<Set<string>>(new Set());
  const [muted, setMuted] = useState(false);
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
    v.muted = false;
    setMuted(false);
    v.src = file;
    v.controls = true;
    void v.play().catch(() => undefined);
  }, [file]);

  // New video (SPA navigation): back to the poster.
  // The VAST request starts on mount, so the tap does not wait for the whole wrapper chain.
  // A new Videy id (also client-side navigation, e.g. Tonton juga) resets everything: the old
  // video or ad is stopped and unloaded, and a new VAST request is made for this video.
  useEffect(() => {
    adRef.current = null;
    firedRef.current = new Set();
    logged.current = new Set();
    setPhase("idle");
    setMuted(false);
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.controls = false;
      v.muted = false;
      v.load();
    }
    adReq.current = fetchAd();
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
    // A new source (ad -> video) while fullscreen: check the new size again.
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

  const toggleFullscreen = useCallback(() => {
    const wrap = wrapRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    const d = document as Document & { webkitExitFullscreen?: () => void };
    if (fullscreenEl()) {
      if (d.exitFullscreen) void d.exitFullscreen().catch(() => undefined);
      else d.webkitExitFullscreen?.();
      return;
    }
    if (wrap?.requestFullscreen) void wrap.requestFullscreen().catch(() => undefined);
    else if (wrap?.webkitRequestFullscreen) wrap.webkitRequestFullscreen();
    else v?.webkitEnterFullscreen?.();
  }, []);

  const start = useCallback(() => {
    if (phase !== "idle") return;
    setPhase("loading");
    const el0 = videoRef.current;
    // Inside the tap: unlock the element for playback with sound (mobile autoplay rules).
    if (el0) {
      el0.muted = false;
      void el0.play().catch(() => undefined);
    }
    const req = adReq.current || fetchAd();
    adReq.current = null;
    void req.then(({ ad, reason }) => {
      const el = videoRef.current;
      if (!ad || !el) {
        adLog(item.id, reason === "timeout" ? "vast_timeout" : reason === "error" ? "vast_error" : "vast_empty", logged.current);
        return playMain();
      }
      adRef.current = ad;
      firedRef.current = new Set();
      setLeft(Math.ceil(ad.skipAfter));
      setPhase("ad");
      el.controls = false;
      el.muted = false;
      el.src = ad.media;
      el.play()
        .then(() => adLog(item.id, "ad_play", logged.current))
        .catch(() => {
          // Sound not allowed here: play the ad muted with a sound button.
          el.muted = true;
          setMuted(true);
          return el.play().then(
            () => {
              adLog(item.id, "ad_muted", logged.current);
              adLog(item.id, "ad_play", logged.current);
            },
            () => {
              adLog(item.id, "ad_error", logged.current);
              playMain();
            },
          );
        });
    });
  }, [phase, playMain, item.id]);

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
      if (ad.skipPercent != null && d > 0 && Number.isFinite(d)) ad.skipAfter = (d * ad.skipPercent) / 100;
      setLeft(Math.max(0, Math.ceil(ad.skipAfter - t)));
      if (d > 0) {
        if (t >= d * 0.25) fire("firstQuartile");
        if (t >= d * 0.5) fire("midpoint");
        if (t >= d * 0.75) fire("thirdQuartile");
      }
      ad.progress.forEach((p, i) => {
        const at = p.at != null ? p.at : d > 0 && Number.isFinite(d) ? (d * (p.pct || 0)) / 100 : null;
        const key = `progress:${i}`;
        if (at == null || t < at || firedRef.current.has(key)) return;
        firedRef.current.add(key);
        ping([p.url]);
      });
    };
    const onEnded = () => {
      fire("complete");
      adLog(item.id, "ad_complete", logged.current);
      playMain();
    };
    const onError = () => {
      const ad = adRef.current;
      if (ad && !firedRef.current.has("error")) {
        firedRef.current.add("error");
        ping(ad.errors.map((u) => u.replace(/\[ERRORCODE\]/g, "405")));
      }
      adLog(item.id, "ad_error", logged.current);
      playMain();
    };
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
  }, [phase, fire, playMain, item.id]);

  const skip = () => {
    const ad = adRef.current;
    const v = videoRef.current;
    // Never before the VAST skipoffset.
    if (ad && v && (v.currentTime || 0) < ad.skipAfter) return;
    fire("skip");
    adLog(item.id, "ad_skip", logged.current);
    playMain();
  };

  const openAd = () => {
    const ad = adRef.current;
    if (!ad?.clickThrough) return;
    ping(ad.clickTracking);
    window.open(ad.clickThrough, "_blank", "noopener");
  };

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
          <div className="absolute right-2.5 top-2.5 flex gap-1.5">
            {muted ? (
              <button
                type="button"
                aria-label="Suara"
                onClick={() => {
                  const v = videoRef.current;
                  if (v) v.muted = false;
                  setMuted(false);
                }}
                className="flex size-8 items-center justify-center rounded-full bg-black/70 text-white"
              >
                <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-2" aria-hidden="true">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" className="fill-current" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Layar penuh"
              onClick={toggleFullscreen}
              className="flex size-8 items-center justify-center rounded-full bg-black/70 text-white"
            >
              <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current stroke-2" aria-hidden="true">
                <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
              </svg>
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
