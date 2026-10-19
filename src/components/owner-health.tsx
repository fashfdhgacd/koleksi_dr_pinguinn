"use client";

// /pemilik owner signals that cost nothing extra on Cloudflare: "Perlu dicek" strip, "Uang & biaya"
// (static numbers from src/lib/owner-cost.json, never pulled live), "Thumbnail kosong" (owner-only
// in-memory list, posters saved in ONE merge per click) and "Status sistem" (values the panel
// already loads).
import { useCallback, useEffect, useState } from "react";
import cost from "@/lib/owner-cost.json";
import { fmt, ownerToast, wibDateTime } from "@/components/owner-dashboard-shared";

export type PlayerLogHost = {
  host: string;
  starts: number;
  slow?: number;
  fails: number;
  reports: number;
  retries: number;
  openSource: number;
  alt?: number;
  rate: number | null;
};

export type PlayerLogRow = {
  id: string;
  title: string;
  host: string;
  sourceUrl: string | null;
  watchUrl: string;
  inCatalog: boolean;
  hidden: boolean;
};

export type PlayerLogData = {
  ok?: boolean;
  error?: string;
  storage?: string;
  version?: number;
  since?: string;
  hosts?: PlayerLogHost[];
  /** Same per-host numbers for one WIB calendar day (older deploys do not send these). */
  today?: { day: string; hosts: PlayerLogHost[] };
  yesterday?: { day: string; hosts: PlayerLogHost[] };
  top?: (PlayerLogRow & { fails: number; starts: number; reports: number; gone: boolean })[];
  gone?: (PlayerLogRow & { since: string })[];
  suspect?: number;
  checkedAt?: string | null;
  ownerHidden?: (PlayerLogRow & { at: number | null })[];
  hideReadable?: boolean;
};

export type OverviewStatus = {
  catalogAt?: number | null;
  thumbsAt?: string | null;
  deadCheckedAt?: string | null;
  statsUpdated?: string | null;
};

type CostItem = { label: string; usd: number; note?: string };
type AdRow = { name: string; status: string; note?: string; earningsUsd: number | null };
type CostFile = {
  updated: string;
  note?: string;
  cloudflare: {
    cycleFrom: string;
    cycleTo: string;
    spentUsd: number;
    projectedUsageUsd: number;
    baseUsd: number;
    projectedTotalUsd: number;
    ceilingUsd: number;
    items: CostItem[];
  };
  earnings: { weekUsd: number | null; monthUsd: number | null };
  ads: AdRow[];
};

const COST = cost as CostFile;

const card = "min-w-0 rounded-xl border border-white/[0.08] border-t-[#2dd4bf]/40 bg-[#131316] p-4 sm:p-5";
const h2 = "flex items-center justify-between gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#2dd4bf]";
const btn =
  "shrink-0 whitespace-nowrap rounded-md border border-white/[0.12] bg-[#16161a] px-2 py-1 text-[13px] font-normal normal-case tracking-normal text-zinc-200 hover:bg-white/[0.06] disabled:opacity-50";
const btnPrimary =
  "shrink-0 whitespace-nowrap rounded-md border border-[#2dd4bf] bg-[#2dd4bf] px-2 py-1 text-[13px] font-medium text-zinc-950 hover:bg-[#5eead4] disabled:opacity-50";
const input = "min-w-0 rounded-md border border-white/[0.1] bg-[#0c0c0e] px-2 py-1.5 text-[13px] text-zinc-200";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function dayText(iso: string | null | undefined): string {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso ? String(iso) : "belum ada data";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] || ""}`.trim();
}

function usd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "belum ada data";
  return `$${Number(n).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Dot({ tone }: { tone: "ok" | "warn" | "bad" | "idle" }) {
  const c = tone === "ok" ? "bg-[#2dd4bf]" : tone === "warn" ? "bg-amber-400" : tone === "bad" ? "bg-red-400" : "bg-zinc-600";
  return <span className={`size-1.5 shrink-0 ${c}`} aria-hidden="true" />;
}

/* ---------- Perlu dicek ---------- */

export function AlertStrip(props: {
  noThumb: number | null;
  gone: number | null;
  suspect: number;
  deadCheckedAt: string | null | undefined;
  onShowThumbs: () => void;
  onShowGone: () => void;
}) {
  const { noThumb, gone, suspect, deadCheckedAt, onShowThumbs, onShowGone } = props;
  const cf = COST.cloudflare;
  const cfSafe = cf.projectedTotalUsd < cf.ceilingUsd * 0.85;
  const ts = COST.ads.find((a) => a.name === "TrafficStars");
  const item = "flex min-w-0 items-center gap-2.5 rounded-lg border bg-[#141418] px-3 py-2.5 text-[13px] text-zinc-300";
  return (
    <section>
      <div className={`${h2} mb-2`}>Perlu dicek</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`${item} ${noThumb ? "border-amber-400/25" : "border-white/[0.06]"}`}>
          <Dot tone={noThumb == null ? "idle" : noThumb ? "warn" : "ok"} />
          <span className="min-w-0 flex-1">
            <b className="font-semibold text-zinc-50">
              {noThumb == null ? "…" : noThumb ? `${fmt(noThumb)} video bokep` : "Semua video bokep"}
            </b>{" "}
            {noThumb ? "masih pakai logo" : noThumb === 0 ? "sudah punya thumbnail" : ""}
            <span className="block text-[13px] leading-snug text-zinc-400">Byse / Lulu / Dood tanpa thumbnail</span>
          </span>
          {noThumb ? (
            <button type="button" className={btn} onClick={onShowThumbs}>
              Lihat
            </button>
          ) : null}
        </div>
        <div className={`${item} ${gone ? "border-red-400/25" : "border-white/[0.06]"}`}>
          <Dot tone={gone == null ? "idle" : gone ? "bad" : "ok"} />
          <span className="min-w-0 flex-1">
            <b className="font-semibold text-zinc-50">{gone == null ? "…" : `${fmt(gone)} video`}</b> dihapus oleh sumber
            <span className="block text-[13px] leading-snug text-zinc-400">
              cek terakhir {wibDateTime(deadCheckedAt || null)}
              {suspect ? ` · ${fmt(suspect)} menunggu cek kedua` : ""}
            </span>
          </span>
          {gone ? (
            <button type="button" className={btn} onClick={onShowGone}>
              Lihat
            </button>
          ) : null}
        </div>
        <div className={`${item} border-white/[0.06]`}>
          <Dot tone={ts?.status === "aktif" ? "ok" : "idle"} />
          <span className="min-w-0 flex-1">
            <b className="font-semibold text-zinc-50">TrafficStars</b> {ts?.status || "belum ada data"}
            <span className="block text-[13px] leading-snug text-zinc-400">{ts?.note || ""}</span>
          </span>
        </div>
        <div className={`${item} ${cfSafe ? "border-white/[0.06]" : "border-amber-400/25"}`}>
          <Dot tone={cfSafe ? "ok" : "warn"} />
          <span className="min-w-0 flex-1">
            <b className="font-semibold text-zinc-50">{cfSafe ? "Biaya Cloudflare aman" : "Biaya Cloudflare mendekati batas"}</b>
            <span className="block text-[13px] leading-snug text-zinc-400">
              perkiraan {usd(cf.projectedTotalUsd)} dari batas {usd(cf.ceilingUsd)}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}

/* ---------- Uang & biaya ---------- */

export function MoneyCard() {
  const [open, setOpen] = useState(false);
  const cf = COST.cloudflare;
  const spentPct = Math.min(100, (cf.spentUsd / cf.ceilingUsd) * 100);
  const projPct = Math.min(100, (cf.projectedTotalUsd / cf.ceilingUsd) * 100);
  const row = "flex items-baseline justify-between gap-3 border-t border-white/[0.06] py-2 text-sm";
  const adsSummary = COST.ads.map((a) => `${a.name} ${a.status}`).join(" · ");
  return (
    <section className={`${card} h-full`}>
      <div className={h2}>
        <span>Uang &amp; biaya</span>
        <span className="text-[13px] font-normal normal-case tracking-normal text-zinc-400">
          siklus {dayText(cf.cycleFrom)} – {dayText(cf.cycleTo)}
        </span>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-zinc-300">Cloudflare (perkiraan)</span>
        <span className="tabular-nums text-zinc-100">
          <b className="font-semibold">{usd(cf.projectedTotalUsd)}</b> <span className="text-zinc-400">dari {usd(cf.ceilingUsd)}</span>
        </span>
      </div>
      <div className="relative mt-2 h-2 overflow-hidden rounded bg-white/[0.07]" aria-hidden="true">
        <span className="absolute inset-y-0 left-0 rounded bg-[#2dd4bf]/35" style={{ width: `${projPct}%` }} />
        <span className="absolute inset-y-0 left-0 rounded bg-[#2dd4bf]" style={{ width: `${spentPct}%` }} />
      </div>
      <p className="mt-1 text-[13px] text-zinc-400">{usd(cf.spentUsd)} sudah terpakai · termasuk dasar {usd(cf.baseUsd)}</p>
      <div className={`${row} mt-2`}>
        <span className="text-zinc-300">Pendapatan minggu ini</span>
        <span className="text-zinc-400">{usd(COST.earnings.weekUsd)}</span>
      </div>
      <div className={row}>
        <span className="shrink-0 text-zinc-300">Iklan</span>
        <span className="min-w-0 text-right text-[13px] leading-snug text-zinc-300">{adsSummary}</span>
      </div>
      <button
        type="button"
        className="mt-2 text-[13px] text-[#5eead4] underline-offset-2 hover:underline"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Tutup rincian" : "Rincian"}
      </button>
      {open ? (
        <ul className="mt-1">
          {cf.items.map((it) => (
            <li key={it.label} className={row}>
              <span className="shrink-0 text-zinc-300">{it.label}</span>
              <span className="min-w-0 text-right tabular-nums text-zinc-100">
                {usd(it.usd)}
                {it.note ? <span className="block text-[13px] text-zinc-400">{it.note}</span> : null}
              </span>
            </li>
          ))}
          {COST.ads.map((a) => (
            <li key={a.name} className={row}>
              <span className="shrink-0 text-zinc-300">{a.name}</span>
              <span className="min-w-0 text-right text-zinc-200">
                {a.status}
                <span className="block text-[13px] text-zinc-400">
                  {a.note ? `${a.note} · ` : ""}pendapatan {usd(a.earningsUsd)}
                </span>
              </span>
            </li>
          ))}
          <li className="pt-2 text-[13px] text-zinc-400">
            Data {dayText(COST.updated)}, diisi manual dari laporan mingguan (tidak ditarik langsung dari Cloudflare).
          </li>
        </ul>
      ) : null}
    </section>
  );
}

/* ---------- Thumbnail kosong ---------- */

type ThumbRow = { id: string; title: string; source: string; createdAt: number };

export function ThumbMissingCard({ secret, reloadKey }: { secret: string; reloadKey: number }) {
  const [rows, setRows] = useState<ThumbRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [limit, setLimit] = useState(10);
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, true>>({});
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!secret) return;
    setBusy(true);
    try {
      const res = await fetch("/api/owner-tools", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action: "thumb-missing", limit }),
        cache: "no-store",
      });
      const d = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; total?: number; items?: ThumbRow[] } | null;
      if (!d?.ok) {
        if (d?.error === "forbidden") return;
        ownerToast(`Gagal memuat Thumbnail kosong: ${d?.error || `HTTP ${res.status}`}`, "error", { label: "Coba lagi", run: () => void load() });
        return;
      }
      setRows(d.items || []);
      setTotal(d.total ?? 0);
    } catch {
      ownerToast("Gagal memuat Thumbnail kosong: jaringan error.", "error", { label: "Coba lagi", run: () => void load() });
    } finally {
      setBusy(false);
    }
  }, [secret, limit]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const filled = Object.entries(urls).filter(([id, u]) => !saved[id] && /^https?:\/\/\S+$/i.test(u.trim()));

  async function saveAll() {
    if (!filled.length) return;
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/owner-tools", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action: "set-posters", posters: Object.fromEntries(filled.map(([id, u]) => [id, u.trim()])) }),
      });
      const d = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; saved?: string[]; text?: string; rejected?: string[] } | null;
      if (!d?.ok) {
        ownerToast(`Poster gagal disimpan: ${d?.error || `HTTP ${res.status}`}`);
        return;
      }
      setSaved((cur) => ({ ...cur, ...Object.fromEntries((d.saved || []).map((id) => [id, true as const])) }));
      setNote(`${d.text || "Tersimpan."}${d.rejected?.length ? ` ${d.rejected.length} link ditolak.` : ""}`);
      ownerToast(d.text || "Poster tersimpan.", "ok");
    } catch {
      ownerToast("Poster gagal disimpan: jaringan error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="thumb-kosong" className={`${card} scroll-mt-4`}>
      <div className={h2}>
        <span>Thumbnail kosong{total != null ? ` · ${fmt(total)}` : ""}</span>
        <button type="button" className={btn} disabled={busy} onClick={() => void load()}>
          {busy ? "Memuat…" : "Muat ulang"}
        </button>
      </div>
      <p className="mt-2 text-[13px] text-zinc-400">
        Video bokep Byse / Lulu / Dood ini tampil pakai logo penguin dan ditaruh di belakang katalog. Tempel link gambar (https://…), lalu
        simpan sekaligus: satu kali simpan = satu update, tampil setelah deploy berikutnya.
      </p>
      {total === 0 ? <p className="mt-3 text-[13px] text-zinc-400">Tidak ada. Semua sudah punya thumbnail.</p> : null}
      {rows.length ? (
        <ul className="mt-2">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 border-t border-white/[0.05] py-2 sm:flex-nowrap">
              <img src="/brand-poster-6x5.jpg" alt="" loading="lazy" className="h-9 w-16 shrink-0 rounded bg-zinc-900 object-contain" />
              <a href={`/watch/${r.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1 basis-40">
                <span className="line-clamp-2 text-sm leading-snug text-zinc-100">{r.title.replace(/\s*-\s*koleksidrpinguin\.com$/i, "") || r.id}</span>
                <span className="block text-[13px] leading-snug text-zinc-400">
                  {r.source} · {r.id}
                </span>
              </a>
              {saved[r.id] ? (
                <span className="shrink-0 text-[13px] text-[#2dd4bf]">tersimpan</span>
              ) : (
                <input
                  className={`${input} w-full sm:w-56`}
                  placeholder="https://… link gambar"
                  value={urls[r.id] || ""}
                  onChange={(e) => setUrls((cur) => ({ ...cur, [r.id]: e.target.value }))}
                  aria-label={`Link poster ${r.id}`}
                />
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p className="mt-2 text-[13px] text-zinc-400">{note}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={filled.length ? btnPrimary : btn}
          disabled={busy || !filled.length}
          onClick={() => void saveAll()}
        >
          Simpan {filled.length ? `${filled.length} poster` : "poster"}
        </button>
        {total != null && rows.length < total ? (
          <button type="button" className={btn} disabled={busy} onClick={() => setLimit((n) => Math.min(100, n + 20))}>
            Tampilkan lebih banyak ({fmt(rows.length)} dari {fmt(total)})
          </button>
        ) : null}
      </div>
    </section>
  );
}

/* ---------- Status sistem ---------- */

export function StatusCard(props: {
  botOk: boolean | null;
  status: OverviewStatus | null;
  playerLog: PlayerLogData | null;
  statsHint?: string | null;
}) {
  const { botOk, status, playerLog } = props;
  const rows: { name: string; tone: "ok" | "warn" | "bad" | "idle"; value: string }[] = [
    { name: "Bot Telegram", tone: botOk == null ? "idle" : botOk ? "ok" : "warn", value: botOk == null ? "…" : botOk ? "webhook OK" : "perlu dicek" },
    {
      name: "Katalog dimuat",
      tone: status?.catalogAt ? "ok" : "idle",
      value: status ? wibDateTime(status.catalogAt || null) : "…",
    },
    {
      name: "Cek video mati (12 jam)",
      tone: status?.deadCheckedAt || playerLog?.checkedAt ? "ok" : "idle",
      value: status || playerLog ? wibDateTime(status?.deadCheckedAt || playerLog?.checkedAt || null) : "…",
    },
    {
      name: "Statistik folder & ranking",
      tone: status?.statsUpdated ? "ok" : "idle",
      value: status ? (status.statsUpdated ? dayText(status.statsUpdated) : "belum ada data") : "…",
    },
    { name: "Thumbnail R2", tone: status?.thumbsAt ? "ok" : "idle", value: status ? wibDateTime(status.thumbsAt || null) : "…" },
    {
      name: "Penyimpanan",
      tone: !playerLog ? "idle" : playerLog.storage === "d1" && playerLog.hideReadable !== false ? "ok" : "bad",
      value: !playerLog
        ? "…"
        : `D1 ${playerLog.storage === "d1" ? "OK" : "tidak terbaca"} · KV ${playerLog.hideReadable === false ? "tidak terbaca" : "OK"}`,
    },
  ];
  return (
    <section className={`${card} h-full`}>
      <div className={h2}>Status sistem</div>
      <ul className="mt-2">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2 border-t border-white/[0.06] py-2 text-sm">
            <Dot tone={r.tone} />
            <span className="min-w-0 flex-1 text-zinc-200">{r.name}</span>
            <span className="shrink-0 text-right text-[13px] text-zinc-300">{r.value}</span>
          </li>
        ))}
      </ul>
      {props.statsHint ? <p className="mt-2 text-[13px] text-zinc-500">{props.statsHint}</p> : null}
    </section>
  );
}
