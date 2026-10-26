"use client";

import { useEffect, useState } from "react";

type TsDay = { date: string; impressions: number; clicks?: number; earnings: number };
type TsData = { updatedAt?: string; currency?: string; days?: TsDay[]; unpaid?: number };

const nf = new Intl.NumberFormat("id-ID");
const usd = (n: number) =>
  "$" + new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

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
                  <span className="w-20 shrink-0 text-right text-zinc-400">{nf.format(d.impressions || 0)}</span>
                </li>
              ))}
          </ul>
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
      <p className="mt-0.5 text-lg font-semibold text-[#2dd4bf]">{earn == null ? "-" : usd(earn)}</p>
      <p className="text-[12px] text-zinc-400">{imp == null ? "-" : `${nf.format(imp)} impresi`}</p>
    </div>
  );
}
