import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VideoCard as VideoCardType } from "@/lib/catalog/types";
import { BRAND_POSTER, VideoThumb } from "./thumb";

const ROTATE_MS = 5 * 60 * 1000;
const MAX_DOTS = 8;

type HeroProps = {
  video?: VideoCardType;
  videos?: VideoCardType[];
  intervalMs?: number;
};

function isSpamDescription(text: string | null | undefined): boolean {
  const t = (text || "").trim();
  if (!t) return true;
  return /nonton .+ bokep indo|streaming amatir, jilbab|konten 18\+/i.test(t);
}

function isUsableThumb(src: string | null | undefined): boolean {
  if (!src) return false;
  if (src === BRAND_POSTER || /brand-poster/i.test(src)) return false;
  if (/\.(mp4|mov|webm)(\?|$)/i.test(src) || /cdn\.videy\.co\//i.test(src)) return false;
  return /^https?:\/\//i.test(src) || src.startsWith("/");
}

function cleanHeroTitle(raw: string): string {
  let t = String(raw || "").trim();
  t = t.replace(/\s*[\(\[]\s*koleksi\s*dr\.?\s*pinguin[^\)\]]*[\)\]]/gi, "");
  t = t.replace(/\s*[\-|–]\s*koleksi\s*dr\.?\s*pinguin.*$/gi, "");
  t = t.replace(/\s*,\s*M\.?S\.?B\.?\s*$/gi, "");
  t = t.replace(/\s+/g, " ").trim();
  return t || raw || "Video";
}

export function Hero({ video, videos, intervalMs = ROTATE_MS }: HeroProps) {
  const incoming = videos && videos.length > 0 ? videos : video ? [video] : [];
  const list = useMemo(() => incoming.filter((v) => isUsableThumb(v.thumbnail)), [incoming]);
  const listKey = list.map((v) => v.id).join("|");
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const [index, setIndex] = useState(0);

  const usable = useMemo(() => {
    return list.filter((v) => !failedIds.has(v.id));
  }, [list, failedIds, listKey]);

  const usableKey = usable.map((v) => v.id).join("|");

  const goTo = useCallback(
    (nextIdx: number) => {
      const len = usable.length;
      if (len <= 0) return;
      const next = ((nextIdx % len) + len) % len;
      setIndex((prev) => (prev === next ? prev : next));
    },
    [usable.length],
  );

  useEffect(() => {
    if (usable.length <= 1) {
      setIndex(0);
      return;
    }
    const tick = () => {
      const next = Math.floor(Date.now() / intervalMs) % usable.length;
      goTo(next);
    };
    tick();
    const wait = Math.max(1000, intervalMs - (Date.now() % intervalMs) + 40);
    let timeoutId = window.setTimeout(function arm() {
      tick();
      timeoutId = window.setTimeout(arm, intervalMs);
    }, wait);
    return () => window.clearTimeout(timeoutId);
  }, [usableKey, usable.length, intervalMs, goTo]);

  useEffect(() => {
    if (!usable.length) return;
    if (index >= usable.length) setIndex(0);
  }, [usable.length, index]);

  const current = usable[Math.min(index, Math.max(0, usable.length - 1))];

  const onThumbUnavailable = useCallback(() => {
    if (!current) return;
    const id = current.id;
    setFailedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, [current]);

  if (!current) return null;

  const showDuration = Boolean(current.durationLabel && current.durationLabel !== "\u2014");
  const showDescription = !isSpamDescription(current.description);
  const displayIndex = Math.min(index, Math.max(0, usable.length - 1));
  const heroTitle = cleanHeroTitle(current.title);
  const dotCount = Math.min(usable.length, MAX_DOTS);
  const activeDot = displayIndex % dotCount;

  return (
    <section className="relative overflow-hidden rounded-2xl bg-surface sm:rounded-[28px]" aria-roledescription="carousel">
      <div className="relative aspect-[16/10] sm:aspect-[16/9] lg:aspect-[21/9]">
        <VideoThumb
          key={current.id}
          src={current.thumbnail}
          alt={heroTitle}
          eager
          className="size-full object-cover object-center transition-opacity duration-300"
          onUnavailable={onThumbUnavailable}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent sm:via-background/50 sm:to-background/10" />

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3.5 pb-8 sm:gap-4 sm:p-8 sm:pb-10 lg:max-w-2xl lg:p-10 lg:pb-12">
          <p className="hidden text-xs font-medium uppercase tracking-[0.18em] text-muted sm:block">
            Pilihan koleksi
            {usable.length > 1 ? (
              <span className="ml-2 tabular-nums text-muted/70">
                {displayIndex + 1}/{usable.length}
              </span>
            ) : null}
          </p>
          <h1 className="font-display text-[1.35rem] leading-snug text-foreground line-clamp-2 sm:line-clamp-none sm:text-4xl sm:leading-[1.1] lg:text-5xl">
            {heroTitle}
          </h1>
          {showDescription ? (
            <p className="hidden line-clamp-2 max-w-xl text-sm leading-relaxed text-muted sm:block">
              {current.description}
            </p>
          ) : null}
          <div className="hidden flex-wrap items-center gap-3 text-xs text-muted sm:flex">
            {current.year ? <span>{current.year}</span> : null}
            {showDuration ? <span>{current.durationLabel}</span> : null}
            {current.category ? <span>{current.category}</span> : null}
          </div>
          <div className="pt-0.5">
            <Button asChild size="default" className="h-10 rounded-full px-4 text-sm sm:h-11 sm:rounded-lg sm:px-5 sm:text-base">
              <Link to="/watch/$id" params={{ id: current.id }}>
                <Play className="size-3.5 fill-current sm:size-4" style={{ marginLeft: 2 }} />
                Putar sekarang
              </Link>
            </Button>
          </div>
        </div>

        {usable.length > 1 ? (
          <div
            className="absolute inset-x-0 bottom-2.5 z-10 flex items-center justify-center gap-1.5 sm:bottom-4 sm:gap-2"
            role="tablist"
            aria-label="Pilihan hero"
          >
            {usable.slice(0, MAX_DOTS).map((v, i) => {
              const active = i === activeDot;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={`Slide ${i + 1}`}
                  onClick={() => goTo(i)}
                  className={`rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active
                      ? "h-1.5 w-4 bg-foreground/90 sm:h-2 sm:w-5"
                      : "h-1.5 w-1.5 bg-foreground/35 hover:bg-foreground/55 sm:h-2 sm:w-2"
                  }`}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
