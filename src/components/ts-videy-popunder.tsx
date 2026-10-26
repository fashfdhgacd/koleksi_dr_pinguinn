// TrafficStars popunder (spot 5210859) for Videy watch pages only; used by videy-player.tsx, which
// only renders for Videy items (never IndoAV / UserBokep / Putarin or catalog pages).
// The Videy player's own tap-catcher overlay (our page, not an iframe) calls popTap() synchronously
// in its click handler: window.open(direct link) in that user gesture. Opened (non-null) -> video
// marked done for this session (and the site-wide one-per-session flag is set), the tap does nothing else (video stays paused, our tab stays);
// blocked -> the overlay stays and the next tap retries; after 2 blocked tries the tap plays.
// Counters (player-log, once per video per session): pop_fire / pop_ok / pop_block.
import { sendPlayerLog } from "@/lib/player-log-client";
import { markPopDoneThisSession, popDoneThisSession } from "@/components/card-popunder";

const DIRECT_LINK = "https://fozekikikiminu.com/api/v1/direct/587547ff73c844b39ab9f02d1285154b";
const KEY = "kdp_ts_pop_ids";
const MAX_FAILS = 2;
let memory: string[] = [];
const failures = new Map<string, number>();

function firedIds(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : memory;
  } catch {
    return memory;
  }
}

function saveIds(ids: string[]): void {
  memory = ids;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    /* storage blocked: in-memory only */
  }
}

/** True while this video still owes its ad (the tap-catcher stays in charge of the first tap). */
export function owesAd(videoId: string): boolean {
  if (typeof window === "undefined" || !videoId) return false;
  if (popDoneThisSession()) return false; // one popunder per session site-wide
  return !firedIds().includes(videoId) && (failures.get(videoId) || 0) < MAX_FAILS;
}

/**
 * Call synchronously from the overlay's click handler. Returns true when this tap was used for the
 * ad (the caller must NOT play), false when it should play.
 */
export function popTap(videoId: string): boolean {
  if (!owesAd(videoId)) return false;
  sendPlayerLog(videoId, "Videy", "pop_fire");
  let w: Window | null = null;
  try {
    w = window.open(DIRECT_LINK, "_blank");
    if (w) w.opener = null; // the ad tab cannot reach back into this page
  } catch {
    w = null;
  }
  if (w) {
    saveIds(firedIds().concat(videoId));
    markPopDoneThisSession();
    sendPlayerLog(videoId, "Videy", "pop_ok");
    return true;
  }
  sendPlayerLog(videoId, "Videy", "pop_block");
  const n = (failures.get(videoId) || 0) + 1;
  failures.set(videoId, n);
  return n < MAX_FAILS;
}
