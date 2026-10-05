"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

export type ChartDay = { day: string; views: number; unique: number; peak: number };

const VIEWS_COLOR = "#34d399"; // emerald-400
const UNIQUE_COLOR = "#38bdf8"; // sky-400
const PEAK_COLOR = "#fbbf24"; // amber-400

function fmt(n: number): string {
  return Math.max(0, Number(n) || 0).toLocaleString("id-ID");
}

/** 'YYYY-MM-DD' is already a WIB calendar day — format it without tz shifting. */
function wibDate(day: string, opts: Intl.DateTimeFormatOptions): string {
  try {
    return new Date(`${day}T00:00:00Z`).toLocaleDateString("id-ID", { timeZone: "UTC", ...opts });
  } catch {
    return day;
  }
}

/** Nice round axis max (1, 2, 2.5, 5 × 10^n). */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= v) return m * pow;
  }
  return 10 * pow;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}jt`;
  if (n >= 1000) return `${(n / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}rb`;
  return String(Math.round(n));
}

function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.round(el.getBoundingClientRect().width));
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * 14-day chart: bars = tayang (left axis), line = unik (right axis), plus a
 * small peak-online sparkline. Pure inline SVG, no chart dependency.
 * `days` comes newest-first from the API; rendered oldest → newest.
 */
export function OwnerChart({ days }: { days: ChartDay[] }) {
  const series = useMemo(() => days.slice().reverse(), [days]);
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const active = sel != null && sel < series.length ? sel : series.length - 1;

  if (!series.length) return null;

  const W = Math.max(260, width || 320);
  const H = 190;
  const pad = { top: 12, right: 34, bottom: 30, left: 34 };
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;
  const n = series.length;
  const slot = iw / n;
  const barW = Math.max(4, Math.min(28, slot * 0.62));

  const maxViews = niceMax(Math.max(...series.map((d) => d.views)));
  const maxUnique = niceMax(Math.max(...series.map((d) => d.unique)));
  const x = (i: number) => pad.left + slot * i + slot / 2;
  const yV = (v: number) => pad.top + ih - (v / maxViews) * ih;
  const yU = (v: number) => pad.top + ih - (v / maxUnique) * ih;

  const linePts = series.map((d, i) => `${x(i).toFixed(1)},${yU(d.unique).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  // On narrow phones label every other day (always keep the last = today).
  const labelEvery = slot < 22 ? 2 : 1;

  const cur = series[active];
  const peakMax = Math.max(1, ...series.map((d) => d.peak));
  const SW = W;
  const SH = 44;
  const sx = (i: number) => pad.left + slot * i + slot / 2;
  const sy = (v: number) => 6 + (SH - 14) - (v / peakMax) * (SH - 14);
  const peakPts = series.map((d, i) => `${sx(i).toFixed(1)},${sy(d.peak).toFixed(1)}`).join(" ");

  function pick(clientX: number, target: SVGSVGElement) {
    const rect = target.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.floor((px - pad.left) / slot);
    if (i >= 0 && i < n) setSel(i);
  }

  return (
    <div ref={wrapRef} className="w-full select-none">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm text-zinc-200">
          {active === n - 1 ? "Hari ini" : wibDate(cur.day, { weekday: "short", day: "numeric", month: "short" })}
          <span className="ml-2 text-[11px] text-zinc-600">{cur.day}</span>
        </p>
        <p className="text-xs tabular-nums text-zinc-400">
          <span style={{ color: VIEWS_COLOR }}>{fmt(cur.views)}</span> tayang ·{" "}
          <span style={{ color: UNIQUE_COLOR }}>{fmt(cur.unique)}</span> unik ·{" "}
          <span style={{ color: PEAK_COLOR }}>{fmt(cur.peak)}</span> puncak
        </p>
      </div>

      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Grafik tayang dan pengunjung unik 14 hari (WIB)"
        className="block max-w-full touch-pan-y"
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse") pick(e.clientX, e.currentTarget);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setSel(null);
        }}
      >
        {ticks.map((t) => {
          const y = pad.top + ih - t * ih;
          return (
            <g key={t}>
              <line x1={pad.left} x2={W - pad.right} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" />
              <text x={pad.left - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#71717a">
                {compact(maxViews * t)}
              </text>
              <text x={W - pad.right + 6} y={y + 3} textAnchor="start" fontSize="10" fill="#71717a">
                {compact(maxUnique * t)}
              </text>
            </g>
          );
        })}

        {series.map((d, i) => {
          const y = yV(d.views);
          const h = Math.max(d.views > 0 ? 2 : 0, pad.top + ih - y);
          const isActive = i === active;
          return (
            <g key={d.day}>
              {isActive ? (
                <rect x={pad.left + slot * i} y={pad.top} width={slot} height={ih} fill="rgba(255,255,255,0.04)" rx={4} />
              ) : null}
              <rect
                x={x(i) - barW / 2}
                y={pad.top + ih - h}
                width={barW}
                height={h}
                rx={Math.min(4, barW / 3)}
                fill={VIEWS_COLOR}
                opacity={isActive ? 0.95 : 0.55}
              />
            </g>
          );
        })}

        <polyline points={linePts} fill="none" stroke={UNIQUE_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {series.map((d, i) => (
          <circle
            key={`u-${d.day}`}
            cx={x(i)}
            cy={yU(d.unique)}
            r={i === active ? 4 : 2.5}
            fill={i === active ? UNIQUE_COLOR : "#141416"}
            stroke={UNIQUE_COLOR}
            strokeWidth={1.5}
          />
        ))}

        {series.map((d, i) => {
          const show = i === n - 1 || (n - 1 - i) % labelEvery === 0;
          if (!show) return null;
          const dd = Number(d.day.slice(8, 10));
          // Month name under the first shown label and wherever the month changes.
          const prevShown = i - labelEvery >= 0 ? series[i - labelEvery] : undefined;
          const first = !prevShown || d.day.slice(5, 7) !== prevShown.day.slice(5, 7);
          return (
            <g key={`x-${d.day}`}>
              <text
                x={x(i)}
                y={H - pad.bottom + 14}
                textAnchor="middle"
                fontSize="10"
                fill={i === active ? "#e4e4e7" : "#71717a"}
                fontWeight={i === n - 1 ? 600 : 400}
              >
                {dd}
              </text>
              {first ? (
                <text x={x(i)} y={H - pad.bottom + 26} textAnchor="middle" fontSize="9" fill="#52525b">
                  {wibDate(d.day, { month: "short" })}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: VIEWS_COLOR }} />
          Tayang (kiri)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 rounded" style={{ backgroundColor: UNIQUE_COLOR }} />
          Unik (kanan)
        </span>
        <span className="text-zinc-600">Tanggal WIB · ketuk batang untuk detail</span>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between text-[11px] uppercase tracking-[0.14em] text-zinc-500">
          <span>Puncak online / hari</span>
          <span className="normal-case tracking-normal tabular-nums text-zinc-400">
            maks <span style={{ color: PEAK_COLOR }}>{fmt(peakMax)}</span>
          </span>
        </div>
        <svg width={SW} height={SH} viewBox={`0 0 ${SW} ${SH}`} className="mt-1 block max-w-full" aria-hidden="true">
          <line x1={pad.left} x2={SW - pad.right} y1={SH - 8} y2={SH - 8} stroke="rgba(255,255,255,0.06)" />
          <polyline points={peakPts} fill="none" stroke={PEAK_COLOR} strokeWidth={1.75} strokeLinejoin="round" />
          {series.map((d, i) => (
            <circle key={`p-${d.day}`} cx={sx(i)} cy={sy(d.peak)} r={i === active ? 3.5 : 2} fill={PEAK_COLOR} opacity={i === active ? 1 : 0.7} />
          ))}
        </svg>
      </div>
    </div>
  );
}
