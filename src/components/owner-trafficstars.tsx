"use client";

import { useEffect, useState } from "react";

type TsDay = { date: string; impressions: number; clicks?: number; earnings: number };
type TsData = {
  updatedAt?: string;
  currency?: string;
  days?: TsDay[];
  unpaid?: number;
  /** Per spot per UTC day (scripts/trafficstars-sync.mjs); optional. */
  spotNames?: Record<string, string>;
  spots?: { date: string; spots?: TsSpot[] }[];
};
type TsSpot = { id: string; impressions: number; clicks?: number; earnings: number };

const nf = new Intl.NumberFormat("id-ID");
const usd = (n: number) =>
  "$" +
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    n || 0,
  );

function utcDay(offset: number): string {
  const d = new Date(Date.now() - offset * 86400000);
  return d.toISOString().slice(0, 10);
}

function wib(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return (
    d.toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }) + " WIB"
  );
}

function shortDate(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("id-ID", { timeZone: "UTC", day: "numeric", month: "short" });
}

/** TrafficStars earnings card. Reads a static JSON committed to the repo (no API calls, no polling). */
export function OwnerTrafficStars({ reloadKey }: { reloadKey?: number }) {
  const [data, setData] = useState<TsData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/data/trafficstars.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: TsData) => {
        if (alive) {
          setData(j && Array.isArray(j.days) ? j : null);
          setFailed(!(j && Array.isArray(j.days)));
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const days = (data?.days ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(days.map((d) => [d.date, d]));
  const today = byDate.get(utcDay(0));
  const yesterday = byDate.get(utcDay(1));
  const last7 = days.slice(-7);
  const sumEarn = last7.reduce((s, d) => s + (d.earnings || 0), 0);
  const sumImp = last7.reduce((s, d) => s + (d.impressions || 0), 0);
  const maxEarn = Math.max(0.0001, ...last7.map((d) => d.earnings || 0));

  return (
    <section
      className="rounded-lg border border-white/[0.08] bg-[#121215] p-4 text-zinc-100"
      aria-label="Pendapatan TrafficStars"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          Pendapatan TrafficStars
          <span className="size-2 bg-[#2dd4bf]" aria-hidden="true" />
        </h2>
        <span className="text-[13px] text-zinc-400">
          {data ? `Diperbarui ${wib(data.updatedAt)}` : failed ? "Data belum tersedia" : "Memuat…"}
        </span>
      </div>

      {data && days.length ? (
        <>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Stat label="Hari ini" earn={today?.earnings} imp={today?.impressions} />
            <Stat label="Kemarin" earn={yesterday?.earnings} imp={yesterday?.impressions} />
            <Stat label={`${last7.length} hari terakhir`} earn={sumEarn} imp={sumImp} />
          </div>
          <ul className="mt-4 flex flex-col gap-1.5">
            {last7
              .slice()
              .reverse()
              .map((d) => (
                <li key={d.date} className="flex items-center gap-2 text-[13px]">
                  <span className="w-14 shrink-0 text-zinc-400">{shortDate(d.date)}</span>
                  <span className="relative h-2.5 flex-1 rounded-sm bg-white/[0.05]">
                    <span
                      className="absolute inset-y-0 left-0 rounded-sm bg-[#2dd4bf]"
                      style={{ width: `${Math.max(2, ((d.earnings || 0) / maxEarn) * 100)}%` }}
                    />
                  </span>
                  <span className="w-14 shrink-0 text-right font-medium">{usd(d.earnings)}</span>
                  <span className="w-20 shrink-0 text-right text-zinc-400">
                    {nf.format(d.impressions || 0)}
                  </span>
                </li>
              ))}
          </ul>
          <SpotTable data={data} yesterday={utcDay(1)} />
          {typeof data.unpaid === "number" ? (
            <p className="mt-3 text-[13px] text-zinc-400">Belum dibayar: {usd(data.unpaid)}</p>
          ) : null}
        </>
      ) : failed ? (
        <p className="mt-3 text-[13px] text-zinc-400">File data TrafficStars belum ada.</p>
      ) : null}
    </section>
  );
}

function Stat({ label, earn, imp }: { label: string; earn?: number; imp?: number }) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-[#16161a] px-3 py-2">
      <p className="text-[12px] text-zinc-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-[#2dd4bf]">
        {earn == null ? "-" : usd(earn)}
      </p>
      <p className="text-[12px] text-zinc-400">{imp == null ? "-" : `${nf.format(imp)} impresi`}</p>
    </div>
  );
}

type SpotRow = {
  id: string;
  name: string;
  yImp: number;
  imp: number;
  clicks: number;
  earn: number;
};

/** Per spot: yesterday's impressions and the last 7 UTC days. A spot at 0 yesterday stopped serving. */
function SpotTable({ data, yesterday }: { data: TsData; yesterday: string }) {
  const days = (Array.isArray(data.spots) ? data.spots : [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);
  if (!days.length) return null;
  const rows = new Map<string, SpotRow>();
  for (const d of days) {
    for (const s of d.spots ?? []) {
      const r = rows.get(s.id) ?? {
        id: s.id,
        name: data.spotNames?.[s.id] || s.id,
        yImp: 0,
        imp: 0,
        clicks: 0,
        earn: 0,
      };
      r.imp += s.impressions || 0;
      r.clicks += s.clicks || 0;
      r.earn += s.earnings || 0;
      if (d.date === yesterday) r.yImp += s.impressions || 0;
      rows.set(s.id, r);
    }
  }
  const list = [...rows.values()].sort((a, b) => b.earn - a.earn || b.imp - a.imp);
  if (!list.length) return null;
  return (
    <div className="mt-4 overflow-x-auto">
      <p className="mb-1.5 text-[12px] text-zinc-400">
        Per spot ({days.length} hari terakhir, UTC)
      </p>
      <table className="w-full text-[12px]">
        <thead className="text-zinc-400">
          <tr>
            <th className="py-1 pr-2 text-left font-normal">Spot</th>
            <th className="px-2 py-1 text-right font-normal">Kemarin</th>
            <th className="px-2 py-1 text-right font-normal">Impresi</th>
            <th className="px-2 py-1 text-right font-normal">Klik</th>
            <th className="py-1 pl-2 text-right font-normal">Pendapatan</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id} className="border-t border-white/[0.05]">
              <td className="max-w-[12rem] truncate py-1 pr-2" title={`${r.name} (${r.id})`}>
                {r.name}
              </td>
              <td className={`px-2 py-1 text-right ${r.yImp ? "" : "text-rose-400"}`}>
                {nf.format(r.yImp)}
              </td>
              <td className="px-2 py-1 text-right text-zinc-300">{nf.format(r.imp)}</td>
              <td className="px-2 py-1 text-right text-zinc-300">{nf.format(r.clicks)}</td>
              <td className="py-1 pl-2 text-right font-medium">{usd(r.earn)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
