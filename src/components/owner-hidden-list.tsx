"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  title: string;
  source: string;
  sourceUrl: string | null;
  embedUrl: string | null;
  javCode: string | null;
  reason: string;
  reasonLabel: string;
  priority?: "check" | "clear";
  unhidden: boolean;
  unhiddenAt: number | null;
  watchUrl: string;
};

const PAGE = 20;

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Row[]): string {
  const head = ["id", "title", "source", "source_link", "embed_link", "jav_code", "hide_reason", "hide_reason_label", "prioritas", "status"];
  const lines = rows.map((r) =>
    [
      r.id,
      r.title,
      r.source,
      r.sourceUrl || "",
      r.embedUrl || "",
      r.javCode || "",
      r.reason,
      r.reasonLabel,
      r.priority === "check" ? "Cek dulu" : "Jelas",
      r.unhidden ? "unhidden (tampil publik)" : "hidden",
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

function fmtTime(ms: number | null): string {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "short", timeStyle: "short" }) + " WIB";
  } catch {
    return "";
  }
}

/** Owner-only: hidden videos (minor/school-flagged) with a reversible Unhide override. */
export function HiddenListSection({ secret }: { secret: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");
  const [prio, setPrio] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const call = useCallback(
    async (body: Record<string, unknown>) => {
      const r = await fetch("/api/owner-tools", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify(body),
      });
      return r.json();
    },
    [secret],
  );

  const load = useCallback(async () => {
    setErr(null);
    try {
      const d = await call({ action: "hidden-list" });
      if (d?.ok) setRows(d.items || []);
      else setErr(d?.error || "gagal");
    } catch {
      setErr("gagal");
    }
  }, [call]);

  useEffect(() => {
    // Load right after login (not only when expanded) so the count badge is always visible.
    if (secret && !rows) void load();
  }, [secret, rows, load]);

  async function toggle(row: Row, unhide: boolean) {
    if (unhide && !window.confirm(`Tampilkan lagi di situs publik?\n\n${row.title}\n\nBisa dibatalkan dengan "Sembunyikan lagi".`)) return;
    setBusy(row.id);
    setErr(null);
    try {
      const d = await call({ action: "unhide", id: row.id, unhide });
      if (!d?.ok) {
        setErr(d?.error || "gagal");
        return;
      }
      setRows((prev) =>
        (prev || []).map((r) => (r.id === row.id ? { ...r, unhidden: unhide, unhiddenAt: unhide ? Date.now() : null } : r)),
      );
    } catch {
      setErr("gagal");
    } finally {
      setBusy(null);
    }
  }

  const opts = useMemo(() => {
    const s = new Map<string, number>();
    const r = new Map<string, string>();
    for (const x of rows || []) {
      s.set(x.source, (s.get(x.source) || 0) + 1);
      r.set(x.reason, x.reasonLabel);
    }
    return { sources: [...s.entries()].sort((a, b) => b[1] - a[1]), reasons: [...r.entries()].sort() };
  }, [rows]);

  const shown = useMemo(() => {
    const key = q.trim().toLowerCase();
    return (rows || []).filter(
      (r) =>
        (!source || r.source === source) &&
        (!reason || r.reason === reason) &&
        (!status || (status === "unhidden" ? r.unhidden : !r.unhidden)) &&
        (!prio || (prio === "check" ? r.priority === "check" : r.priority !== "check")) &&
        (!key ||
          r.title.toLowerCase().includes(key) ||
          r.id.toLowerCase().includes(key) ||
          (r.javCode || "").toLowerCase().includes(key)),
    );
  }, [rows, q, source, reason, status, prio]);

  const summary = useMemo(() => {
    const all = rows || [];
    const un = all.filter((r) => r.unhidden).length;
    const check = all.filter((r) => !r.unhidden && r.priority === "check").length;
    return { total: all.length, hidden: all.length - un, unhidden: un, check };
  }, [rows]);

  function downloadCsv() {
    const blob = new Blob(["\ufeff" + toCsv(shown)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hidden-list.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const sel = "rounded-md border border-white/[0.08] bg-[#0f0f11] px-2 py-1 text-xs text-zinc-200";
  const btn = "rounded-md border border-white/[0.12] px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/[0.06] disabled:opacity-50";

  return (
    <section id="video-disembunyikan" className="rounded-2xl border border-amber-400/30 bg-[#17140f] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-zinc-50">
          <span className="rounded-full border border-amber-400/40 bg-amber-400/15 px-2.5 py-0.5 text-sm tabular-nums text-amber-200">
            Video disembunyikan: {rows ? summary.hidden : err ? "!" : "…"}
          </span>
          {rows ? (
            <button
              type="button"
              onClick={() => {
                setPrio("check");
                setStatus("hidden");
                setOpen(true);
                setLimit(PAGE);
              }}
              className="rounded-full border border-sky-400/40 bg-sky-400/10 px-2.5 py-0.5 text-sm tabular-nums text-sky-200 hover:bg-sky-400/20"
              title="Kemungkinan salah tandai: cuma sensor ***, 'sma' tanpa petunjuk sekolah lain, atau frasa 'kecil'"
            >
              Cek dulu: {summary.check}
            </button>
          ) : null}
          {rows && summary.unhidden ? (
            <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-0.5 text-sm tabular-nums text-emerald-200">
              Di-unhide: {summary.unhidden}
            </span>
          ) : null}
          <span className="text-[10px] font-normal uppercase tracking-[0.16em] text-zinc-500">khusus pemilik</span>
        </h2>
        <button type="button" className={btn} onClick={() => setOpen((v) => !v)}>
          {open ? "Ciutkan daftar" : "Buka daftar"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        Judul menyiratkan sekolah/di bawah umur → tidak tampil di listing, kategori, cari, Tonton juga, sitemap; /watch 404 + noindex.
        "Cek dulu" = kemungkinan salah tandai (diurutkan paling atas); "Jelas" = kata sekolah/minor eksplisit. Data tidak dihapus. "Unhide" menampilkan lagi (tersimpan di server, bisa dibatalkan dengan "Sembunyikan lagi"; berlaku ±1 menit).
      </p>
      {err ? (
        <p className="mt-3 text-xs text-red-400">
          Error: {err}{" "}
          <button type="button" className="underline" onClick={() => void load()}>
            coba lagi
          </button>
        </p>
      ) : null}
      {open ? (
        <>
          {!rows && !err ? <p className="mt-3 text-xs text-zinc-500">Memuat…</p> : null}
          {rows ? (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  ["Total ditandai", summary.total],
                  ["Tersembunyi", summary.hidden],
                  ["Di-unhide", summary.unhidden],
                ].map(([label, n]) => (
                  <div key={String(label)} className="rounded-xl border border-white/[0.06] bg-[#0f0f11] p-3">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
                    <div className="mt-1 text-lg tabular-nums text-zinc-100">{n}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setLimit(PAGE);
                  }}
                  placeholder="Cari judul / id / kode JAV"
                  className={`${sel} min-w-[180px] flex-1`}
                />
                <select className={sel} value={source} onChange={(e) => setSource(e.target.value)}>
                  <option value="">Semua sumber</option>
                  {opts.sources.map(([s, n]) => (
                    <option key={s} value={s}>
                      {s} ({n})
                    </option>
                  ))}
                </select>
                <select className={sel} value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">Semua alasan</option>
                  {opts.reasons.map(([r, label]) => (
                    <option key={r} value={r}>
                      {label}
                    </option>
                  ))}
                </select>
                <select className={sel} value={prio} onChange={(e) => setPrio(e.target.value)}>
                  <option value="">Semua prioritas</option>
                  <option value="check">Cek dulu (kemungkinan salah tandai)</option>
                  <option value="clear">Jelas</option>
                </select>
                <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">Semua status</option>
                  <option value="hidden">Tersembunyi</option>
                  <option value="unhidden">Di-unhide</option>
                </select>
                <button type="button" className={btn} onClick={downloadCsv}>
                  CSV ({shown.length})
                </button>
                <button type="button" className={btn} onClick={() => void load()}>
                  Muat ulang
                </button>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wide text-zinc-600">
                    <tr>
                      <th className="pb-2 font-medium">Judul</th>
                      <th className="pb-2 font-medium">Sumber</th>
                      <th className="pb-2 font-medium">Kode JAV</th>
                      <th className="pb-2 font-medium">Alasan</th>
                      <th className="pb-2 text-right font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.slice(0, limit).map((r) => (
                      <tr key={r.id} className="border-t border-white/[0.06] align-top">
                        <td className="py-2 pr-3 text-zinc-200">
                          <div className="break-words">{r.title}</div>
                          <div className="mt-0.5 text-[10px] text-zinc-600">
                            {r.id}
                            {r.unhidden ? (
                              <>
                                {" · "}
                                <a href={r.watchUrl} target="_blank" rel="noreferrer noopener" className="text-emerald-400 hover:underline">
                                  tampil publik {fmtTime(r.unhiddenAt)}
                                </a>
                              </>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap text-zinc-400">
                          <div>{r.source}</div>
                          {r.sourceUrl ? (
                            <a href={r.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-sky-400 hover:underline">
                              buka sumber
                            </a>
                          ) : null}
                          {r.embedUrl && r.embedUrl !== r.sourceUrl ? (
                            <>
                              {" · "}
                              <a href={r.embedUrl} target="_blank" rel="noreferrer noopener" className="text-sky-400/70 hover:underline">
                                embed
                              </a>
                            </>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-zinc-300">{r.javCode || "—"}</td>
                        <td className="py-2 pr-3 text-zinc-400">
                          <span
                            className={
                              r.priority === "check"
                                ? "mr-1.5 inline-block rounded-full border border-sky-400/40 bg-sky-400/10 px-1.5 py-px text-[10px] text-sky-200"
                                : "mr-1.5 inline-block rounded-full border border-red-400/30 bg-red-400/10 px-1.5 py-px text-[10px] text-red-200"
                            }
                          >
                            {r.priority === "check" ? "Cek dulu" : "Jelas"}
                          </span>
                          {r.reasonLabel}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {r.unhidden ? (
                            <button type="button" className={btn} disabled={busy === r.id} onClick={() => void toggle(r, false)}>
                              {busy === r.id ? "…" : "Sembunyikan lagi"}
                            </button>
                          ) : (
                            <button type="button" className={`${btn} border-amber-400/40 text-amber-200`} disabled={busy === r.id} onClick={() => void toggle(r, true)}>
                              {busy === r.id ? "…" : "Unhide"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {shown.length > limit ? (
                <div className="mt-3 text-center">
                  <button type="button" className={btn} onClick={() => setLimit((n) => n + PAGE)}>
                    Tampilkan {Math.min(PAGE, shown.length - limit)} lagi ({shown.length - limit} tersisa)
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
