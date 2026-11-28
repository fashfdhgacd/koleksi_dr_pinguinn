// One-shot popunder tap layer for the watch page (same pattern as the hosts' own players: the first
// tap opens an ad tab, the next tap reaches the player). A transparent layer sits over the player
// while the cap (card-popunder.ts: per-video count + POP_MIN_GAP_MS; no daily cap) allows a pop.
// Non-Videy hosts: one pop on the first play tap, then the layer stays off.
// Videy: pop #1 is the poster/start tap (ts-videy-popunder.tsx); this layer re-arms for pops #2 and
// #3 on later control taps (play/resume, seek, speed) after the 5s gap.
// Its tap fires our popunder and the layer removes itself, so the next tap goes to the player /
// iframe (whose own ad then runs on its own tap, never in the same tap as ours).
// Re-arming without timers: the layer comes back only on a page event (tab visible again, window
// focus/blur, scroll, or our own <video>'s play/pause/timeupdate/seeked/ratechange events) when
// canPop() says the gap has passed and this video has pops left.
// Not used for ads: it never covers an ad unit, only the video player.
import { useEffect, useRef, useState, type RefObject } from "react";
import { canPop, firePop, notePlayTap, popHost, popMaxFor, popOpened, popsLeft } from "@/components/card-popunder";
import { sendPlayerLog } from "@/lib/player-log-client";

const MAX_FAILS = 2;

export function PopTapLayer({
  videoId,
  host,
  onPass,
  mediaRef,
}: {
  videoId: string;
  host: string;
  /** Called when the layer gives up the tap (blocked twice), e.g. to toggle play on our own player. */
  onPass?: () => void;
  /** Our own <video> (Videy): its play/pause/timeupdate events also re-arm the layer. */
  mediaRef?: RefObject<HTMLVideoElement | null>;
}) {
  const [armed, setArmed] = useState(false);
  const [fails, setFails] = useState(0);
  const max = popMaxFor(host);
  const lh = popHost(host);
  const anchorRef = useRef<HTMLSpanElement>(null);

  // Revisit first-play observer: only if this video was already at its cap when the layer
  // mounted (a later pop on this same page must not be counted as a revisit). Capture-only,
  // no preventDefault / stopPropagation, so the same-origin play button still gets the tap
  // and no popunder opens.
  useEffect(() => {
    if (popsLeft(videoId, max)) return;
    const root = anchorRef.current?.parentElement;
    if (!root) return;
    const onFirst = (e: Event) => {
      if ("button" in e && (e as PointerEvent).button !== 0) return;
      notePlayTap(videoId, max, lh);
    };
    root.addEventListener("pointerdown", onFirst, { capture: true, once: true });
    return () => root.removeEventListener("pointerdown", onFirst, { capture: true });
  }, [videoId, max, lh]);

  useEffect(() => {
    const check = () => {
      setArmed(canPop(videoId, max));
    };
    check();
    const vis = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("focus", check);
    window.addEventListener("blur", check);
    window.addEventListener("scroll", check, { passive: true });
    const media = mediaRef?.current ?? null;
    const mediaEvents = ["timeupdate", "pause", "play", "seeking", "seeked", "ratechange"] as const;
    for (const e of mediaEvents) media?.addEventListener(e, check);
    return () => {
      for (const e of mediaEvents) media?.removeEventListener(e, check);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("focus", check);
      window.removeEventListener("blur", check);
      window.removeEventListener("scroll", check);
    };
  }, [videoId, mediaRef, max]);

  return (
    <>
      <span ref={anchorRef} hidden aria-hidden="true" />
      {!armed || fails >= MAX_FAILS ? null : (
    <button
      type="button"
      // Pointer-only monetization layer: its tap opens an ad tab, not playback.
      // An invisible focusable control would be an a11y violation and a misleading
      // name ("Putar video"), so it stays out of the tab order and AT tree —
      // mouse/touch popunders are unaffected.
      aria-hidden="true"
      tabIndex={-1}
      className="absolute inset-0 z-10 cursor-pointer bg-transparent"
      onClick={() => {
        if (!canPop(videoId, max)) {
          setArmed(false);
          onPass?.();
          return;
        }
        sendPlayerLog(videoId, lh, "pop_fire");
        const r = firePop(videoId, max, lh);
        if (popOpened(r)) {
          sendPlayerLog(videoId, lh, "pop_ok");
          setArmed(false);
          return;
        }
        // "skip" = a cap was hit between arming and the tap (per-video cap or gap) —
        // not a blocker, so it must not burn a fail or log pop_block.
        if (r === "skip") {
          setArmed(false);
          return;
        }
        // Neither TrafficStars nor the ExoClick fallback opened.
        sendPlayerLog(videoId, lh, "pop_block");
        const n = fails + 1;
        if (n <= 2) sendPlayerLog(videoId, lh, n === 1 ? "pop_f1" : "pop_f2");
        setFails(n);
        if (n >= MAX_FAILS) onPass?.();
      }}
    />
      )}
    </>
  );
}
