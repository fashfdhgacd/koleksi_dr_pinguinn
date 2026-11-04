"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/components/owner-dashboard-shared";
import { type RefPeriod, type Series, type Stats14, type TopItem, changeWords } from "@/lib/stats14";

/**
 * "Statistik 14 hari" body for /pemilik: loaded once when the owner opens the section (and on
 * "Muat ulang"); the server answer is cached at the edge for 10 minutes. No timers, no polling.
 */

const TEAL = "#2dd4bf";

const COUNTRY: Record<string, string> = {
  ID: "Indonesia",
  SG: "Singapura",
  MY: "Malaysia",
  US: "Amerika Serikat",
  IN: "India",
  DE: "Jerman",
  FR: "Prancis",
  NL: "Belanda",
  JP: "Jepang",
  PL: "Polandia",
  TH: "Thailand",
  BE: "Belgia",
  CA: "Kanada",
  IE: "Irlandia",
  GB: "Inggris",
  AU: "Australia",
  PH: "Filipina",
  VN: "Vietnam",
  HK: "Hong Kong",
  TW: "Taiwan",
  KR: "Korea Selatan",
  SA: "Arab Saudi",
  AE: "Uni Emirat Arab",
  RU: "Rusia",
  BR: "Brasil",
  "": "Tidak diketahui",
};

const BROWSER: Record<string, string> = {
  chrome: "Chrome",
  safari: "Safari",
  uc: "UC Browser",
  opera: "Opera",
  samsung: "Samsung Internet",
  firefox: "Firefox",
  edge: "Edge",
  other: "Lainnya",
};

function shortDay(iso: string, today: string): string {
  if (iso === today) return "Hari ini";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function wibClock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
  } catch {
    return "";
  }
}

function Card(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/[0.05] bg-[#0c0e0f] p-4">
      <h2 className="text-[13px] uppercase tracking-[0.16em] text-zinc-400">{props.title}</h2>
      <div className="mt-3">{props.children}</div>
    </section>
  );
}

function Bar(props: { value: number; max: number }) {
  const w = props.max > 0 ? Math.max(1.5, (props.value / props.max) * 100) : 0;
  return (
    <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
      <span className="block h-full rounded-full" style={{ width: `${props.value > 0 ? w : 0}%`, background: TEAL }} />
    </span>
  );
}

function Change(props: { cur: number; prev: number }) {
  return <span className="text-[12px] text-zinc-500">{changeWords(props.cur, props.prev, fmt)}</span>;
}

const GROUP_DOT: Record<string, string> = {
  search: "Pencarian",
  social: "Sosial",
  paste: "Tempel",
  direct: "Langsung",
  other: "Lainnya",
};

/** "Sumber pengunjung" with a period toggle; every source host, its group, and the previous period. */
function SourcesCard(props: { periods: RefPeriod[]; clock: string }) {
  const [pk, setPk] = useState<RefPeriod["key"]>("today");
  const [all, setAll] = useState(false);
  const p = props.periods.find((x) => x.key === pk) || props.periods[0];
  if (!p) return null;
  const ext = p.sources.reduce((a, s) => a + s.views, 0);
  const extPrev = p.sources.reduce((a, s) => a + s.prev, 0);
  const max = Math.max(1, ...p.sources.map((s) => s.views));
  const shown = all ? p.sources : p.sources.slice(0, 20);
  const vs = (n: number) => `${p.prevLabel} ${fmt(n)}`;
  return (
    <Card title={`Sumber pengunjung · ${p.label} (WIB)`}>
      <div className="flex flex-wrap gap-1.5">
        {props.periods.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => {
              setPk(x.key);
              setAll(false);
            }}
            className="rounded-full border px-3 py-1 text-[12px]"
            style={x.key === p.key ? { borderColor: TEAL, color: TEAL } : { borderColor: "rgba(255,255,255,0.1)", color: "#a1a1aa" }}
          >
            {x.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-zinc-200">
        Dari luar situs: <b className="tabular-nums">{fmt(ext)}</b> kunjungan halaman{" "}
        <span className="text-[12px] text-zinc-500">({vs(extPrev)})</span>
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        {p.groups.map((g) => (
          <li key={g.key} className="flex justify-between gap-2">
            <span className="text-zinc-400">{g.label}</span>
            <span className="tabular-nums text-zinc-200">
              {fmt(g.views)} <span className="text-[11px] text-zinc-500">({fmt(g.prev)})</span>
            </span>
          </li>
        ))}
      </ul>
      <ul className="mt-4 space-y-2 text-sm">
        {shown.map((s) => (
          <li key={s.key} className="flex flex-col gap-1">
            <div className="flex justify-between gap-3">
              <span className="min-w-0 truncate text-zinc-200">
                {s.key === "(direct)" ? "Langsung (ketik alamat / bookmark)" : s.key}{" "}
                <span className="text-[11px] text-zinc-500">· {GROUP_DOT[s.group] || s.group}</span>
              </span>
              <span className="shrink-0 tabular-nums text-zinc-200">
                {fmt(s.views)} <span className="text-[11px] text-zinc-500">{vs(s.prev)}</span>
              </span>
            </div>
            <Bar value={s.views} max={max} />
          </li>
        ))}
      </ul>
      {p.sources.length > 20 ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 text-[12px] underline" style={{ color: TEAL }}>
          {all ? "Tampilkan 20 saja" : `Lihat semua (${fmt(p.sources.length)})`}
        </button>
      ) : null}
      {!p.sources.length ? <p className="text-sm text-zinc-400">Belum ada data.</p> : null}
      <p className="mt-3 text-sm text-zinc-300">
        Pindah halaman di dalam situs (koleksidrpinguin.com): <b className="tabular-nums">{fmt(p.internal.views)}</b>{" "}
        <span className="text-[12px] text-zinc-500">({vs(p.internal.prev)})</span>
      </p>
      {p.campaigns.length ? (
        <div className="mt-3">
          <p className="text-[12px] uppercase tracking-wide text-zinc-500">Kampanye (UTM)</p>
          <ul className="mt-1 space-y-1 text-sm">
            {p.campaigns.map((c) => (
              <li key={c.key} className="flex justify-between gap-3">
                <span className="min-w-0 truncate text-zinc-300">{c.label || c.key}</span>
                <span className="shrink-0 tabular-nums text-zinc-200">
                  {fmt(c.uniq)} orang <span className="text-[11px] text-zinc-500">{vs(c.prev)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-3 text-[12px] text-zinc-500">
        Angka = kunjungan halaman. Angka abu-abu = periode sebelumnya. Diperbarui paling lama tiap 10 menit
        {props.clock ? ` (${props.clock} WIB)` : ""}.
      </p>
    </Card>
  );
}

/** Per-day table: one column per series (HP / Desktop / …), newest day first. */
function DayTable(props: { days: string[]; today: string; series: Series[]; unit: string }) {
  const { days, today, series } = props;
  const rows = days.map((d, i) => ({ d, i })).reverse();
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-max text-left text-sm">
        <thead className="text-[12px] text-zinc-500">
          <tr>
            <th className="pb-2 pr-3 font-medium">Hari</th>
            {series.map((s) => (
              <th key={s.key} className="pb-2 pl-3 text-right font-medium">
                {s.label.replace(/ \(.*\)$/, "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ d, i }) => (
            <tr key={d} className="border-t border-white/[0.06]">
              <td className="py-1.5 pr-3 text-zinc-300">{shortDay(d, today)}</td>
              {series.map((s) => (
                <td key={s.key} className="py-1.5 pl-3 text-right tabular-nums text-zinc-300">
                  {fmt(s.perDay[i])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[12px] text-zinc-500">Angka = {props.unit}.</p>
    </div>
  );
}

function TopList(props: { items: TopItem[]; label: (i: TopItem) => string; value: (i: TopItem) => string; by: "views" | "uniq" }) {
  const max = Math.max(1, ...props.items.map((i) => i[props.by]));
  return (
    <ul className="space-y-2 text-sm">
      {props.items.map((it, n) => (
        <li key={it.key} className="flex flex-col gap-1">
          <div className="flex justify-between gap-3">
            <span className="min-w-0 truncate text-zinc-300">
              <span className="mr-2 tabular-nums text-zinc-500">{n + 1}.</span>
              {props.label(it)}
            </span>
            <span className="shrink-0 tabular-nums text-zinc-300">{props.value(it)}</span>
          </div>
          <Bar value={it[props.by]} max={max} />
        </li>
      ))}
    </ul>
  );
}

export function OwnerStats14(props: { secret: string }) {
  const [data, setData] = useState<Stats14 | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!props.secret) return;
    let alive = true;
    setLoading(true);
    setErr("");
    fetch("/api/owner-stats14", { headers: { "x-online-key": props.secret }, cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as (Stats14 & { hint?: string }) | { ok: false; hint?: string } | null;
        if (!alive) return;
        if (j && j.ok) setData(j as Stats14);
        else setErr((j && "hint" in j && j.hint) || "Statistik belum bisa dimuat. Coba lagi sebentar.");
      })
      .catch(() => alive && setErr("Statistik belum bisa dimuat. Coba lagi sebentar."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [props.secret, nonce]);

  if (!data) {
    return (
      <div className="rounded-xl border border-white/[0.05] bg-[#0c0e0f] p-4 text-sm text-zinc-400">
        {loading ? "Memuat statistik 14 hari… (pertama kali bisa agak lama)" : err || "Belum ada data."}
        {!loading && err ? (
          <button type="button" onClick={() => setNonce((n) => n + 1)} className="ml-3 underline" style={{ color: TEAL }}>
            Coba lagi
          </button>
        ) : null}
      </div>
    );
  }

  const { days, today } = data;
  const maxUniq = Math.max(1, ...data.visitors.map((v) => v.uniq));
  const devTotal = data.devices.reduce((s, d) => s + d.total, 0);
  const srcTotal = data.sources.reduce((s, d) => s + d.total, 0);
  const sources = [...data.sources].sort((a, b) => b.total - a.total);
  const internalTotal = data.internalViews.reduce((a, b) => a + b, 0);
  const clock = wibClock(data.updatedAt);

  return (
    <>
      {data.refPeriods?.length ? <SourcesCard periods={data.refPeriods} clock={clock} /> : null}
      <Card title="Pengunjung per hari (14 hari, WIB)">
        <p className="text-sm text-zinc-200">
          14 hari: <b className="tabular-nums">{fmt(data.totals.uniq)}</b> orang ·{" "}
          <span className="tabular-nums">{fmt(data.totals.views)}</span> kunjungan halaman
        </p>
        <p>
          <Change cur={data.totals.uniq} prev={data.totals.prevUniq} />
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          {[...data.visitors].reverse().map((v) => (
            <li key={v.day} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-zinc-400">{shortDay(v.day, today)}</span>
              <Bar value={v.uniq} max={maxUniq} />
              <span className="w-32 shrink-0 text-right tabular-nums text-zinc-200">
                {fmt(v.uniq)} <span className="text-zinc-500">orang</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12px] text-zinc-500">
          Orang = pengunjung berbeda dalam satu hari (00.00–24.00 WIB). Total 14 hari = jumlah per hari, jadi orang yang
          datang 2 hari dihitung 2 kali. Hari ini masih berjalan{clock ? `, data sampai jam ${clock} WIB` : ""}.
        </p>
      </Card>

      <Card title="Perangkat (14 hari)">
        <ul className="space-y-2 text-sm">
          {data.devices.map((d) => (
            <li key={d.key} className="flex flex-col gap-1">
              <div className="flex flex-wrap justify-between gap-x-3">
                <span className="text-zinc-200">
                  Dari {d.label}: <b className="tabular-nums">{fmt(d.total)}</b> dari {fmt(devTotal)} orang
                </span>
                <Change cur={d.total} prev={d.prevTotal} />
              </div>
              <Bar value={d.total} max={devTotal} />
            </li>
          ))}
        </ul>
        <DayTable days={days} today={today} series={data.devices} unit="orang per hari" />
      </Card>

      <Card title="Sumber pengunjung (14 hari)">
        <ul className="space-y-2 text-sm">
          {sources.map((s) => (
            <li key={s.key} className="flex flex-col gap-1">
              <div className="flex flex-wrap justify-between gap-x-3">
                <span className="text-zinc-200">
                  {s.label}: <b className="tabular-nums">{fmt(s.total)}</b> dari {fmt(srcTotal)} orang
                </span>
                <Change cur={s.total} prev={s.prevTotal} />
              </div>
              <Bar value={s.total} max={srcTotal} />
            </li>
          ))}
        </ul>
        {data.otherRefs.length ? (
          <p className="mt-3 text-[12px] text-zinc-500">
            Lainnya terbanyak: {data.otherRefs.map((r) => `${r.key} (${fmt(r.uniq)})`).join(", ")}
          </p>
        ) : null}
        <DayTable days={days} today={today} series={sources} unit="orang per hari yang datang dari sumber itu" />
        <p className="mt-2 text-[12px] text-zinc-500">
          Pindah halaman di dalam situs (tidak dihitung sebagai sumber): {fmt(internalTotal)} kunjungan halaman dalam 14
          hari. Satu orang bisa datang dari 2 sumber dalam sehari, jadi jumlah semua sumber bisa sedikit lebih besar dari
          jumlah orang.
        </p>
      </Card>

      <Card title="Kampanye (UTM) (14 hari)">
        {data.campaigns?.length ? (
          <TopList
            items={data.campaigns}
            by="uniq"
            label={(c) => c.label || c.key}
            value={(c) => `${fmt(c.uniq)} orang · ${fmt(c.views)} masuk`}
          />
        ) : (
          <p className="text-sm text-zinc-400">Belum ada pengunjung dari link ber-UTM.</p>
        )}
        <p className="mt-2 text-[12px] text-zinc-500">
          Dihitung dari link yang memakai ?utm_source=…&amp;utm_medium=…&amp;utm_campaign=… (contoh:
          ?utm_source=telegram&amp;utm_medium=channel&amp;utm_campaign=organic). Format: sumber / media · kampanye ·
          konten. Hanya kunjungan pertama yang masuk lewat link itu yang dihitung.
        </p>
      </Card>

      {data.pages.length ? (
        <Card title="Halaman terbanyak (14 hari)">
          <TopList
            items={data.pages}
            by="views"
            label={(p) => (p.label && p.label !== p.key ? p.label : p.key === "/" ? "Beranda" : p.key)}
            value={(p) => `${fmt(p.views)} kunjungan · ${fmt(p.uniq)} orang`}
          />
        </Card>
      ) : null}

      {data.countries.length ? (
        <Card title="Negara (14 hari)">
          <TopList items={data.countries} by="uniq" label={(c) => COUNTRY[c.key] || c.key} value={(c) => `${fmt(c.uniq)} orang`} />
        </Card>
      ) : null}

      {data.browsers.length ? (
        <Card title="Browser (14 hari)">
          <TopList items={data.browsers} by="uniq" label={(b) => BROWSER[b.key] || b.key} value={(b) => `${fmt(b.uniq)} orang`} />
        </Card>
      ) : null}

      <div className="flex items-center justify-between px-1 text-[12px] text-zinc-500">
        <span>Diperbarui paling lama tiap 10 menit{clock ? ` · ${clock} WIB` : ""}.</span>
        <button
          type="button"
          disabled={loading}
          onClick={() => setNonce((n) => n + 1)}
          className="underline disabled:opacity-50"
          style={{ color: TEAL }}
        >
          {loading ? "Memuat…" : "Muat ulang"}
        </button>
      </div>
    </>
  );
}
