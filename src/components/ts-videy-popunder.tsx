// TrafficStars popunder (spot 5210859) for Videy watch pages only; used by videy-player.tsx, which
// only renders for Videy items (never IndoAV / UserBokep / Putarin or catalog pages).
//
// The official SDK (dd.p.js) is loaded once per page while a Videy video is on screen, configured
// so it can only fire from the Videy play button and never swaps our tab:
//   data-ts-allowed-selectors="[data-kdp-pop]"  only taps on an element with data-kdp-pop count
//   data-ts-type="tabup"                       the ad opens in a new tab; our tab stays on our page
//   data-ts-session-duration / count           SDK cap kept loose (1 s / 1); our gate does the rest
// The player puts data-kdp-pop on its play button only while that video still owes its ad.
// The SDK opens the ad in its own (capture-phase) tap listener, before React's onClick runs; a
// small window.open wrapper records whether that open succeeded, and the player's onClick then
// asks consumeTap(): ad opened -> mark video done, don't play; failed -> retry next tap; after 2
// failures (or no SDK) -> play. Once per video per session (sessionStorage).
const SDK_SRC = "https://cdn.fozekikikiminu.com/sdk/v1/dd.p.js";
const SPOT = "587547ff73c844b39ab9f02d1285154b";
const DOMAIN = "fozekikikiminu.com";
const TAG_ID = "kdp-ts-popunder";
export const POP_ATTR = "data-kdp-pop";
const KEY = "kdp_ts_pop_ids";
const MAX_FAILS = 2;
const OPEN_WINDOW_MS = 1500;

let memory: string[] = [];
const failures = new Map<string, number>();
let lastOpen: { at: number; ok: boolean } | null = null;

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

/** True while this video still owes its ad (so the play button carries POP_ATTR). */
export function owesAd(videoId: string): boolean {
  if (typeof window === "undefined" || !videoId) return false;
  return !firedIds().includes(videoId) && (failures.get(videoId) || 0) < MAX_FAILS;
}

/** Load the SDK once per page (Videy watch only). Safe to call on every Videy mount. */
export function ensureVideyPopunderSdk(): void {
  if (typeof document === "undefined" || document.getElementById(TAG_ID)) return;
  // Observe the SDK's window.open result (success = a window object came back).
  const w = window as Window & { __kdpOpenWrapped?: boolean };
  if (!w.__kdpOpenWrapped) {
    w.__kdpOpenWrapped = true;
    const orig = window.open.bind(window);
    window.open = ((...args: Parameters<typeof window.open>) => {
      const res = orig(...args);
      lastOpen = { at: Date.now(), ok: Boolean(res) };
      return res;
    }) as typeof window.open;
  }
  const s = document.createElement("script");
  s.id = TAG_ID;
  s.type = "text/javascript";
  s.src = SDK_SRC;
  s.async = true;
  s.defer = true;
  s.setAttribute("data-ts-spot", SPOT);
  s.setAttribute("data-ts-domain", DOMAIN);
  s.setAttribute("data-ts-type", "tabup");
  s.setAttribute("data-ts-allowed-selectors", `[${POP_ATTR}]`);
  s.setAttribute("data-ts-session-duration", "1");
  s.setAttribute("data-ts-count", "1");
  document.body.appendChild(s);
}

/**
 * Call from the play button's onClick. Returns true when this tap was used for the ad and the
 * caller must NOT play; false when the tap should play.
 */
export function consumeTap(videoId: string): boolean {
  if (!owesAd(videoId)) return false;
  const recent = lastOpen && Date.now() - lastOpen.at < OPEN_WINDOW_MS ? lastOpen : null;
  lastOpen = null;
  if (recent?.ok) {
    saveIds(firedIds().concat(videoId));
    return true;
  }
  // No open (SDK not ready, capped, or blocked): count a failed attempt; keep paused for a retry.
  const n = (failures.get(videoId) || 0) + 1;
  failures.set(videoId, n);
  return n < MAX_FAILS;
}
