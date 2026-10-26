// TrafficStars direct-link popunder (spot 5210859), shared by every trigger: catalog card / hero click
// (counts toward the video it opens), the one-shot tap layer over iframe players on the watch page
// (tap-popunder.tsx) and the Videy player (ts-videy-popunder.tsx).
// Cap, modelled on the hosts' own players (IndoAV / Lulu: first tap opens an ad tab, next tap plays):
// at most POP_MAX_PER_VIDEO pops per video id (the count resets when another video is opened) and at
// least POP_MIN_GAP_MS between two pops on the same video. sessionStorage only; timestamps are compared on tap
// (no server writes, no timers). A blocked window.open counts nothing.
// Counters: popc_fire / popc_ok / popc_block in player-log (once per video+event per session).
import { sendPlayerLog, type PlayerLogHost } from "@/lib/player-log-client";

const DIRECT_LINK = "https://fozekikikiminu.com/api/v1/direct/587547ff73c844b39ab9f02d1285154b";
const HOSTS = new Set(["IndoAV", "UserBokep", "Streamtape", "Putarin", "Videy", "Arsip"]);

/** Max popunders per video id. Easy to change. */
export const POP_MAX_PER_VIDEO = 3;
/** Minimum time between two popunders on the SAME video (a newly opened video may pop at once). */
export const POP_MIN_GAP_MS = 20_000;

const KEY = "kdp_pop_v1";
type PopState = { id: string; n: number; at: number };
let mem: PopState = { id: "", n: 0, at: 0 };

function readState(): PopState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as PopState;
      if (v && typeof v.id === "string" && typeof v.n === "number" && typeof v.at === "number") return v;
    }
  } catch {
    /* fall back to memory */
  }
  return mem;
}

function writeState(v: PopState): void {
  mem = v;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* in-memory only */
  }
}

/** True when a popunder for this video is allowed right now (per-video count + global gap). */
export function canPop(videoId: string): boolean {
  if (typeof window === "undefined" || !videoId) return false;
  const st = readState();
  if (st.id !== videoId) return true; // another video: fresh count, no gap
  return st.n < POP_MAX_PER_VIDEO && Date.now() - st.at >= POP_MIN_GAP_MS;
}

/** True when this video can still get a popunder later (count not used up), ignoring the gap. */
export function popsLeft(videoId: string): boolean {
  if (typeof window === "undefined" || !videoId) return false;
  const st = readState();
  return (st.id === videoId ? st.n : 0) < POP_MAX_PER_VIDEO;
}

/**
 * Opens the direct link synchronously (call inside the click handler). Returns "ok" when a tab
 * opened (counted), "block" when the browser blocked it (not counted), "skip" when the cap says no.
 */
export function firePop(videoId: string): "ok" | "block" | "skip" {
  if (!canPop(videoId)) return "skip";
  let w: Window | null = null;
  try {
    w = window.open(DIRECT_LINK, "_blank");
    if (w) w.opener = null; // the ad tab cannot reach back into this page
  } catch {
    w = null;
  }
  if (!w) return "block";
  const st = readState();
  writeState({ id: videoId, n: (st.id === videoId ? st.n : 0) + 1, at: Date.now() });
  return "ok";
}

export function popHost(h: string): PlayerLogHost {
  return (HOSTS.has(h) ? h : "Lainnya") as PlayerLogHost;
}

/** Click handler for a catalog grid container (capture phase). Never prevents navigation. */
export function onCatalogCardClick(event: { target: EventTarget | null }, hostOf: (id: string) => string): void {
  if (typeof window === "undefined") return;
  const el = event.target instanceof Element ? event.target : null;
  if (!el || el.closest("[data-kdp-ad]")) return;
  const a = el.closest('a[href^="/watch/"]');
  if (!a) return;
  const id = decodeURIComponent((a.getAttribute("href") || "").slice("/watch/".length).split(/[?#/]/)[0] || "");
  if (!id) return;
  if (!canPop(id)) return;
  const host = popHost(hostOf(id));
  sendPlayerLog(id, host, "popc_fire");
  sendPlayerLog(id, host, firePop(id) === "ok" ? "popc_ok" : "popc_block");
}
