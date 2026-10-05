"use client";

import { Stat, fmt, presenceLabel, type OwnerStats } from "@/components/owner-dashboard-shared";
import { OwnerTools } from "@/components/owner-tools";

export function OwnerAuthedTop(props: {
  online: number;
  stats: OwnerStats | null;
  tickAt: number;
  error: string | null;
  vsUniq: string | null;
  vsViews: string | null;
  secret: string;
}) {
  const { online, stats, tickAt, error, vsUniq, vsViews, secret } = props;
  return (
    <>
      <section className="rounded-2xl border border-white/[0.08] bg-[#141416] px-6 py-8 text-center">
              <div className="flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/60" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                </span>
                Sedang di situs
              </div>
              <p className="mt-3 font-display text-7xl tabular-nums leading-none text-zinc-50">{fmt(online)}</p>
              <p className="mt-3 text-sm text-zinc-500">tab aktif manusia ±2 menit</p>
              <p className="mt-2 text-[11px] text-zinc-600">
                {presenceLabel(stats?.presence)}
                {tickAt ? ` · update ${new Date(tickAt).toLocaleTimeString("id-ID")}` : ""}
              </p>
              {stats?.hint ? <p className="mt-3 text-xs text-amber-400/90">{stats.hint}</p> : null}
              {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
            </section>

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Unik hari ini" value={fmt(stats?.uniqueToday)} hint={vsUniq} />
              <Stat label="Tayang hari ini" value={fmt(stats?.viewsToday)} hint={vsViews} />
              <Stat label="Puncak hari ini" value={fmt(stats?.peakToday)} />
              <Stat label="Kemarin" value={fmt(stats?.yesterdayViews)} />
              <Stat label="7 hari" value={fmt(stats?.views7d)} />
            </section>

            <OwnerTools secret={secret} />
    </>
  );
}
