"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { OwnerChart } from "@/components/owner-chart";
import { fmt, deviceLabel, dayLabel, type OwnerStats, type DeviceKind, type DayRow } from "@/components/owner-dashboard-shared";

type DeviceRow = { device: DeviceKind; views: number; pct: number };

export function OwnerAuthedBottom(props: {
  days: DayRow[];
  devices: DeviceRow[];
  stats: OwnerStats | null;
  secret: string;
  loading: boolean;
  fetchOnline: (key: string, quiet?: boolean) => Promise<void>;
  logout: () => void;
  /** Collapsed owner sections rendered after the statistics block (player error, hidden list, poster, bot). */
  beforeFooter?: ReactNode;
}) {
  const { days, devices, stats, beforeFooter } = props;
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="rounded-xl border border-white/[0.07] bg-[#121215]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400"
        >
          Statistik 14 hari · perangkat · halaman · sumber
          <span className="text-zinc-600">{open ? "-" : "+"}</span>
        </button>
        {open ? (
          <div className="flex flex-col gap-3 border-t border-white/[0.06] p-2 sm:p-3">
      {days.length ? (
              <section className="rounded-2xl border border-white/[0.08] bg-[#141416] p-5">
                <h2 className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Grafik 14 hari (WIB)</h2>
                <div className="mt-3">
                  <OwnerChart days={days} />
                </div>
              </section>
            ) : null}

            {days.length ? (
              <section className="rounded-2xl border border-white/[0.08] bg-[#141416] p-5">
                <h2 className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Riwayat 14 hari</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-[11px] uppercase tracking-wide text-zinc-600">
                      <tr>
                        <th className="pb-2 font-medium">Hari</th>
                        <th className="pb-2 text-right font-medium">Tayang</th>
                        <th className="pb-2 text-right font-medium">Unik</th>
                        <th className="pb-2 text-right font-medium">Puncak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((row, i) => (
                        <tr key={row.day} className="border-t border-white/[0.06]">
                          <td className="py-2 text-zinc-300">
                            {dayLabel(row.day, i)}
                            <span className="ml-2 text-[11px] text-zinc-600">{row.day}</span>
                          </td>
                          <td className="py-2 text-right tabular-nums text-zinc-200">{fmt(row.views)}</td>
                          <td className="py-2 text-right tabular-nums text-zinc-400">{fmt(row.unique)}</td>
                          <td className="py-2 text-right tabular-nums text-zinc-400">{fmt(row.peak)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {devices.length ? (
              <section className="rounded-2xl border border-white/[0.08] bg-[#141416] p-5">
                <h2 className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Perangkat hari ini (WIB)</h2>
                <ul className="mt-3 space-y-2">
                  {devices.map((d) => (
                    <li key={d.device} className="flex items-center gap-3 text-sm">
                      <span className="w-16 shrink-0 text-zinc-400">{deviceLabel(d.device)}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <span className="block h-full rounded-full bg-emerald-400/80" style={{ width: `${d.pct}%` }} />
                      </span>
                      <span className="w-10 text-right tabular-nums text-zinc-300">{d.pct}%</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {stats?.topPaths?.length ? (
              <section className="rounded-2xl border border-white/[0.08] bg-[#141416] p-5">
                <h2 className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Halaman hari ini (WIB)</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {stats.topPaths.slice(0, 8).map((row) => (
                    <li key={row.path} className="flex justify-between gap-3">
                      <span className="truncate text-zinc-300">{row.path}</span>
                      <span className="tabular-nums text-zinc-500">{fmt(row.views)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {stats?.topRefs?.length ? (
              <section className="rounded-2xl border border-white/[0.08] bg-[#141416] p-5">
                <h2 className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Sumber hari ini (WIB)</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {stats.topRefs.slice(0, 6).map((row) => (
                    <li key={row.ref} className="flex justify-between gap-3">
                      <span className="truncate text-zinc-300">{row.ref}</span>
                      <span className="tabular-nums text-zinc-500">{fmt(row.views)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

          </div>
        ) : null}
      </div>

      {beforeFooter}
    </>
  );
}
