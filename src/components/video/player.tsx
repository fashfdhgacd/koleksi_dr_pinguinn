import { startTransition, useEffect, useMemo, useRef, useState } from "react";
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

type PlayerEvent = "start" | "load_timeout" | "st_error" | "video_error" | "retry" | "open_source" | "report";

type GoneMap = Record<string, { host?: string; since?: string }>;
const GONE: GoneMap = ((deadSources as { gone?: GoneMap }).gone || {}) as GoneMap;

/** Ms without a sign of life before the calm "belum bisa diputar" overlay. */
const STREAMTAPE_WAIT_MS = 8000;
const IFRAME_WAIT_MS = 12000;

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

/** Warm up DNS/TLS to the player's host when the visitor is about to tap play. */
function preconnect(url: string | null): void {
  if (!url || typeof document === "undefined") return;
  try {
    const origin = new URL(url, window.location.href).origin;
    if (origin === window.location.origin || preconnected.has(origin)) return;
    preconnected.add(origin);
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = origin;
    document.head.appendChild(link);
  } catch {
    /* ignore */
  }
}

const LOG_KEY = "kdp-plog";
const loggedMem = new Set<string>();

/** One beacon per video+event per browser session; "start" is sampled 1 in 4 (counted x4). */
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
      window.sessionStorage.setItem(LOG_KEY, JSON.stringify(seen.slice(-200)));
    }
  } catch {
    /* private mode: the in-memory set still limits this page */
  }
  if (event === "start" && Math.random() >= 0.25) return;
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
  const [embedReady, setEmbedReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fallbackAt, setFallbackAt] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [stalled, setStalled] = useState(false);
  const [reported, setReported] = useState(false);
  const [forcePlay, setForcePlay] = useState(false);
  const frameLoadedRef = useRef(false);
  const stReadyRef = useRef(false);
  const playedRef = useRef(false);
  const touchedRef = useRef(false);

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

  useEffect(() => {
    setActive(0);
    setFailed(false);
    setFallbackAt(0);
    setBuffering(false);
    setEmbedReady(false);
    setStarted(false);
    setAttempt(0);
    setStalled(false);
    setReported(false);
    setForcePlay(false);
  }, [item.id]);

  useEffect(() => {
    if (!started || useVideo || embedReady) return;
    const t = window.setTimeout(() => setEmbedReady(true), 800);
    return () => window.clearTimeout(t);
  }, [started, useVideo, embedReady, playUrl]);

  // New iframe (start, retry, other source): reset the "sign of life" flags.
  useEffect(() => {
    frameLoadedRef.current = false;
    stReadyRef.current = false;
    playedRef.current = false;
    touchedRef.current = false;
  }, [frameSrc, attempt]);

  // A tap inside the player moves focus into the iframe (window blur). That means the player is
  // there and answering, even when its page (ads) is still loading, so no failure overlay.
  useEffect(() => {
    if (!started || useVideo) return;
    function onBlur() {
      window.setTimeout(() => {
        if (frameRef.current && document.activeElement === frameRef.current) {
          touchedRef.current = true;
          setStalled(false);
        }
      }, 0);
    }
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [started, useVideo]);

  // No sign of life in time -> calm failure overlay (the iframe keeps running underneath).
  useEffect(() => {
    if (!started || useVideo || !playUrl) return;
    const wait = streamtape ? STREAMTAPE_WAIT_MS : IFRAME_WAIT_MS;
    const t = window.setTimeout(() => {
      const alive = touchedRef.current || (streamtape ? stReadyRef.current : frameLoadedRef.current);
      if (alive) return;
      setStalled(true);
      logPlayerEvent(item.id, host, "load_timeout");
    }, wait);
    return () => window.clearTimeout(t);
  }, [started, useVideo, playUrl, streamtape, attempt, item.id, host]);

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
        stReadyRef.current = true;
        setStalled(false);
        for (const ev of ["play", "error"]) {
          frame.contentWindow.postMessage(
            JSON.stringify({ context: "player.js", version: "0.0.11", method: "addEventListener", value: ev, listener: `kdp-${ev}` }),
            e.origin || "*",
          );
        }
      } else if (msg.event === "play") {
        stReadyRef.current = true;
        playedRef.current = true;
        setStalled(false);
      } else if (msg.event === "error" && !playedRef.current) {
        setStalled(true);
        logPlayerEvent(item.id, "Streamtape", "st_error");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [started, streamtape, attempt, item.id]);

  function start() {
    if (!current || !playUrl) {
      startTransition(() => setFailed(true));
      return;
    }
    logPlayerEvent(item.id, host, "start");
    startTransition(() => {
      setFailed(false);
      setStalled(false);
      setStarted(true);
      setEmbedReady(false);
      setBuffering(useVideo);
    });
  }

  function pickSource(index: number) {
    setActive(index);
    setFallbackAt(0);
    setFailed(false);
    setStalled(false);
    setStarted(true);
    setEmbedReady(false);
    setBuffering(isFileUrl(list[index]?.url ?? null));
  }

  function retryQuiet() {
    logPlayerEvent(item.id, host, "retry");
    if (active + 1 < list.length) {
      pickSource(active + 1);
      return;
    }
    setFailed(false);
    setFallbackAt(0);
    setStarted(true);
    setEmbedReady(false);
  }

  /** Reload the current player (iframe remount / video reload). */
  function retryCurrent() {
    logPlayerEvent(item.id, host, "retry");
    setFailed(false);
    setStalled(false);
    setEmbedReady(false);
    setStarted(true);
    setBuffering(useVideo);
    setAttempt((n) => n + 1);
  }

  function openSource() {
    if (!playUrl) return;
    logPlayerEvent(item.id, host, "open_source");
    window.open(playUrl, "_blank", "noopener"); // keep the referrer so the host sees koleksidrpinguin.com
  }

  function report() {
    if (reported) return;
    logPlayerEvent(item.id, host, "report");
    setReported(true);
  }

  const linkBtn =
    "underline-offset-2 hover:text-foreground hover:underline disabled:no-underline disabled:opacity-60";

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
            <iframe
              ref={frameRef}
              key={`${frameSrc}#${attempt}`}
              src={frameSrc}
              title={item.title}
              className="absolute inset-0 size-full border-0 bg-background"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              loading="eager"
              onLoad={() => {
                frameLoadedRef.current = true;
                setEmbedReady(true);
                if (!streamtape) setStalled(false);
              }}
            />
            {!embedReady ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40">
                <LoaderCircle className="size-8 animate-spin text-foreground" />
              </div>
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
              logPlayerEvent(item.id, host, "video_error");
            }}
          />
        )}

        {buffering && started && useVideo ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/30">
            <LoaderCircle className="size-8 animate-spin text-foreground" />
          </div>
        ) : null}

        {started && stalled && !failed && !useVideo ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90 px-6 text-center">
            <p className="text-sm font-medium text-foreground">Video belum bisa diputar</p>
            <p className="max-w-sm text-xs text-muted">
              Pemutar dari {hostName} belum merespons. Coba lagi, atau buka langsung di situs sumbernya.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={retryCurrent}>
                Coba lagi
              </Button>
              <Button size="sm" variant="outline" onClick={openSource}>
                Buka di {hostName}
              </Button>
              <Button size="sm" variant="ghost" onClick={report} disabled={reported}>
                {reported ? "Laporan terkirim" : "Laporkan"}
              </Button>
            </div>
            <button
              type="button"
              className="text-[11px] text-muted underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => setStalled(false)}
            >
              Tutup
            </button>
          </div>
        ) : null}

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
      {started && playUrl && !failed ? (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-3 py-2 text-[11px] leading-snug text-muted sm:text-xs">
          <span>Belum jalan?</span>
          <button type="button" className={linkBtn} onClick={retryCurrent}>
            Coba lagi
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" className={linkBtn} onClick={openSource}>
            Buka sumber
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" className={linkBtn} onClick={report} disabled={reported}>
            {reported ? "Laporan terkirim" : "Lapor"}
          </button>
        </p>
      ) : null}
    </div>
  );
}
