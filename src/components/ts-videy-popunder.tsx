// TrafficStars popunder (spot 5210859) for Videy watch pages only; used by videy-player.tsx, which
// only renders for Videy items (never IndoAV / UserBokep / Putarin or catalog pages).
// The Videy player's own tap-catcher overlay (our page, not an iframe) calls popTap() synchronously
// in its click handler: window.open(direct link) in that user gesture. Opened (non-null) -> video
// marked done for this session, the tap does nothing else (video stays paused, our tab stays);
// blocked -> the overlay stays and the next tap retries; after 2 blocked tries the tap plays.
// Counters (player-log, once per video per session): pop_fire / pop_ok / pop_block.
// No-fill fallback (armNoFillPop): when the Videy VAST pre-roll returns no ad / error / timeout, the
// viewer's NEXT tap or click on the page (never automatic) opens the same direct link once per video
// per session, recorded in the same sessionStorage state (id "nf:<videoId>"). Blocked -> given up.
import { sendPlayerLog } from "@/lib/player-log-client";

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
    sendPlayerLog(videoId, "Videy", "pop_ok");
    return true;
  }
  sendPlayerLog(videoId, "Videy", "pop_block");
  const n = (failures.get(videoId) || 0) + 1;
  failures.set(videoId, n);
  return n < MAX_FAILS;
}

let armedFor = "";
let disarm: (() => void) | null = null;

/**
 * Pre-roll had no fill: the viewer's next tap/click opens the direct link once for this video
 * (same session state as popTap, key "nf:<id>"). Never opens without a user gesture.
 */
export function armNoFillPop(videoId: string): void {
  if (typeof window === "undefined" || !videoId) return;
  const key = "nf:" + videoId;
  if (firedIds().includes(key) || armedFor === key) return;
  disarm?.();
  armedFor = key;
  const onTap = () => {
    cleanup();
    if (firedIds().includes(key)) return;
    sendPlayerLog(videoId, "Videy", "pop_fire");
    let w: Window | null = null;
    try {
      w = window.open(DIRECT_LINK, "_blank");
      if (w) w.opener = null;
    } catch {
      w = null;
    }
    saveIds(firedIds().concat(key)); // once per video per session, opened or blocked
    sendPlayerLog(videoId, "Videy", w ? "pop_ok" : "pop_block");
  };
  function cleanup() {
    document.removeEventListener("click", onTap, true);
    document.removeEventListener("touchend", onTap, true);
    if (armedFor === key) armedFor = "";
    disarm = null;
  }
  disarm = cleanup;
  document.addEventListener("click", onTap, true);
  document.addEventListener("touchend", onTap, true);
}

/** Drop a pending no-fill pop (video changed / player unmounted). */
export function disarmNoFillPop(): void {
  disarm?.();
}
