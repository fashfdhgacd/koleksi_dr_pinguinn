// One-shot popunder tap layer for the watch page (same pattern as the hosts' own players: the first
// tap opens an ad tab, the next tap reaches the player). A transparent layer sits over the player
// while the cap (card-popunder.ts: POP_MAX_PER_VIDEO per video, POP_MIN_GAP_MS apart) allows a pop.
// Its tap fires our popunder and the layer removes itself, so the next tap goes to the player /
// iframe (whose own ad then runs on its own tap, never in the same tap as ours).
// Re-arming without timers: the layer comes back only on a page event (tab visible again, window
// focus/blur, scroll, or our own <video>'s play/pause/timeupdate events) when canPop() says the gap has passed and this video has pops left.
// Not used for ads: it never covers an ad unit, only the video player.
import { useEffect, useState, type RefObject } from "react";
import { canPop, firePop, popHost } from "@/components/card-popunder";
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

  useEffect(() => {
    const check = () => {
      if (canPop(videoId)) setArmed(true);
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
    const mediaEvents = ["timeupdate", "pause", "play"] as const;
    for (const e of mediaEvents) media?.addEventListener(e, check);
    return () => {
      for (const e of mediaEvents) media?.removeEventListener(e, check);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("focus", check);
      window.removeEventListener("blur", check);
      window.removeEventListener("scroll", check);
    };
  }, [videoId, mediaRef]);

  if (!armed || fails >= MAX_FAILS) return null;
  const lh = popHost(host);
  return (
    <button
      type="button"
      aria-label="Putar video"
      className="absolute inset-0 z-10 cursor-pointer bg-transparent"
      onClick={() => {
        if (!canPop(videoId)) {
          setArmed(false);
          onPass?.();
          return;
        }
        sendPlayerLog(videoId, lh, "pop_fire");
        const r = firePop(videoId);
        if (r === "ok") {
          sendPlayerLog(videoId, lh, "pop_ok");
          setArmed(false);
          return;
        }
        sendPlayerLog(videoId, lh, "pop_block");
        const n = fails + 1;
        setFails(n);
        if (n >= MAX_FAILS) onPass?.();
      }}
    />
  );
}
