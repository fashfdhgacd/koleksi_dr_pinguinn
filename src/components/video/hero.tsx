import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VideoCard as VideoCardType } from "@/lib/catalog/types";
import { BRAND_POSTER, VideoThumb } from "./thumb";

const ROTATE_MS = 5 * 60 * 1000; // 5 menit

type HeroProps = {
  /** Satu video (kompatibel lama) atau daftar untuk auto-rotate */
  video?: VideoCardType;
  videos?: VideoCardType[];
  /** Interval ganti hero dalam ms (default 5 menit) */
  intervalMs?: number;
};

function isSpamDescription(text: string | null | undefined): boolean {
  const t = (text || "").trim();
  if (!t) return true;
  return /nonton .+ bokep indo|streaming amatir, jilbab|konten 18\+/i.test(t);
}

function isBrandOrEmptyThumb(src: string | null | undefined): boolean {
  if (!src) return true;
  return src === BRAND_POSTER || /brand-poster/i.test(src);
}

export function Hero({ video, videos, intervalMs = ROTATE_MS }: HeroProps) {
  const list =
    videos && videos.length > 0 ? videos : video ? [video] : [];

  const listKey = list.map((v) => v.id).join("|");
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const [index, setIndex] = useState(() =>
    list.length ? Math.floor(Date.now() / intervalMs) % list.length : 0,
  );
  const [fade, setFade] = useState(true);

  const usable = useMemo(() => {
    const filtered = list.filter(
      (v) => !failedIds.has(v.id) && !isBrandOrEmptyThumb(v.thumbnail),
    );
    return filtered.length ? filtered : list;
  }, [list, failedIds, listKey]);

  const usableKey = usable.map((v) => v.id).join("|");

  const goTo = useCallback(
    (nextIdx: number, soft = true) => {
      const len = usable.length;
      if (len <= 0) return;
      const next = ((nextIdx % len) + len) % len;
      setIndex((prev) => {
        if (prev === next) return prev;
        if (soft) {
          setFade(false);
          window.setTimeout(() => setFade(true), 320);
        }
        return next;
      });
    },
    [usable.length],
  );

  // Wall-clock slot: hero maju tiap intervalMs meski silent refetch/remount.
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

  // Keep index in range when usable list shrinks (skip-on-fail).
  useEffect(() => {
    if (!usable.length) return;
    if (index >= usable.length) {
      setFade(false);
      setIndex(0);
      window.setTimeout(() => setFade(true), 320);
    }
  }, [usable.length, index]);

  const current = usable[Math.min(index, Math.max(0, usable.length - 1))];

  const onThumbUnavailable = useCallback(() => {
    if (!current) return;
    const id = current.id;
    // Tandai gagal → `usable` menyusut; index di-clamp supaya auto loncat ke slide ber-art.
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

  return (
    <section className="relative overflow-hidden rounded-[28px] bg-surface">
      <div
        className={`relative aspect-[16/9] transition-opacity duration-300 sm:aspect-[16/9] lg:aspect-[21/9] ${
          fade ? "opacity-100" : "opacity-0"
        }`}
      >
        <VideoThumb
          key={current.id}
          src={current.thumbnail}
          alt={current.title}
          eager
          className="size-full object-cover object-center"
          onUnavailable={onThumbUnavailable}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/10" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5 sm:gap-4 sm:p-8 lg:max-w-2xl lg:p-10">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Pilihan koleksi
            {usable.length > 1 ? (
              <span className="ml-2 tabular-nums text-muted/70">
                {displayIndex + 1}/{usable.length}
              </span>
            ) : null}
          </p>
          <h1 className="font-display text-3xl leading-[1.1] text-foreground sm:text-4xl lg:text-5xl">
            {current.title}
          </h1>
          {showDescription ? (
            <p className="line-clamp-2 max-w-xl text-sm leading-relaxed text-muted">
              {current.description}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            {current.year ? <span>{current.year}</span> : null}
            {showDuration ? <span>{current.durationLabel}</span> : null}
            {current.category ? <span>{current.category}</span> : null}
          </div>
          <div>
            <Button asChild size="lg" className="rounded-lg pl-5 pr-4">
              <Link to="/watch/$id" params={{ id: current.id }}>
                <Play className="size-4 fill-current" style={{ marginLeft: 2 }} />
                Putar sekarang
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {usable.length > 1 ? (
        <div className="pointer-events-none absolute bottom-3 right-4 flex gap-1.5 sm:bottom-5 sm:right-6">
          {usable.slice(0, 8).map((v, i) => (
            <span
              key={v.id}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === displayIndex % Math.min(usable.length, 8)
                  ? "w-4 bg-foreground/80"
                  : "w-1.5 bg-foreground/25"
              }`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
