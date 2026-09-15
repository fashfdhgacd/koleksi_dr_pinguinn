import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VideoCard as VideoCardType } from "@/lib/catalog/types";
import { VideoThumb } from "./thumb";

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

export function Hero({ video, videos, intervalMs = ROTATE_MS }: HeroProps) {
  const list =
    videos && videos.length > 0 ? videos : video ? [video] : [];

  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  // Reset index kalau daftar berubah
  useEffect(() => {
    setIndex(0);
    setFade(true);
  }, [list.map((v) => v.id).join("|")]);

  useEffect(() => {
    if (list.length <= 1) return;
    let timeoutId = 0;
    let fadeId = 0;
    const arm = () => {
      const wait = Math.max(1500, intervalMs - (Date.now() % intervalMs) + 50);
      timeoutId = window.setTimeout(() => {
        setFade(false);
        fadeId = window.setTimeout(() => {
          setIndex((i) => (i + 1) % list.length);
          setFade(true);
          arm();
        }, 320);
      }, wait);
    };
    arm();
    return () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(fadeId);
    };
  }, [list.length, intervalMs]);

  const current = list[index];
  if (!current) return null;

  const showDuration = Boolean(current.durationLabel && current.durationLabel !== "\u2014");
  const showDescription = !isSpamDescription(current.description);

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
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/10" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5 sm:gap-4 sm:p-8 lg:max-w-2xl lg:p-10">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
            Pilihan koleksi
            {list.length > 1 ? (
              <span className="ml-2 tabular-nums text-muted/70">
                {index + 1}/{list.length}
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

      {list.length > 1 ? (
        <div className="pointer-events-none absolute bottom-3 right-4 flex gap-1.5 sm:bottom-5 sm:right-6">
          {list.slice(0, 8).map((v, i) => (
            <span
              key={v.id}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index % Math.min(list.length, 8)
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
