import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoDetail } from "@/lib/catalog/types";
import { sendPlayerLog } from "@/lib/player-log-client";
import { popTap } from "@/components/ts-videy-popunder";
import { PopTapLayer } from "@/components/tap-popunder";
import { loadVast, ping, prerollDue, VAST_TIMEOUT_MS, type VastAd } from "@/components/videy-preroll";

/**
 * Videy player: the cdn mp4 plays straight from Videy in a native <video> (no crossorigin, so
 * nothing passes through our Worker).
 *
 * Pre-roll (videy-preroll.ts, TrafficStars VAST spot 5210886): on about every 2nd Videy play the
 * play tap first fetches the VAST (3.5 s budget) and plays the ad mp4 in the same <video>, with our
 * own Skip button after 5 s (or the VAST skipoffset if shorter); only the small corner "Info" button opens ClickThrough (a tap on the video does nothing).
 * No fill, error, timeout or an ad that does not start within 4 s goes straight to the film.
 * Counters (player-log, once per video per session): pre_req / pre_fill / pre_done (played to the end)
 * / pre_skip (Skip tapped).
 *
 * Fullscreen (native video button): a landscape video locks the screen to landscape where the
 * browser allows it, and unlocks on exit.
 *
 * TrafficStars popunder (ts-videy-popunder.tsx): the poster overlay is our tap-catcher; its first tap
 * (within the shared per-video cap, card-popunder.ts) opens the direct link in a new tab; the next tap
 * plays. During playback a one-shot PopTapLayer re-arms when the cap allows a later pop.
 *
 * Kesehatan player (/pemilik): the same /api/player-log beacons as the other hosts, once per video
 * per session (src/lib/player-log-client.ts), host "Videy":
 *  start2  the poster tap
 *  fail2   the <video> reports an error before the first frame, or the visitor leaves 20-60 s after
 *          the tap without a first frame
 *  slow2   the first frame came only after 20 s, or the visitor stayed 60 s+ without one
 * Same 20 s / 60 s rule as the iframe hosts in player.tsx. An error after the video already played
 * (e.g. a network drop mid-video) is not counted as a failed start.
 */

/** Ms without a first frame before a play counts as slow (same as player.tsx SLOW_HINT_MS). */
const SLOW_MS = 20000;
/** Visitor stayed this long without a first frame: slow, not failed (player.tsx STAYED_MS). */
const STAYED_MS = 60000;

function videyFileOf(item: VideoDetail): string {
  const urls = [item.video_url, ...item.qualities.map((q) => q.url)].filter((u): u is string => Boolean(u));
  const direct = urls.find((u) => /^https:\/\/cdn\d*\.videy\.co\/[A-Za-z0-9]+\.(mp4|mov)$/i.test(u));
  if (direct) return direct.replace(/^https:\/\/cdn\d*\./i, "https://cdn.");
  // Videy mirror file (cdn2.aceimg.com/<id>.mp4): played exactly as stored.
  const mirror = urls.find((u) => /^https:\/\/cdn\d*\.aceimg\.com\/[A-Za-z0-9]+\.mp4$/i.test(u));
  if (mirror) return mirror;
  return `https://cdn.videy.co/${encodeURIComponent(item.id)}.mp4`;
}

type OrientationLock = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };

function fullscreenEl(): Element | null {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return d.fullscreenElement || d.webkitFullscreenElement || null;
}

type Phase = "idle" | "ad" | "main";

/** Our own Skip button appears after this many seconds (or the VAST skipoffset if shorter). */
const SKIP_AFTER_S = 5;
/** Film position saved to sessionStorage at most this often, so a reloaded tab resumes there. */
const RESUME_SAVE_MS = 5000;
const resumeKey = (id: string) => `kdp:videy-t:${id}`;

function readResume(id: string): number {
  try {
    const t = Number(sessionStorage.getItem(resumeKey(id)));
    return Number.isFinite(t) && t > 3 ? t : 0;
  } catch {
    return 0;
  }
}

/** The ad media must start playing within this long, else the film plays. */
const AD_START_MS = 4000;

export function VideyPlayer({ item }: { item: VideoDetail }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const file = videyFileOf(item);
  const poster = item.thumbnail || undefined;
  // This play's log state: tap time, first frame seen, already settled (slow2/fail2 sent).
  const track = useRef({ startedAt: 0, alive: false, settled: false });
  // Current pre-roll (null outside the ad phase); fired quartiles; a token so stale async work quits.
  const adRef = useRef<{ ad: VastAd; fired: Set<string>; token: number } | null>(null);
  const tokenRef = useRef(0);
  const [skipIn, setSkipIn] = useState<number | null>(null);

  const settle = useCallback(
    (event: "slow2" | "fail2") => {
      const t = track.current;
      if (!t.startedAt || t.settled) return;
      t.settled = true;
      sendPlayerLog(item.id, "Videy", event);
    },
    [item.id],
  );

  // New video (SPA navigation, e.g. Tonton juga): the old video is stopped and unloaded,
  // back to the poster.
  useEffect(() => {
    tokenRef.current += 1;
    adRef.current = null;
    setSkipIn(null);
    setPhase("idle");
    track.current = { startedAt: 0, alive: false, settled: false };
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

  // Kesehatan player: first frame / error before it / leaving without one (see the header).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onAlive = () => {
      const t = track.current;
      if (!t.startedAt || t.alive) return;
      t.alive = true;
      if (Date.now() - t.startedAt >= SLOW_MS) settle("slow2");
    };
    const onError = () => {
      const t = track.current;
      // Only this play's file (unloading on a video change also raises "error"), before any frame.
      if (!t.startedAt || t.alive || !v.error || !v.getAttribute("src")) return;
      settle("fail2");
    };
    const onLeave = () => {
      const t = track.current;
      if (!t.startedAt || t.alive || t.settled) return;
      const elapsed = Date.now() - t.startedAt;
      if (elapsed < SLOW_MS) return;
      settle(elapsed >= STAYED_MS ? "slow2" : "fail2");
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onLeave();
    };
    v.addEventListener("playing", onAlive);
    v.addEventListener("timeupdate", onAlive);
    v.addEventListener("error", onError);
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      v.removeEventListener("playing", onAlive);
      v.removeEventListener("timeupdate", onAlive);
      v.removeEventListener("error", onError);
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      onLeave(); // SPA navigation to another video
    };
  }, [item.id, settle]);

  /** Starts the film in the <video> (after the tap, or after / instead of the pre-roll). */
  const playFilm = useCallback(() => {
    tokenRef.current += 1;
    adRef.current = null;
    setSkipIn(null);
    track.current = { startedAt: Date.now(), alive: false, settled: false };
    sendPlayerLog(item.id, "Videy", "start2");
    setPhase("main");
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.src = file;
    v.controls = true;
    // Tab reloaded (e.g. Android discarded it while the ad tab was open): resume where it was.
    const resume = readResume(item.id);
    if (resume) {
      v.addEventListener(
        "loadedmetadata",
        () => {
          if (v.getAttribute("src") === file && resume < (v.duration || Infinity) - 3) v.currentTime = resume;
        },
        { once: true },
      );
    }
    void v.play().catch(() => undefined);
  }, [file, item.id]);

  // Film playing: remember the position (sessionStorage, at most every 5 s; client only).
  useEffect(() => {
    if (phase !== "main") return;
    const v = videoRef.current;
    if (!v) return;
    let last = 0;
    const save = () => {
      if (v.getAttribute("src") !== file || !(v.currentTime > 0)) return;
      const now = Date.now();
      if (now - last < RESUME_SAVE_MS) return;
      last = now;
      try {
        sessionStorage.setItem(resumeKey(item.id), String(Math.floor(v.currentTime)));
      } catch {
        /* ignore */
      }
    };
    const flush = () => {
      last = 0;
      save();
    };
    v.addEventListener("timeupdate", save);
    v.addEventListener("pause", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      v.removeEventListener("timeupdate", save);
      v.removeEventListener("pause", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [phase, file, item.id]);

  const endAd = useCallback(
    (how: "complete" | "skip" | "fail") => {
      const cur = adRef.current;
      if (!cur) return;
      if (how === "complete") {
        ping(cur.ad.events.complete);
        sendPlayerLog(item.id, "Videy", "pre_done");
      } else if (how === "skip") {
        ping(cur.ad.events.skip);
        sendPlayerLog(item.id, "Videy", "pre_skip");
      }
      else ping(cur.ad.error.map((u) => u.replace(/\[ERRORCODE\]/gi, "405")));
      playFilm();
    },
    [item.id, playFilm],
  );

  // Ad phase: quartile tracking, skip countdown, completion and errors.
  useEffect(() => {
    if (phase !== "ad") return;
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      const cur = adRef.current;
      if (!cur) return;
      const t = v.currentTime;
      const d = v.duration;
      const fire = (ev: string) => {
        if (cur.fired.has(ev)) return;
        cur.fired.add(ev);
        ping(cur.ad.events[ev]);
      };
      if (t > 0) fire("start");
      if (d > 0 && Number.isFinite(d)) {
        if (t >= d * 0.25) fire("firstQuartile");
        if (t >= d * 0.5) fire("midpoint");
        if (t >= d * 0.75) fire("thirdQuartile");
      }
      const off = Math.min(SKIP_AFTER_S, cur.ad.skipOffset ?? SKIP_AFTER_S);
      setSkipIn(Math.max(0, Math.ceil(off - t)));
    };
    const onEnded = () => endAd("complete");
    const onError = () => endAd("fail");
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
    };
  }, [phase, endAd]);

  const start = useCallback(() => {
    if (phase !== "idle") return;
    // Popunder: this overlay is our own element (not an iframe), so the tap is a user gesture on
    // our page. popTap opens the direct link synchronously; a tap used for the ad (opened, or
    // blocked with a retry left) does nothing else and the next tap plays. After 2 blocked tries
    // the tap plays so ad-blocker visitors are never stuck.
    if (popTap(item.id)) return;
    if (!prerollDue()) {
      playFilm();
      return;
    }
    // Pre-roll: fetch the VAST within the budget; anything but a fill plays the film.
    sendPlayerLog(item.id, "Videy", "pre_req");
    const token = ++tokenRef.current;
    setPhase("ad");
    setSkipIn(null);
    const v = videoRef.current;
    if (v) {
      // Unlock the element inside the tap so the ad can play with sound once it arrives.
      v.muted = false;
      v.controls = false;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), VAST_TIMEOUT_MS);
    void loadVast(ctrl.signal).then(({ ad }) => {
      window.clearTimeout(timer);
      if (tokenRef.current !== token) return;
      const el = videoRef.current;
      if (!ad || !el) {
        playFilm();
        return;
      }
      sendPlayerLog(item.id, "Videy", "pre_fill");
      adRef.current = { ad, fired: new Set(), token };
      el.src = ad.media;
      el.controls = false;
      // The ad must actually start soon, otherwise the film plays.
      const guard = window.setTimeout(() => {
        if (tokenRef.current === token && adRef.current && !(el.currentTime > 0)) endAd("fail");
      }, AD_START_MS);
      const go = () => {
        window.clearTimeout(guard);
        if (tokenRef.current !== token) return;
        ping(ad.impression);
      };
      el.play()
        .then(go)
        .catch(() => {
          // Sound not allowed without a fresh gesture: try muted, else the film.
          if (tokenRef.current !== token) return;
          el.muted = true;
          el.play()
            .then(go)
            .catch(() => {
              window.clearTimeout(guard);
              if (tokenRef.current === token) endAd("fail");
            });
        });
    });
  }, [phase, item.id, playFilm, endAd]);

  const adClick = useCallback(() => {
    const cur = adRef.current;
    if (!cur) return;
    ping(cur.ad.clickTracking);
    if (cur.ad.clickThrough) {
      try {
        const w = window.open(cur.ad.clickThrough, "_blank");
        if (w) w.opener = null;
      } catch {
        /* blocked */
      }
    }
    const v = videoRef.current;
    if (v && v.muted) v.muted = false;
  }, []);

  const unmuteAd = useCallback(() => {
    const v = videoRef.current;
    if (v) v.muted = !v.muted;
  }, []);

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
      {phase === "main" ? (
        // Re-armed popunder tap during playback (shared per-video cap); removes itself after firing.
        <PopTapLayer
          videoId={item.id}
          host="Videy"
          mediaRef={videoRef}
          onPass={() => {
            const v = videoRef.current;
            if (v) void (v.paused ? v.play().catch(() => {}) : v.pause());
          }}
        />
      ) : null}
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
      {phase === "ad" ? (
        <>
          {/* No full-area click-catcher: a tap on the ad video never opens the advertiser (accidental
              clicks, e.g. tapping to unmute, inflated CTR). Only the labelled buttons below act. */}
          <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white">
            {adRef.current ? "Iklan" : "Memuat…"}
          </span>
          {adRef.current ? (
            <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={unmuteAd}
                className="rounded-md border border-white/30 bg-black/75 px-3 py-1.5 text-xs text-white"
              >
                Suara
              </button>
            </div>
          ) : null}
          {adRef.current?.ad.clickThrough ? (
            // The only way to the advertiser: a small labelled button (a tap elsewhere does nothing).
            <button
              type="button"
              onClick={adClick}
              aria-label="Kunjungi pengiklan"
              className="absolute bottom-3 left-2 rounded-md border border-white/30 bg-black/75 px-3 py-1.5 text-xs text-white"
            >
              Kunjungi
            </button>
          ) : null}
          {skipIn !== null ? (
            <button
              type="button"
              disabled={skipIn > 0}
              onClick={() => endAd("skip")}
              className="absolute bottom-3 right-0 rounded-l-md border border-white/30 bg-black/75 px-4 py-2 text-sm text-white disabled:opacity-80"
            >
              {skipIn > 0 ? `Lewati dalam ${skipIn}` : "Lewati iklan ▸"}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
