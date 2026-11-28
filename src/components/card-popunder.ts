// TrafficStars direct-link popunder (spot 5210859) with an ExoClick direct-link popunder as FALLBACK,
// used only by player-tap paths:
// the one-shot tap layer over iframe players (tap-popunder.tsx) and the Videy player
// (ts-videy-popunder.tsx). Catalog, hero, category, pagination, and "Muat lagi"
// clicks never fire a popunder.
// In-video taps keep the per-video cap below: each of the last 50 videos keeps its own count for
// 24h (localStorage, src/lib/pop-memory.ts), so going back to an earlier video does not reset it.
// There is no daily cap: only the per-video allowance and the minimum gap apply. Blocked tabs consume no slot.
// Fallback: each entitled tap opens TrafficStars first. If that window.open comes back null or already
// closed (popup blocker / blocker extension that stubs window.open), the ExoClick link is opened right
// away in the SAME synchronous click handler (the user activation is still there because nothing opened).
// Never both: if TrafficStars opened, Exo is not touched. The tap still counts as ONE pop (one slot in
// kdp_pop_v2), whichever brand opened. LIMITATION: window.open only tells us the browser let a window
// through. If a blocker/network filter lets the empty tab open and then kills the TrafficStars request, or
// TrafficStars serves no ad, that tab still counts as TrafficStars: that cannot be detected from this page
// (cross-origin), and opening a second tab later would be blocked anyway (no gesture left).
// Counters: pop_fire / pop_ok / pop_block in player-log (once per video+event per session).
// Each open is also logged by its position for that video (pop_n1..pop_n6, one D1
// upsert per opened tab, same beacon as today), so /pemilik can compare ALL our opens with
// TrafficStars' paid impressions instead of only the first tab per video.
import { sendPlayerLog, type PlayerLogHost } from "@/lib/player-log-client";
import { parsePopMemory, popEntry, prunePopMemory, recordPop, type PopEntry } from "@/lib/pop-memory";

const DIRECT_LINK = "https://fozekikikiminu.com/api/v1/direct/587547ff73c844b39ab9f02d1285154b";
/** ExoClick direct-link popunder (main-site zone 6055468, site 1115596; satellites use their own zones). */
export const EXO_ZONE = "6055468";
const EXO_DIRECT_LINK = `https://s.pemsrv.com/v1/link.php?idzone=${EXO_ZONE}&type=8`;
const HOSTS = new Set(["IndoAV", "UserBokep", "Streamtape", "Putarin", "Videy", "Arsip"]);

/** Non-Videy player tap layer: one popunder on the first play tap, then the video loads. */
export const POP_MAX_OTHER = 1;
/** Minimum time between two Videy popunders on the SAME video (a newly opened video may pop at once). */
export const POP_MIN_GAP_MS = 5_000;
/** Videy popunder cap per video. Pop #1 on the
 * first play/start tap; pops #2 and #3 on later player-control taps (play/resume, seek,
 * speed) after this gap. */
export const POP_MAX_VIDEY = 3;
/** Per-video cap for the player tap layer. */
export function popMaxFor(host: string): number {
  return host === "Videy" ? POP_MAX_VIDEY : POP_MAX_OTHER;
}

const KEY = "kdp_pop_v2";
let mem: PopEntry[] = [];

function readMemory(now: number): PopEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== null) return parsePopMemory(raw, now);
  } catch {
    /* fall back to memory */
  }
  return prunePopMemory(mem, now);
}

function writeMemory(list: PopEntry[]): void {
  mem = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* in-memory only */
  }
}

/** Checks the per-video allowance and the minimum gap. */
export function canPop(videoId: string, max: number): boolean {
  if (typeof window === "undefined" || !videoId) return false;
  const now = Date.now();
  const e = popEntry(readMemory(now), videoId, now);
  if (!e) return true; // this video has not popped yet (or its entry expired): no gap
  return e.n < max && now - e.at >= POP_MIN_GAP_MS;
}

/** True when this video can still get a popunder later (count not used up), ignoring the gap. */
export function popsLeft(videoId: string, max: number): boolean {
  if (typeof window === "undefined" || !videoId) return false;
  const now = Date.now();
  return (popEntry(readMemory(now), videoId, now)?.n ?? 0) < max;
}

export type PopResult = "ok" | "exo" | "block" | "skip";

/** True when a tab opened (TrafficStars "ok" or the ExoClick fallback "exo"). */
export function popOpened(r: PopResult): boolean {
  return r === "ok" || r === "exo";
}

/** window.open that reports whether a usable window came back (null or already closed = blocked). */
function openTab(url: string): boolean {
  let w: Window | null = null;
  try {
    w = window.open(url, "_blank");
  } catch {
    return false;
  }
  if (!w || w.closed) return false;
  try {
    w.opener = null; // the ad tab cannot reach back into this page
  } catch {
    /* ignore */
  }
  return true;
}

/**
 * Opens the popunder synchronously (call inside the click handler): TrafficStars first, and only if
 * that is blocked the ExoClick link, in the same call. Returns "ok" when the TrafficStars tab opened,
 * "exo" when TrafficStars was blocked and the ExoClick tab opened (both count as this tap's one pop),
 * "block" when neither opened (not counted), "skip" when the cap says no.
 */
export function firePop(videoId: string, max: number, host?: PlayerLogHost): PopResult {
  if (!canPop(videoId, max)) return "skip";
  let result: PopResult = "ok";
  if (!openTab(DIRECT_LINK)) {
    if (!openTab(EXO_DIRECT_LINK)) return "block";
    result = "exo";
  }
  const now = Date.now();
  const list = recordPop(readMemory(now), videoId, now);
  writeMemory(list);
  const n = popEntry(list, videoId, now)?.n ?? 1;
  if (host && n >= 1 && n <= 6) {
    sendPlayerLog(videoId, host, `pop_n${n}` as "pop_n1" | "pop_n2" | "pop_n3" | "pop_n4" | "pop_n5" | "pop_n6");
    // Which brand opened it (same beacon path, only for the rare fallback): no row = TrafficStars.
    if (result === "exo") sendPlayerLog(videoId, host, `pop_x${n}` as "pop_x1" | "pop_x2" | "pop_x3" | "pop_x4" | "pop_x5" | "pop_x6");
  }
  return result;
}

export function popHost(h: string): PlayerLogHost {
  return (HOSTS.has(h) ? h : "Lainnya") as PlayerLogHost;
}
