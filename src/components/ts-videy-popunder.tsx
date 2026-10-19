// TrafficStars popunder (spot 5210859) for Videy watch pages only; called from videy-player.tsx,
// which only renders for Videy items (never IndoAV / UserBokep / Putarin or catalog pages).
// One per Videy video: the first real play tap of each video opens the spot's direct link in a new
// tab (window.open, synchronously inside the tap so popup blockers allow it); that tap does not
// play, the next one does. The id is recorded only when the tab really opened (sessionStorage set);
// a blocked open is retried on the next tap, and after 2 failures the video just plays. Age-gate
// taps and SPA navigation never use up a video's turn.
// (The dd.p.js SDK was dropped: on Android Chrome it bound late / lost the tap, so it did not fire.)
const DIRECT_LINK = "https://fozekikikiminu.com/api/v1/direct/587547ff73c844b39ab9f02d1285154b";
const KEY = "kdp_ts_pop_ids";
let memory: string[] = [];

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

const failures = new Map<string, number>();
const MAX_FAILS = 2;

/**
 * Call synchronously from the play tap handler. Returns true when this tap was used for the ad
 * (the caller must NOT play): the ad tab opened (video marked done), or opening failed and the
 * video still has retries left. Returns false when the tap should play: the video already had its
 * ad, or opening failed MAX_FAILS times (ad blockers never get stuck).
 */
export function popunderOnPlayTap(videoId: string): boolean {
  if (typeof window === "undefined" || !videoId) return false;
  const ids = firedIds();
  if (ids.includes(videoId)) return false;
  const failed = failures.get(videoId) || 0;
  if (failed >= MAX_FAILS) return false;
  let w: Window | null = null;
  try {
    w = window.open(DIRECT_LINK, "_blank");
    if (w) w.opener = null; // the ad tab cannot reach back into this page
  } catch {
    w = null;
  }
  if (w) saveIds(ids.concat(videoId));
  else failures.set(videoId, failed + 1); // blocked: retry on the next tap
  return true;
}
