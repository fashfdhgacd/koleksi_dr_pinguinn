import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VideoDetail } from "@/lib/catalog/types";
import { hostPriority, resolveSource, type ResolvedSource } from "@/lib/catalog/embed";
import deadSources from "@/lib/catalog/dead-sources.json";
import { VideoThumb } from "./thumb";

/*
 * Embed rules (owner decision, 2026-10-08):
 *  - IndoAV / UserBokep / Putarin: their native iframe, src exactly as resolved (no params), loaded
 *    only after the visitor taps play. Only the UI around the iframe is ours.
 *  - Streamtape: native iframe plus its official ?color= and ?thumb= params, and a Player.js
 *    listener ("ready"/"play"/"error") so we know when the player really came up.
 *
 * Slow players (2026-10-09): IndoAV/UserBokep often take 10-25 s before the iframe "load" event
 * (their player is on screen after ~0.3 s; the event waits for third-party scripts), and an
 * uncached embed page can take ~10 s to arrive from their origin (sometimes Cloudflare 522).
 * On Android Chrome the iframe then paints a plain black box before the host's poster and play
 * button show up. So:
 *  - Our poster + spinner + "Sedang memuat player..." sit ABOVE the iframe with
 *    pointer-events:none (every tap still reaches the host player). They go away ~0.7 s after the
 *    host page is there (iframe has child frames, "load", or Streamtape Player.js "ready"), when the
 *    visitor taps into a loaded player, or after 8 s at the latest.
 *  - If the host page still has not arrived after 8 s, the same poster stays visible UNDER the
 *    (still empty, transparent) iframe with a seconds counter, plus a small corner label.
 *  - Once the host page is there: a short "Ketuk sekali lagi untuk memutar" label (their players
 *    need their own play tap).
 *  - After 20 s without a sign of life a small hint bar appears BELOW the player (Coba lagi / Buka
 *    di host / Coba server lain / Lapor).
 * The embed page is still only requested after the visitor taps play (Origin counting); before
 * that we only preconnect (DNS/TLS, no HTTP request).
 */

function sourcesFromItem(item: VideoDetail): ResolvedSource[] {
  const raw = [item.video_url, ...item.qualities.map((q) => q.url)].filter((u): u is string => Boolean(u));
  const seen = new Set<string>();
  const out: ResolvedSource[] = [];
  for (const url of raw) {
    const resolved = resolveSource(url);
    if (!resolved || seen.has(resolved.url)) continue;
    seen.add(resolved.url);
    out.push(resolved);
  }
  out.sort((a, b) => hostPriority(`${a.host} ${a.url}`) - hostPriority(`${b.host} ${b.url}`));
  return out;
}

function isFileUrl(url: string | null): boolean {
  return Boolean(url && /\.(mp4|mov|webm)($|\?)/i.test(url));
}

function normalizePlayUrl(url: string, host: string): string {
  try {
    const u = new URL(url);
    const blob = `${host} ${u.hostname} ${u.pathname}`;
    if (/streamtape|strcloud|puterin|putarin|indoav|userbokep|lulu/i.test(blob)) {
      u.pathname = u.pathname.replace(/\/(?:v|d|watch)\//, "/e/");
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

type PlayerEvent = "start2" | "slow2" | "fail2" | "retry2" | "open2" | "report2" | "alt2";

type GoneMap = Record<string, { host?: string; since?: string }>;
const GONE: GoneMap = ((deadSources as { gone?: GoneMap }).gone || {}) as GoneMap;

/** Ms without a sign of life before the (non-blocking) hint bar under the player. */
const SLOW_HINT_MS = 20000;
/** Visitor stayed this long after tapping play without acting: count as slow, not failed. */
const STAYED_MS = 60000;
/** Our loading cover above the iframe: removed this long after the host page is there... */
const PAINT_GRACE_MS = 700;
/** ...and never shown longer than this. */
const COVER_CAP_MS = 8000;
/** "Ketuk sekali lagi untuk memutar" label duration. */
const TAP_HINT_MS = 7000;

function displayHost(host: string): string {
  if (host === "Puterin") return "Putarin";
  return host || "sumber";
}

function logHost(host: string): string {
  const h = displayHost(host);
  return ["IndoAV", "UserBokep", "Streamtape", "Putarin", "Videy", "Arsip"].includes(h) ? h : "Lainnya";
}

function isStreamtape(host: string, url: string | null): boolean {
  return host === "Streamtape" || /streamtape|strcloud|streamta\.pe|tapecontent/i.test(url || "");
}

/** Streamtape only: official ?color= (amber) and ?thumb= (our poster) params. */
function streamtapeFrameUrl(url: string, thumbnail: string): string {
  let thumb = "";
  const t = String(thumbnail || "").trim();
  if (/^https?:\/\//i.test(t)) thumb = t;
  else if (t.startsWith("/") && typeof window !== "undefined") thumb = `${window.location.origin}${t}`;
  const parts: string[] = [];
  if (!/[?&]color=/.test(url)) parts.push("color=236,180,60");
  if (thumb && !/[?&]thumb=/.test(url)) parts.push(`thumb=${encodeURIComponent(thumb)}`);
  if (!parts.length) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${parts.join("&")}`;
}

const preconnected = new Set<string>();

/**
 * Warm up DNS/TLS to the player's host (dns-prefetch + preconnect). No HTTP request is sent, so
 * the host does not see a view before the visitor taps play.
 */
function preconnect(url: string | null): void {
  if (!url || typeof document === "undefined") return;
  try {
    const origin = new URL(url, window.location.href).origin;
    if (origin === window.location.origin || preconnected.has(origin)) return;
    preconnected.add(origin);
    for (const rel of ["dns-prefetch", "preconnect"]) {
      const link = document.createElement("link");
      link.rel = rel;
      link.href = origin;
      document.head.appendChild(link);
    }
  } catch {
    /* ignore */
  }
}

const LOG_KEY = "kdp-plog";
const loggedMem = new Set<string>();

/** One beacon per video+event per browser session. Unsampled, so the owner card ratios are exact. */
function logPlayerEvent(id: string, host: string, event: PlayerEvent): void {
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
  const body = JSON.stringify({ id, host: logHost(host), event });
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

type AltSource = { id: string; host: string; title: string };
const altCache = new Map<string, AltSource | null>();

/** Same video from another host (same title or JAV code), looked up only when needed. */
async function fetchAlt(id: string): Promise<AltSource | null> {
  if (altCache.has(id)) return altCache.get(id) ?? null;
  try {
    const res = await fetch(`/api/player-log?alt=${encodeURIComponent(id)}`);
    const d = (await res.json().catch(() => null)) as { ok?: boolean; alt?: AltSource | null } | null;
    const alt = d?.ok && d.alt && typeof d.alt.id === "string" ? d.alt : null;
    altCache.set(id, alt);
    return alt;
  } catch {
    return null;
  }
}

/** Amber pixel play button (16x16 grid, drawn at 4x / 5x so the pixels stay crisp). */
function PixelPlayButton() {
  return (
    <svg viewBox="0 0 16 16" className="size-16 sm:size-20" shapeRendering="crispEdges" aria-hidden="true">
      <path fill="#ecb43c" d="M2 0h12v1h1v1h1v12h-1v1h-1v1H2v-1H1v-1H0V2h1V1h1z" />
      <path fill="#16130e" d="M7 4h1v8H7zM8 5h1v6H8zM9 6h1v4H9zM10 7h1v2h-1z" />
    </svg>
  );
}

export function VideoPlayer({ item }: { item: VideoDetail }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const list = useMemo(() => sourcesFromItem(item), [item]);
  const [active, setActive] = useState(0);
  const [started, setStarted] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fallbackAt, setFallbackAt] = useState(0);
  const [attempt, setAttempt] = useState(0);
  /** 20 s without a sign of life: show the hint bar under the player. */
  const [slow, setSlow] = useState(false);
  const [stError, setStError] = useState(false);
  const [reported, setReported] = useState(false);
  const [forcePlay, setForcePlay] = useState(false);
  const [alt, setAlt] = useState<AltSource | null>(null);
  /** Host page arrived in the iframe (child frames / load / Streamtape ready). */
  const [docReady, setDocReady] = useState(false);
  /** Loading cover above the iframe (pointer-events:none). */
  const [cover, setCover] = useState(true);
  const [tapHint, setTapHint] = useState(false);
  const [waitSec, setWaitSec] = useState(0);
  const aliveRef = useRef(false);
  const docReadyRef = useRef(false);
  const attemptAtRef = useRef(0);
  const playedRef = useRef(false);
  /** Per video: when play was tapped, whether the hint showed, whether we already counted it. */
  const trackRef = useRef({ startedAt: 0, slowShown: false, settled: false });

  const current = list[active] ?? null;
  const rawPlay = current?.fallbacks[fallbackAt] ?? current?.url ?? null;
  const playUrl = rawPlay && current ? normalizePlayUrl(rawPlay, current.host) : rawPlay;
  const useVideo = isFileUrl(playUrl);
  const host = current?.host || "";
  const hostName = displayHost(host);
  const streamtape = Boolean(current) && !useVideo && isStreamtape(host, playUrl);
  const frameSrc = playUrl && streamtape && started ? streamtapeFrameUrl(playUrl, item.thumbnail) : playUrl;
  const gone = GONE[item.id];
  const showGone = Boolean(gone) && !forcePlay;
  const hasDuration = typeof item.duration === "number" && item.duration > 0 && item.durationLabel !== "—";

  /** Count this play once: "slow2" (came up late / visitor stayed) or "fail2". */
  const settle = useCallback(
    (event: "slow2" | "fail2") => {
      const t = trackRef.current;
      if (!t.startedAt || t.settled) return;
      t.settled = true;
      logPlayerEvent(item.id, host, event);
    },
    [item.id, host],
  );

  const markAlive = useCallback(() => {
    if (aliveRef.current) return;
    aliveRef.current = true;
    setSlow(false);
    if (trackRef.current.slowShown) settle("slow2");
  }, [settle]);

  /** The host page is in the iframe: count it as alive (not for Streamtape, see onLoad). */
  const markDoc = useCallback(
    (countAlive: boolean) => {
      if (countAlive) markAlive();
      if (docReadyRef.current) return;
      docReadyRef.current = true;
      setDocReady(true);
    },
    [markAlive],
  );

  useEffect(() => {
    setActive(0);
    setFailed(false);
    setFallbackAt(0);
    setBuffering(false);
    setStarted(false);
    setAttempt(0);
    setSlow(false);
    setStError(false);
    setReported(false);
    setForcePlay(false);
    setAlt(null);
    trackRef.current = { startedAt: 0, slowShown: false, settled: false };
  }, [item.id]);

  // Warm DNS/TLS to the player host as soon as the page is idle (no HTTP request, no view).
  useEffect(() => {
    if (!playUrl || useVideo) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(() => preconnect(playUrl));
      return;
    }
    const t = window.setTimeout(() => preconnect(playUrl), 300);
    return () => window.clearTimeout(t);
  }, [playUrl, useVideo]);

  // New iframe (start, retry, other source): reset the "sign of life" flags and the loading cover.
  useEffect(() => {
    aliveRef.current = false;
    playedRef.current = false;
    docReadyRef.current = false;
    attemptAtRef.current = Date.now();
    setSlow(false);
    setStError(false);
    setDocReady(false);
    setCover(true);
    setTapHint(false);
    setWaitSec(0);
  }, [frameSrc, attempt]);

  // Host page arrival: a loaded embed page creates child frames, and window.length is readable
  // cross-origin (nothing else is read). Also drives the seconds counter while waiting.
  useEffect(() => {
    if (!started || useVideo || docReady) return;
    const t = window.setInterval(() => {
      const w = frameRef.current?.contentWindow;
      let n = 0;
      try {
        n = w ? w.length : 0;
      } catch {
        n = 0;
      }
      if (n > 0) {
        markDoc(!streamtape);
        return;
      }
      setWaitSec(Math.floor((Date.now() - attemptAtRef.current) / 1000));
    }, 250);
    return () => window.clearInterval(t);
  }, [started, useVideo, docReady, streamtape, markDoc, frameSrc, attempt]);

  // Cover goes away shortly after the host page is there (time to paint its poster), then a short
  // "tap again" label, because these players need their own play tap.
  useEffect(() => {
    if (!docReady) return;
    const t1 = window.setTimeout(() => {
      setCover(false);
      setTapHint(true);
    }, PAINT_GRACE_MS);
    const t2 = window.setTimeout(() => setTapHint(false), PAINT_GRACE_MS + TAP_HINT_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [docReady]);

  // Never cover the iframe longer than 8 s.
  useEffect(() => {
    if (!started || useVideo) return;
    const t = window.setTimeout(() => setCover(false), COVER_CAP_MS);
    return () => window.clearTimeout(t);
  }, [started, useVideo, frameSrc, attempt]);

  // A tap inside a loaded player moves focus into the iframe (window blur): the player is there
  // and answering, even when its page (ads) is still loading. Before the host page arrived, a tap
  // only focuses the empty iframe, so it does not count.
  useEffect(() => {
    if (!started || useVideo) return;
    function onBlur() {
      window.setTimeout(() => {
        if (!frameRef.current || document.activeElement !== frameRef.current) return;
        if (!docReadyRef.current) return;
        markAlive();
        setCover(false);
        setTapHint(false);
      }, 0);
    }
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [started, useVideo, markAlive]);

  // No sign of life in 20 s -> hint bar under the player. The iframe stays fully usable.
  useEffect(() => {
    if (!started || useVideo || !playUrl) return;
    const t = window.setTimeout(() => {
      if (aliveRef.current) return;
      trackRef.current.slowShown = true;
      setSlow(true);
    }, SLOW_HINT_MS);
    return () => window.clearTimeout(t);
  }, [started, useVideo, playUrl, attempt]);

  // Visitor leaves (other page, tab closed) while the player never answered after the hint:
  // stayed 60 s+ -> slow (probably watching), otherwise failed. Leaving before 20 s is not counted.
  useEffect(() => {
    if (!started || useVideo) return;
    function onLeave() {
      const t = trackRef.current;
      if (!t.startedAt || t.settled || aliveRef.current) return;
      const elapsed = Date.now() - t.startedAt;
      if (elapsed < SLOW_HINT_MS) return;
      settle(elapsed >= STAYED_MS ? "slow2" : "fail2");
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") onLeave();
    }
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      onLeave(); // SPA navigation to another video unmounts this player
    };
  }, [started, useVideo, settle]);

  // Look up the same video on another host once the visitor might need it.
  useEffect(() => {
    if (!slow && !stError && !failed) return;
    let live = true;
    void fetchAlt(item.id).then((a) => {
      if (live) setAlt(a);
    });
    return () => {
      live = false;
    };
  }, [slow, stError, failed, item.id]);

  // Streamtape Player.js: "ready" from the iframe, then subscribe to "play" and "error".
  useEffect(() => {
    if (!started || !streamtape) return;
    function onMessage(e: MessageEvent) {
      const frame = frameRef.current;
      if (!frame || !frame.contentWindow || e.source !== frame.contentWindow) return;
      let data: unknown = e.data;
      if (typeof data === "string") {
        if (data.length > 5000 || !data.includes("player.js")) return;
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      const msg = data as { context?: unknown; event?: unknown } | null;
      if (!msg || msg.context !== "player.js") return;
      if (msg.event === "ready") {
        markDoc(true);
        for (const ev of ["play", "error"]) {
          frame.contentWindow.postMessage(
            JSON.stringify({ context: "player.js", version: "0.0.11", method: "addEventListener", value: ev, listener: `kdp-${ev}` }),
            e.origin || "*",
          );
        }
      } else if (msg.event === "play") {
        playedRef.current = true;
        markDoc(true);
        setStError(false);
        setCover(false);
        setTapHint(false);
      } else if (msg.event === "error" && !playedRef.current) {
        setStError(true);
        settle("fail2");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [started, streamtape, attempt, markAlive, markDoc, settle]);

  function start() {
    if (!current || !playUrl) {
      startTransition(() => setFailed(true));
      return;
    }
    preconnect(playUrl);
    if (!trackRef.current.startedAt) trackRef.current.startedAt = Date.now();
    logPlayerEvent(item.id, host, "start2");
    startTransition(() => {
      setFailed(false);
      setStarted(true);
      setBuffering(useVideo);
    });
  }

  function pickSource(index: number) {
    setActive(index);
    setFallbackAt(0);
    setFailed(false);
    setStarted(true);
    setBuffering(isFileUrl(list[index]?.url ?? null));
  }

  /** Visitor acted because the player did not work: the action, plus one "fail2" for this play. */
  function acted(event: "retry2" | "open2" | "report2" | "alt2") {
    logPlayerEvent(item.id, host, event);
    settle("fail2");
  }

  function retryQuiet() {
    acted("retry2");
    if (active + 1 < list.length) {
      pickSource(active + 1);
      return;
    }
    setFailed(false);
    setFallbackAt(0);
    setStarted(true);
    setAttempt((n) => n + 1);
  }

  /** Reload the current player (iframe remount / video reload). Same URL, nothing added. */
  function retryCurrent() {
    acted("retry2");
    setFailed(false);
    setStarted(true);
    setBuffering(useVideo);
    setAttempt((n) => n + 1);
  }

  function openSource() {
    if (!playUrl) return;
    acted("open2");
    window.open(playUrl, "_blank", "noopener"); // keep the referrer so the host sees koleksidrpinguin.com
  }

  function report() {
    if (reported) return;
    acted("report2");
    setReported(true);
  }

  const linkBtn =
    "underline-offset-2 hover:text-foreground hover:underline disabled:no-underline disabled:opacity-60";
  const hintBtn =
    "rounded-md border border-white/15 px-2 py-1 text-[11px] text-foreground hover:bg-white/10 disabled:opacity-60 sm:text-xs";
  const showHint = started && !useVideo && Boolean(playUrl) && !failed && (slow || stError);

  /** Our poster + spinner + status text (used above the iframe as a cover, or under it). */
  function loadingLayer(pos: string) {
    let line = attempt > 0 ? `Memuat ulang player ${hostName}…` : `Sedang memuat player ${hostName}…`;
    if (waitSec >= 12) line = `Server ${hostName} sedang lambat, masih menunggu…`;
    return (
      <div className={`pointer-events-none ${pos} bg-background`} aria-hidden="true">
        <VideoThumb src={item.thumbnail} alt="" eager className="size-full object-cover opacity-50" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 px-6 text-center">
          <LoaderCircle className="size-7 animate-spin text-white" />
          <p className="text-xs text-white sm:text-sm">{line}</p>
          {waitSec >= 3 ? (
            <p className="text-[11px] tabular-nums text-zinc-300">
              {waitSec} dtk{attempt > 0 ? ` · percobaan ${attempt + 1}` : ""}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-surface">
      <div className="relative aspect-video max-h-[min(70vh,720px)] w-full bg-background sm:mx-auto">
        {!started ? (
          <>
            <VideoThumb src={item.thumbnail} alt={item.title} eager className="size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
            {current ? (
              <span className="pointer-events-none absolute left-3 top-3 rounded bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-zinc-200">
                {hostName}
              </span>
            ) : null}
            {hasDuration ? (
              <span className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/70 px-1.5 py-0.5 text-[11px] tabular-nums text-zinc-100">
                {item.durationLabel}
              </span>
            ) : null}
            {showGone ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 px-6 text-center">
                <p className="text-sm font-medium text-foreground">Dihapus oleh sumber</p>
                <p className="max-w-sm text-xs text-muted">
                  Video ini sudah tidak tersedia di {displayHost(gone?.host || host)}.
                </p>
                <button
                  type="button"
                  className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() => {
                    setForcePlay(true);
                    start();
                  }}
                >
                  Tetap coba putar
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="absolute inset-0 flex items-center justify-center transition-opacity hover:opacity-95 active:opacity-90"
                onClick={start}
                onPointerEnter={() => preconnect(playUrl)}
                onTouchStart={() => preconnect(playUrl)}
                onFocus={() => preconnect(playUrl)}
                disabled={!current}
                aria-label={current ? `Putar ${item.title}` : "Video tidak tersedia"}
              >
                <PixelPlayButton />
              </button>
            )}
          </>
        ) : !useVideo && frameSrc ? (
          <>
            {/* UNDER the iframe: shows through while the host page has not arrived (empty iframe). */}
            {!docReady && !cover ? loadingLayer("absolute inset-0") : null}
            <iframe
              ref={frameRef}
              key={`${frameSrc}#${attempt}`}
              src={frameSrc}
              title={item.title}
              className="absolute inset-0 size-full border-0 bg-transparent"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              loading="eager"
              onLoad={() => {
                // Streamtape: only Player.js "ready" counts as alive (an ISP block page also fires load).
                markDoc(!streamtape);
              }}
            />
            {/* ABOVE the iframe, pointer-events:none: hides the host's blank/black first paint. */}
            {cover ? loadingLayer("absolute inset-0 z-10") : null}
            {!cover && !docReady ? (
              <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/70 px-2 py-1 text-[11px] text-zinc-100">
                Masih memuat dari {hostName}… {waitSec} dtk
              </span>
            ) : null}
            {tapHint && !cover ? (
              <span className="pointer-events-none absolute inset-x-0 top-2 z-10 mx-auto w-fit rounded bg-black/70 px-2 py-1 text-[11px] text-zinc-100 sm:text-xs">
                Ketuk sekali lagi untuk memutar
              </span>
            ) : null}
          </>
        ) : (
          <video
            key={`${playUrl ?? item.id}#${attempt}`}
            ref={videoRef}
            className="size-full bg-background object-contain"
            poster={item.thumbnail || undefined}
            controls
            playsInline
            preload="metadata"
            autoPlay
            referrerPolicy="strict-origin-when-cross-origin"
            src={playUrl ?? undefined}
            onWaiting={() => setBuffering(true)}
            onPlaying={() => {
              setBuffering(false);
              setFailed(false);
              markAlive();
            }}
            onCanPlay={() => setBuffering(false)}
            onError={() => {
              const next = fallbackAt + 1;
              if (current && next < current.fallbacks.length) {
                setFallbackAt(next);
                return;
              }
              if (active + 1 < list.length) {
                pickSource(active + 1);
                return;
              }
              setBuffering(false);
              setFailed(true);
              settle("fail2");
            }}
          />
        )}

        {buffering && started && useVideo ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/30">
            <LoaderCircle className="size-8 animate-spin text-foreground" />
          </div>
        ) : null}

        {/* Direct video file only (no host player underneath): the file itself failed to load. */}
        {failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/85 px-6 text-center">
            <AlertTriangle className="size-7 text-destructive" />
            <p className="max-w-sm text-sm text-muted">Pemutar gagal. Coba lagi atau buka di situs sumbernya.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={retryQuiet}>
                Coba lagi
              </Button>
              {playUrl ? (
                <Button size="sm" variant="outline" onClick={openSource}>
                  Buka di {hostName}
                </Button>
              ) : null}
              {alt ? (
                <Button size="sm" variant="outline" asChild>
                  <Link to="/watch/$id" params={{ id: alt.id }} onClick={() => acted("alt2")}>
                    Coba server lain
                  </Link>
                </Button>
              ) : null}
              {current ? (
                <Button size="sm" variant="ghost" onClick={report} disabled={reported}>
                  {reported ? "Laporan terkirim" : "Laporkan"}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {!current && !started ? (
          <div className="absolute inset-x-0 bottom-0 p-4 text-center text-sm text-muted">
            Video tidak tersedia untuk judul ini.
          </div>
        ) : null}
      </div>
      {!started && current && current.mode === "iframe" && !showGone ? (
        <p className="px-3 py-2 text-[11px] leading-snug text-muted sm:text-xs">
          Iklan dari penyedia video ({hostName}) bisa muncul saat diputar.
        </p>
      ) : null}
      {showHint ? (
        <div className="border-l-2 border-[#ecb43c] px-3 py-2" role="status">
          <p className="text-[11px] leading-snug text-foreground sm:text-xs">
            {stError
              ? `${hostName} melaporkan error untuk video ini.`
              : attempt > 0
                ? `Server ${hostName} masih lambat. Coba server lain atau buka langsung di ${hostName}:`
                : `Player ${hostName} lambat merespons. Tunggu sebentar, atau:`}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button type="button" className={hintBtn} onClick={retryCurrent}>
              Coba lagi
            </button>
            <button type="button" className={hintBtn} onClick={openSource}>
              Buka di {hostName}
            </button>
            {alt ? (
              <Link
                to="/watch/$id"
                params={{ id: alt.id }}
                className={hintBtn}
                onClick={() => acted("alt2")}
              >
                Coba server lain ({displayHost(alt.host)})
              </Link>
            ) : null}
            <button type="button" className={hintBtn} onClick={report} disabled={reported}>
              {reported ? "Laporan terkirim" : "Lapor"}
            </button>
          </div>
        </div>
      ) : started && playUrl && !failed ? (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-3 py-2 text-[11px] leading-snug text-muted sm:text-xs">
          <span>Belum jalan?</span>
          <button type="button" className={linkBtn} onClick={retryCurrent}>
            Coba lagi
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" className={linkBtn} onClick={openSource}>
            Buka sumber
          </button>
          {alt ? (
            <>
              <span aria-hidden="true">·</span>
              <Link to="/watch/$id" params={{ id: alt.id }} className={linkBtn} onClick={() => acted("alt2")}>
                Coba server lain
              </Link>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <button type="button" className={linkBtn} onClick={report} disabled={reported}>
            {reported ? "Laporan terkirim" : "Lapor"}
          </button>
        </p>
      ) : null}
    </div>
  );
}
