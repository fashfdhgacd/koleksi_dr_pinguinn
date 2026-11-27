"use client";

import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/components/owner-dashboard-shared";
import { Bar, Card, COUNTRY, SourcesCard, wibClock } from "@/components/owner-stats14";
import { PERIOD_KEYS, PERIOD_LABELS, type PeriodKey, type RefPeriod, type Stats14 } from "@/lib/stats14";
import { pageButtons, type WatchedPage } from "@/lib/owner-videos";

/**
 * /pemilik → "Statistik": jumlah orang, asal negara, popunder, sumber pengunjung and the "Video
 * ditonton" table, for one period (Hari ini / Kemarin / 7 hari / 14 hari). Two owner-only reads, both
 * cached at the edge for 10 minutes: /api/owner-stats14 (same answer as the Ringkasan section) and
 * /api/owner-videos (one 10-row page). Loaded when the tab opens; no timers, no polling.
 */

const TEAL = "#2dd4bf";

let regionNames: Intl.DisplayNames | null | undefined;
function countryName(code: string): string {
  if (COUNTRY[code]) return COUNTRY[code];
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(["id"], { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code) || code;
  } catch {
    return code;
  }
}

function dateWib(ms: number): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
  } catch {
    return "—";
  }
}

function catLabel(slug: string): string {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function Gray(props: { children: React.ReactNode }) {
  return <span className="text-[12px] text-zinc-500">{props.children}</span>;
}

function PeriodTabs(props: { value: PeriodKey; onChange: (k: PeriodKey) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Periode">
      {PERIOD_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={k === props.value}
          onClick={() => props.onChange(k)}
          className="min-h-9 rounded-full border px-3 py-1 text-[13px]"
          style={k === props.value ? { borderColor: TEAL, color: TEAL } : { borderColor: "rgba(255,255,255,0.1)", color: "#a1a1aa" }}
        >
          {PERIOD_LABELS[k].label}
        </button>
      ))}
    </div>
  );
}

function PeopleCard(props: { p: RefPeriod }) {
  const { p } = props;
  const pp = p.people;
  return (
    <Card title={`Pengunjung · ${p.label} (WIB)`}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[12px] text-zinc-500">Jumlah orang</p>
          <p className="text-2xl font-semibold tabular-nums text-zinc-50">{fmt(pp.uniq)}</p>
          <Gray>
            {p.prevLabel} {fmt(pp.prevUniq)}
          </Gray>
        </div>
        <div>
          <p className="text-[12px] text-zinc-500">Kunjungan halaman</p>
          <p className="text-2xl font-semibold tabular-nums text-zinc-50">{fmt(pp.views)}</p>
          <Gray>
            {p.prevLabel} {fmt(pp.prevViews)}
          </Gray>
        </div>
      </div>
      <p className="mt-3 text-[12px] text-zinc-500">
        Orang = browser berbeda yang membuka situs (tiap browser punya kode acak sendiri, tanpa nama atau IP). Satu orang
        yang buka 5 halaman tetap 1 orang, tapi 5 kunjungan halaman. Orang yang pakai 2 HP/browser terhitung 2.
        {pp.exact ? "" : " Untuk periode ini angkanya jumlah per hari, jadi orang yang datang 2 hari terhitung 2."}
      </p>
    </Card>
  );
}

function CountryCard(props: { p: RefPeriod }) {
  const { p } = props;
  const [all, setAll] = useState(false);
  useEffect(() => setAll(false), [p.key]);
  const list = p.countries;
  const shown = all ? list : list.slice(0, 20);
  const max = Math.max(1, ...list.map((c) => c.uniq));
  return (
    <Card title={`Asal pengunjung · ${p.label}`}>
      {list.length ? (
        <ul className="space-y-2 text-sm">
          {shown.map((c, i) => (
            <li key={c.key || "?"} className="flex flex-col gap-1">
              <div className="flex justify-between gap-3">
                <span className="min-w-0 truncate text-zinc-200">
                  <span className="mr-2 tabular-nums text-zinc-500">{i + 1}.</span>
                  {c.key ? countryName(c.key) : "Tidak diketahui"}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-200">{fmt(c.uniq)} orang</span>
              </div>
              <span className="text-[11px] tabular-nums text-zinc-500">
                {fmt(c.views)} kunjungan · {p.prevLabel} {fmt(c.prevUniq)} orang
              </span>
              <Bar value={c.uniq} max={max} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-400">Belum ada data.</p>
      )}
      {list.length > 20 ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 text-[12px] underline" style={{ color: TEAL }}>
          {all ? "Tampilkan 20 saja" : `Tampilkan semua (${fmt(list.length)} negara)`}
        </button>
      ) : null}
      <p className="mt-3 text-[12px] text-zinc-500">
        Negara dari lokasi koneksi (Cloudflare). Pakai VPN = terhitung negara VPN-nya.
        {p.key === "7d" || p.key === "14d" ? " Orang per negara = jumlah per hari." : ""}
      </p>
    </Card>
  );
}

function PopCard(props: { p: RefPeriod; videos: WatchedPage | null }) {
  const { p, videos } = props;
  const pops = videos?.totals.pops || p.pops;
  if (!pops) return null;
  const total = pops.videy + pops.other;
  const prev = pops.prevVidey + pops.prevOther;
  const views = videos?.totals.views;
  return (
    <Card title={`Popunder · ${p.label}`}>
      <p className="text-sm text-zinc-200">
        Popunder {p.label.toLowerCase()}: <b className="text-lg tabular-nums text-zinc-50">{fmt(total)}</b>
        {views != null ? (
          <>
            {" "}
            dari <b className="tabular-nums">{fmt(views)}</b> tontonan
          </>
        ) : null}{" "}
        <Gray>
          ({p.prevLabel} {fmt(prev)}
          {videos ? ` dari ${fmt(videos.totals.prevViews)} tontonan` : ""})
        </Gray>
      </p>
      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <li className="flex justify-between gap-2">
          <span className="text-zinc-400">Videy</span>
          <span className="tabular-nums text-zinc-200">
            {fmt(pops.videy)} <span className="text-[11px] text-zinc-500">({fmt(pops.prevVidey)})</span>
          </span>
        </li>
        <li className="flex justify-between gap-2">
          <span className="text-zinc-400">Lainnya</span>
          <span className="tabular-nums text-zinc-200">
            {fmt(pops.other)} <span className="text-[11px] text-zinc-500">({fmt(pops.prevOther)})</span>
          </span>
        </li>
      </ul>
      <p className="mt-3 text-[12px] text-zinc-500">
        Popunder = tab iklan yang benar-benar terbuka saat pengunjung tap play (yang diblokir browser tidak dihitung).
        Videy maks 3× per video, lainnya 1× per video. Tontonan = halaman video dibuka. Data popunder mulai 2 Nov 2026.
      </p>
    </Card>
  );
}

const SORTS: { v: string; label: string }[] = [
  { v: "views:desc", label: "Paling banyak ditonton" },
  { v: "views:asc", label: "Paling sedikit ditonton" },
  { v: "pop:desc", label: "Popunder terbanyak" },
  { v: "upload:desc", label: "Upload terbaru" },
  { v: "upload:asc", label: "Upload terlama" },
];

function VideoTable(props: {
  period: PeriodKey;
  data: WatchedPage | null;
  loading: boolean;
  err: string;
  q: string;
  setQ: (q: string) => void;
  sort: string;
  setSort: (s: string) => void;
  setPage: (n: number) => void;
}) {
  const { data } = props;
  const label = PERIOD_LABELS[props.period].label;
  return (
    <Card title={`Video ditonton · ${label} (${fmt(data?.totalAll ?? 0)} video)`}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={props.q}
          onChange={(e) => props.setQ(e.target.value)}
          placeholder="Cari judul…"
          className="min-h-10 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#2dd4bf] focus:outline-none"
        />
        <select
          value={props.sort}
          onChange={(e) => props.setSort(e.target.value)}
          className="min-h-10 rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-zinc-200 focus:border-[#2dd4bf] focus:outline-none"
          aria-label="Urutkan"
        >
          {SORTS.map((s) => (
            <option key={s.v} value={s.v}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {props.err ? <p className="mt-3 text-sm text-amber-300">{props.err}</p> : null}
      {!data && props.loading ? <p className="mt-3 text-sm text-zinc-400">Memuat video… (pertama kali bisa agak lama)</p> : null}
      {data ? (
        <>
          {props.q ? (
            <p className="mt-2 text-[12px] text-zinc-500">
              {fmt(data.total)} video cocok dengan “{props.q}”
            </p>
          ) : null}
          {/* HP: baris ringkas */}
          <ul className={`mt-3 divide-y divide-white/[0.06] sm:hidden ${props.loading ? "opacity-60" : ""}`}>
            {data.rows.map((r) => (
              <li key={r.id} className="flex gap-3 py-2.5">
                <a href={`/watch/${encodeURIComponent(r.id)}`} target="_blank" rel="noreferrer" className="shrink-0">
                  <Thumb src={r.thumb} />
                </a>
                <div className="min-w-0 flex-1">
                  <a
                    href={`/watch/${encodeURIComponent(r.id)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="line-clamp-2 text-sm text-zinc-100 hover:underline"
                  >
                    {r.title || r.id}
                  </a>
                  <p className="mt-0.5 text-[12px] tabular-nums text-zinc-300">
                    <b style={{ color: TEAL }}>{fmt(r.views)}</b> ditonton · <b className="text-zinc-100">{fmt(r.pops)}</b> popunder
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {dateWib(r.up)}
                    {r.server ? ` · ${r.server}` : ""}
                    {r.cat ? ` · ${catLabel(r.cat)}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {/* Desktop: tabel */}
          <div className={`mt-3 hidden overflow-x-auto sm:block ${props.loading ? "opacity-60" : ""}`}>
            <table className="w-full text-left text-sm">
              <thead className="text-[12px] text-zinc-500">
                <tr>
                  <th className="pb-2 pr-3 font-medium">Thumbnail</th>
                  <th className="pb-2 pr-3 font-medium">Judul</th>
                  <th className="pb-2 pl-3 text-right font-medium">Ditonton</th>
                  <th className="pb-2 pl-3 text-right font-medium">Popunder</th>
                  <th className="pb-2 pl-3 font-medium">Tanggal upload</th>
                  <th className="pb-2 pl-3 font-medium">Kategori / server</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-t border-white/[0.06] align-middle">
                    <td className="py-2 pr-3">
                      <a href={`/watch/${encodeURIComponent(r.id)}`} target="_blank" rel="noreferrer">
                        <Thumb src={r.thumb} />
                      </a>
                    </td>
                    <td className="max-w-[18rem] py-2 pr-3">
                      <a
                        href={`/watch/${encodeURIComponent(r.id)}`}
                        target="_blank"
                        rel="noreferrer"
                        title={r.title || r.id}
                        className="block truncate text-zinc-100 hover:underline"
                      >
                        {r.title || r.id}
                      </a>
                    </td>
                    <td className="py-2 pl-3 text-right font-semibold tabular-nums" style={{ color: TEAL }}>
                      {fmt(r.views)}
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums text-zinc-200">{fmt(r.pops)}</td>
                    <td className="whitespace-nowrap py-2 pl-3 text-zinc-400">{dateWib(r.up)}</td>
                    <td className="py-2 pl-3 text-[12px] text-zinc-400">
                      {r.cat ? catLabel(r.cat) : "—"}
                      {r.server ? <span className="block text-zinc-500">{r.server}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.rows.length ? <p className="mt-3 text-sm text-zinc-400">{props.q ? "Tidak ada video yang cocok." : "Belum ada video ditonton."}</p> : null}
          {data.pages > 1 ? (
            <nav className="mt-3 flex flex-wrap items-center gap-1 text-[13px]" aria-label="Halaman">
              <PageBtn disabled={data.page <= 1} onClick={() => props.setPage(data.page - 1)}>
                Previous
              </PageBtn>
              {pageButtons(data.page, data.pages).map((n, i) =>
                n ? (
                  <PageBtn key={`p${n}`} active={n === data.page} onClick={() => props.setPage(n)}>
                    {fmt(n)}
                  </PageBtn>
                ) : (
                  <span key={`g${i}`} className="px-1 text-zinc-500">
                    …
                  </span>
                ),
              )}
              <PageBtn disabled={data.page >= data.pages} onClick={() => props.setPage(data.page + 1)}>
                Next
              </PageBtn>
            </nav>
          ) : null}
          <p className="mt-3 text-[12px] text-zinc-500">
            Ditonton = halaman video dibuka dalam periode ini. Popunder = tab iklan yang terbuka di video itu. 10 video per
            halaman. Diperbarui paling lama tiap 10 menit{data.updatedAt ? ` (${wibClock(data.updatedAt)} WIB)` : ""}.
          </p>
        </>
      ) : null}
    </Card>
  );
}

function Thumb(props: { src: string }) {
  return props.src ? (
    <img src={props.src} alt="" loading="lazy" decoding="async" className="h-12 w-20 rounded-md bg-white/[0.04] object-cover" />
  ) : (
    <span className="block h-12 w-20 rounded-md bg-white/[0.06]" />
  );
}

function PageBtn(props: { children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="min-h-9 min-w-9 rounded-lg border px-2.5 py-1 tabular-nums disabled:opacity-40"
      style={props.active ? { borderColor: TEAL, color: TEAL } : { borderColor: "rgba(255,255,255,0.1)", color: "#d4d4d8" }}
    >
      {props.children}
    </button>
  );
}

export function OwnerStatistik(props: { secret: string }) {
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [stats, setStats] = useState<Stats14 | null>(null);
  const [statsErr, setStatsErr] = useState("");
  const [nonce, setNonce] = useState(0);
  const [videos, setVideos] = useState<WatchedPage | null>(null);
  const [vLoading, setVLoading] = useState(false);
  const [vErr, setVErr] = useState("");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [sort, setSort] = useState("views:desc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!props.secret) return;
    let alive = true;
    setStatsErr("");
    fetch("/api/owner-stats14", { headers: { "x-online-key": props.secret }, cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as (Stats14 & { hint?: string }) | { ok: false; hint?: string } | null;
        if (!alive) return;
        if (j && j.ok) setStats(j as Stats14);
        else setStatsErr((j && "hint" in j && j.hint) || "Statistik belum bisa dimuat. Coba lagi sebentar.");
      })
      .catch(() => alive && setStatsErr("Statistik belum bisa dimuat. Coba lagi sebentar."));
    return () => {
      alive = false;
    };
  }, [props.secret, nonce]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = q.trim();
      setQDebounced((cur) => {
        if (cur !== next) setPage(1);
        return next;
      });
    }, 350);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!props.secret) return;
    let alive = true;
    setVLoading(true);
    setVErr("");
    const [s, dir] = sort.split(":");
    const qs = new URLSearchParams({ p: period, sort: s, dir: dir || "desc", page: String(page) });
    if (qDebounced) qs.set("q", qDebounced);
    fetch(`/api/owner-videos?${qs}`, { headers: { "x-online-key": props.secret }, cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as (WatchedPage & { hint?: string }) | { ok: false; hint?: string } | null;
        if (!alive) return;
        if (j && j.ok) setVideos(j as WatchedPage);
        else setVErr((j && "hint" in j && j.hint) || "Data video belum bisa dimuat. Coba lagi sebentar.");
      })
      .catch(() => alive && setVErr("Data video belum bisa dimuat. Coba lagi sebentar."))
      .finally(() => alive && setVLoading(false));
    return () => {
      alive = false;
    };
  }, [props.secret, period, qDebounced, sort, page, nonce]);

  const p = useMemo(() => stats?.refPeriods?.find((x) => x.key === period) || null, [stats, period]);
  const videosForPeriod = videos && videos.period === period ? videos : null;
  const clock = stats ? wibClock(stats.updatedAt) : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PeriodTabs
          value={period}
          onChange={(k) => {
            setPeriod(k);
            setPage(1);
          }}
        />
        <button type="button" onClick={() => setNonce((n) => n + 1)} className="text-[12px] underline" style={{ color: TEAL }}>
          Muat ulang
        </button>
      </div>
      {p && p.people ? (
        <>
          <PeopleCard p={p} />
          <PopCard p={p} videos={videosForPeriod} />
        </>
      ) : (
        <div className="rounded-xl border border-white/[0.05] bg-[#0c0e0f] p-4 text-sm text-zinc-400">
          {statsErr || "Memuat statistik… (pertama kali bisa agak lama)"}
        </div>
      )}
      <VideoTable
        period={period}
        data={videosForPeriod}
        loading={vLoading}
        err={vErr}
        q={q}
        setQ={setQ}
        sort={sort}
        setSort={(v) => {
          setSort(v);
          setPage(1);
        }}
        setPage={setPage}
      />
      {p && p.countries ? <CountryCard p={p} /> : null}
      {stats?.refPeriods?.length ? <SourcesCard periods={stats.refPeriods} clock={clock} period={period} /> : null}
      <p className="px-1 text-[12px] text-zinc-500">
        Semua jam dalam WIB. Diperbarui paling lama tiap 10 menit{clock ? ` · ${clock} WIB` : ""}.
      </p>
    </div>
  );
}
