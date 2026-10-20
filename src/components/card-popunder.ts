// Catalog card-click popunder (TrafficStars spot 5210859 direct link): on home, kategori and search
// grids (and the home hero), a click on a VIDEO card at most once per 30 minutes per visitor opens the ad in a new tab
// synchronously in that click; the normal navigation to the watch page then proceeds unchanged
// (nothing is prevented or delayed). The 30-minute timestamp is stored only when window.open returned a
// window; a blocked open retries on a later card click. Ad cards ([data-kdp-ad]) never trigger it.
// Counters: popc_fire / popc_ok / popc_block in player-log (once per video+event per session).
import { sendPlayerLog, type PlayerLogHost } from "@/lib/player-log-client";

const DIRECT_LINK = "https://fozekikikiminu.com/api/v1/direct/587547ff73c844b39ab9f02d1285154b";
const KEY = "kdp_ts_card_pop_at";
/** At most one card/hero popunder per visitor per 30 minutes (timestamp in localStorage). */
const GAP_MS = 30 * 60_000;
const HOSTS = new Set(["IndoAV", "UserBokep", "Streamtape", "Putarin", "Videy", "Arsip"]);
let lastMem = 0;

function done(): boolean {
  let last = lastMem;
  try {
    last = Number(localStorage.getItem(KEY)) || 0;
  } catch {
    /* storage blocked: in-memory only */
  }
  const now = Date.now();
  return last > 0 && last <= now && now - last < GAP_MS;
}

function markDone(): void {
  lastMem = Date.now();
  try {
    localStorage.setItem(KEY, String(lastMem));
  } catch {
    /* in-memory only */
  }
}

/** Click handler for a catalog grid container (capture phase). Never prevents navigation. */
export function onCatalogCardClick(event: { target: EventTarget | null }, hostOf: (id: string) => string): void {
  if (typeof window === "undefined" || done()) return;
  const el = event.target instanceof Element ? event.target : null;
  if (!el || el.closest("[data-kdp-ad]")) return;
  const a = el.closest('a[href^="/watch/"]');
  if (!a) return;
  const id = decodeURIComponent((a.getAttribute("href") || "").slice("/watch/".length).split(/[?#/]/)[0] || "");
  if (!id) return;
  const h = hostOf(id);
  const host = (HOSTS.has(h) ? h : "Lainnya") as PlayerLogHost;
  sendPlayerLog(id, host, "popc_fire");
  let w: Window | null = null;
  try {
    w = window.open(DIRECT_LINK, "_blank");
    if (w) w.opener = null;
  } catch {
    w = null;
  }
  if (w) {
    markDone();
    sendPlayerLog(id, host, "popc_ok");
  } else {
    sendPlayerLog(id, host, "popc_block");
  }
}
