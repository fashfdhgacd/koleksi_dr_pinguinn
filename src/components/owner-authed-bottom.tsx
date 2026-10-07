"use client";

import { Button } from "@/components/ui/button";
import { OwnerChart } from "@/components/owner-chart";
import { HiddenReviewSection } from "@/components/owner-hidden-review";
import { TopVideosSection } from "@/components/owner-top-videos";
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
}) {
  const { days, devices, stats, secret, loading, fetchOnline, logout } = props;
  return (
    <>
      <HiddenReviewSection secret={secret} />
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
                <p className="mt-3 text-[11px] text-zinc-600">
                  Kartu atas dan baris "Hari ini" memakai sumber yang sama (Postgres pageview / KV daystats). Hari yang sudah tersimpan salah tidak bisa di-backfill otomatis.
                </p>
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

            <TopVideosSection videos={stats?.topVideos || []} />

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

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-zinc-600">Ping pengunjung 90 dtk · panel refresh 25 dtk · tab tersembunyi tidak dihitung</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void fetchOnline(secret)} disabled={loading}>
                  {loading ? "..." : "Refresh"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={logout}>
                  Keluar
                </Button>
              </div>
            </div>
    </>
  );
}
