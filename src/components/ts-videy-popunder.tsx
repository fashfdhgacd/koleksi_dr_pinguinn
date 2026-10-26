// Videy player popunder: the Videy player (videy-player.tsx, our own HTML5 player) calls popTap()
// synchronously in a tap handler (poster tap, or the re-armed tap layer during playback). The cap
// (POP_MAX_PER_VIDEO per video, POP_MIN_GAP_MS between pops) lives in card-popunder.ts and is shared
// with the catalog cards and the watch-page tap layer. Opened -> the tap does nothing else (next tap
// plays); blocked -> the next tap retries, and after 2 blocked tries per video the tap plays so
// ad-blocker visitors are never stuck.
// Counters (player-log, once per video per session): pop_fire / pop_ok / pop_block.
import { sendPlayerLog } from "@/lib/player-log-client";
import { canPop, firePop } from "@/components/card-popunder";

const MAX_FAILS = 2;
const failures = new Map<string, number>();

/** True while a tap on this video should go to the ad first. */
export function owesAd(videoId: string): boolean {
  return canPop(videoId) && (failures.get(videoId) || 0) < MAX_FAILS;
}

/**
 * Call synchronously from the tap handler. Returns true when this tap was used for the ad (the
 * caller must NOT play), false when it should play.
 */
export function popTap(videoId: string): boolean {
  if (!owesAd(videoId)) return false;
  sendPlayerLog(videoId, "Videy", "pop_fire");
  const r = firePop(videoId);
  if (r === "ok") {
    sendPlayerLog(videoId, "Videy", "pop_ok");
    return true;
  }
  sendPlayerLog(videoId, "Videy", "pop_block");
  const n = (failures.get(videoId) || 0) + 1;
  failures.set(videoId, n);
  return n < MAX_FAILS;
}
