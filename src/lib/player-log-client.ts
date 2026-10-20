/**
 * Browser side of /api/player-log for players outside src/components/video/player.tsx (today: the
 * Videy player, src/components/video/videy-player.tsx). Same rules as player.tsx's logPlayerEvent:
 * one beacon per video+event per browser session, sharing the same sessionStorage list
 * ("kdp-plog"), unsampled, sendBeacon first and a keepalive fetch as fallback. So a Videy play costs
 * exactly what a play on any other host costs: one D1 upsert per video+event per session.
 */

export type PlayerLogEvent =
  | "start2"
  | "slow2"
  | "fail2"
  | "pop_fire"
  | "pop_ok"
  | "pop_block"
  | "popc_fire"
  | "popc_ok"
  | "popc_block"
  | "pre_req"
  | "pre_fill"
  | "pre_done";
export type PlayerLogHost = "IndoAV" | "UserBokep" | "Streamtape" | "Putarin" | "Videy" | "Arsip" | "Lainnya";

const LOG_KEY = "kdp-plog";
const loggedMem = new Set<string>();

export function sendPlayerLog(id: string, host: PlayerLogHost, event: PlayerLogEvent): void {
  if (typeof window === "undefined" || !id) return;
  const tag = `${id}|${event}`;
  if (loggedMem.has(tag)) return;
  loggedMem.add(tag);
  try {
    const seen = JSON.parse(window.sessionStorage.getItem(LOG_KEY) || "[]") as string[];
    if (Array.isArray(seen)) {
      if (seen.includes(tag)) return;
      seen.push(tag);
      window.sessionStorage.setItem(LOG_KEY, JSON.stringify(seen.slice(-300)));
    }
  } catch {
    /* private mode: the in-memory set still limits this page */
  }
  const body = JSON.stringify({ id, host, event });
  try {
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/player-log", body)) return;
  } catch {
    /* fall back to fetch */
  }
  void fetch("/api/player-log", {
    method: "POST",
    body,
    keepalive: true,
    headers: { "content-type": "text/plain;charset=UTF-8" },
  }).catch(() => undefined);
}
