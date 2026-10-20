// Catalog card-click popunder (TrafficStars spot 5210859 direct link): on home, kategori and search
// grids, the first click on a VIDEO card per browser session opens the ad in a new tab
// synchronously in that click; the normal navigation to the watch page then proceeds unchanged
// (nothing is prevented or delayed). The session is marked done only when window.open returned a
// window; a blocked open retries on a later card click. Ad cards ([data-kdp-ad]) never trigger it.
// Counters: popc_fire / popc_ok / popc_block in player-log (once per session).
import { sendPlayerLog, type PlayerLogHost } from "@/lib/player-log-client";

const DIRECT_LINK = "https://fozekikikiminu.com/api/v1/direct/587547ff73c844b39ab9f02d1285154b";
const KEY = "kdp_ts_card_pop";
const HOSTS = new Set(["IndoAV", "UserBokep", "Streamtape", "Putarin", "Videy", "Arsip"]);
let doneMem = false;

function done(): boolean {
  try {
    return doneMem || sessionStorage.getItem(KEY) === "1";
  } catch {
    return doneMem;
  }
}

function markDone(): void {
  doneMem = true;
  try {
    sessionStorage.setItem(KEY, "1");
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
