import { useEffect, useState } from "react";

/**
 * Our own visitor likes on video cards, kept close to live.
 *
 * Cards are rendered with the 12-hour snapshot (site-likes.json -> video.siteLikes). After the page
 * loads, every card on the page shares ONE small request to /api/likes-live (D1 counts, edge-cached
 * ~60 s, so D1 is read at most about once a minute per Cloudflare location). A like/unlike on the
 * watch page is remembered locally for a few minutes, so the visitor sees their own like on the
 * cards immediately, before the edge cache turns over.
 */
type LikeMap = Record<string, number>;
type Recent = Record<string, { n: number; at: number }>;

const RECENT_KEY = "dp_like_recent_v1";
const RECENT_MS = 10 * 60_000;
/** Edge cache (60 s) plus margin: after this, the live feed already includes our own like. */
const RECENT_WINS_MS = 90_000;
const REFRESH_MS = 60_000;

let live: LikeMap | null = null;
let liveAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

function loadLive(): void {
  if (typeof window === "undefined" || inflight) return;
  if (live && Date.now() - liveAt < REFRESH_MS) return;
  inflight = fetch("/api/likes-live", { headers: { accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { ok?: boolean; likes?: LikeMap } | null) => {
      if (d?.ok && d.likes && typeof d.likes === "object") {
        live = d.likes;
        liveAt = Date.now();
        emit();
      }
    })
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
}

function readRecent(): Recent {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const v = raw ? (JSON.parse(raw) as Recent) : null;
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Watch page: remember our count right after a like/unlike so the cards show it at once. */
export function noteSiteLike(id: string, count: number): void {
  if (typeof window === "undefined" || !id || !Number.isFinite(count)) return;
  const n = Math.max(0, Math.floor(count));
  const now = Date.now();
  try {
    const rec = readRecent();
    for (const k of Object.keys(rec)) {
      if (now - Number(rec[k]?.at || 0) > RECENT_MS) delete rec[k];
    }
    rec[id] = { n, at: now };
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(rec));
  } catch {
    /* storage full / blocked: the live feed still catches up within a minute */
  }
  emit();
}

function siteLikesNow(id: string): number | null {
  const mine = readRecent()[id];
  const now = Date.now();
  if (mine && now - Number(mine.at) < RECENT_MS && (!live || liveAt < Number(mine.at) + RECENT_WINS_MS)) {
    return mine.n;
  }
  if (live) return live[id] || 0;
  return null;
}

/**
 * Our likes for one card. First render = server snapshot (no hydration mismatch); after mount the
 * live count replaces it.
 */
export function useSiteLikes(id: string, snapshot: number | null | undefined): number {
  const base = typeof snapshot === "number" && snapshot > 0 ? snapshot : 0;
  const [n, setN] = useState(base);
  useEffect(() => {
    const update = () => {
      const v = siteLikesNow(id);
      setN(v == null ? base : v);
    };
    listeners.add(update);
    update();
    loadLive();
    return () => {
      listeners.delete(update);
    };
  }, [id, base]);
  return n;
}
