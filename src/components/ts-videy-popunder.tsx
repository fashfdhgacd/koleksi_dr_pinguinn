// TrafficStars popunder (spot 5210859) for Videy watch pages only; called from videy-player.tsx,
// which only renders for Videy items (never IndoAV / UserBokep / Putarin or catalog pages).
// Goal: one popunder per Videy video, on the first play tap of each video in this session.
// - armVideyPopunder(id) runs when a Videy video mounts. If this video has not fired yet, the SDK
//   script is put in the page (one tag per page load; SPA navigation reuses it, never duplicates)
//   so its click listener is bound before the visitor taps play.
// - markVideyPopunderTap(id) runs on the play tap and records the id (sessionStorage set), so
//   reopening the same video does not arm it again.
// The SDK's own cap is kept loose (30 s, 1) so it does not block the next video's first tap.
const SDK_SRC = "https://cdn.fozekikikiminu.com/sdk/v1/dd.p.js";
const SPOT = "587547ff73c844b39ab9f02d1285154b";
const DOMAIN = "fozekikikiminu.com";
const KEY = "kdp_ts_pop_ids";
const TAG_ID = "kdp-ts-popunder";
let memory: string[] = [];

function firedIds(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
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

export function armVideyPopunder(videoId: string): void {
  if (typeof document === "undefined" || !videoId) return;
  if (firedIds().includes(videoId)) return;
  if (document.getElementById(TAG_ID)) return;
  const s = document.createElement("script");
  s.id = TAG_ID;
  s.type = "text/javascript";
  s.src = SDK_SRC;
  s.async = true;
  s.defer = true;
  s.setAttribute("data-ts-spot", SPOT);
  s.setAttribute("data-ts-domain", DOMAIN);
  s.setAttribute("data-ts-session-duration", "30");
  s.setAttribute("data-ts-count", "1");
  document.body.appendChild(s);
}

export function markVideyPopunderTap(videoId: string): void {
  if (!videoId) return;
  const ids = firedIds();
  if (!ids.includes(videoId)) saveIds(ids.concat(videoId));
}
