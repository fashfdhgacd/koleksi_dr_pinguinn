// Videy player popunder: the Videy player (videy-player.tsx, our own HTML5 player) calls popTap()
// synchronously in the poster/start tap handler (pop #1). Later player-control taps (play/resume,
// seek, speed) use PopTapLayer with the same cap (POP_MAX_VIDEY=3 per Videy video, POP_MIN_GAP_MS=5s
// between pops) in card-popunder.ts.
// No daily cap. Opened -> the tap does nothing else (next tap
// plays or reaches the control); blocked -> the next tap retries, and after 2 blocked tries per
// video the tap plays so ad-blocker visitors are never stuck.
// Counters (player-log, once per video per session): pop_fire / pop_ok / pop_block.
import { sendPlayerLog } from "@/lib/player-log-client";
import { canPop, firePop, POP_MAX_VIDEY } from "@/components/card-popunder";

const MAX_FAILS = 2;
const failures = new Map<string, number>();

/** True while a tap on this video should go to the ad first. */
export function owesAd(videoId: string): boolean {
  return canPop(videoId, POP_MAX_VIDEY) && (failures.get(videoId) || 0) < MAX_FAILS;
}

/**
 * Call synchronously from the tap handler. Returns true when this tap was used for the ad (the
 * caller must NOT play), false when it should play.
 */
export function popTap(videoId: string): boolean {
  if (!owesAd(videoId)) return false;
  sendPlayerLog(videoId, "Videy", "pop_fire");
  const r = firePop(videoId, POP_MAX_VIDEY, "Videy");
  if (r === "ok") {
    sendPlayerLog(videoId, "Videy", "pop_ok");
    return true;
  }
  // "skip" = a cap or gap said no (per-video) — let the tap play, not a blocker.
  if (r === "skip") return false;
  sendPlayerLog(videoId, "Videy", "pop_block");
  const n = (failures.get(videoId) || 0) + 1;
  failures.set(videoId, n);
  return n < MAX_FAILS;
}
