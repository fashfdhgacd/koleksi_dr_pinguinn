/**
 * Monetag direct link for Videy videos only (src/components/video/videy-player.tsx, our own HTML5
 * player). Browser-only: no Worker/server involvement, no env vars.
 *
 * - A play tap opens the direct link in a new tab (the Videy video keeps playing in our tab).
 * - At most MONETAG_MAX_OPENS per browser session (sessionStorage; in-memory fallback when storage
 *   is blocked), and at least MONETAG_MIN_GAP_MS between two opens, so a few quick taps never fire
 *   the whole budget at once. A tap inside the gap just plays.
 */
export const MONETAG_DIRECT_LINK = "https://uplcm.com/4/12070441";
export const MONETAG_MAX_OPENS = 3;
export const MONETAG_MIN_GAP_MS = 20_000;

const STORAGE_KEY = "drp_mt_dl";

type DlState = { n: number; at: number };

let memory: DlState = { n: 0, at: 0 };

function readState(): DlState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return memory;
    const parsed = JSON.parse(raw) as Partial<DlState>;
    const n = Number(parsed?.n);
    const at = Number(parsed?.at);
    const fromStorage = { n: Number.isFinite(n) ? n : 0, at: Number.isFinite(at) ? at : 0 };
    // Never below what this page already counted (storage cleared or partly failing).
    return fromStorage.n >= memory.n ? fromStorage : memory;
  } catch {
    return memory;
  }
}

function writeState(state: DlState): void {
  memory = state;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* in-memory cap only */
  }
}

/**
 * Call synchronously inside the click/tap handler (popup blockers only allow window.open there).
 * Returns true when the direct link was opened. Never throws.
 */
export function maybeOpenMonetagDirectLink(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const state = readState();
    if (state.n >= MONETAG_MAX_OPENS) return false;
    const now = Date.now();
    if (state.at && now - state.at < MONETAG_MIN_GAP_MS) return false;
    writeState({ n: state.n + 1, at: now });
    window.open(MONETAG_DIRECT_LINK, "_blank", "noopener");
    return true;
  } catch {
    return false;
  }
}
