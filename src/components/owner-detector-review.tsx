"use client";

import { useCallback, useEffect, useState } from "react";
import { OwnerEditSheet, verdictText, type EditVerdict } from "@/components/owner-edit-sheet";

type Row = {
  id: string;
  title: string;
  translation: string | null;
  assessment: string;
  reason: string;
  signals: string[];
  held: boolean;
  status: string;
  thumbUrl: string;
  watchUrl: string;
  decidedAt: number | null;
};

async function post<T>(secret: string, body: Record<string, unknown>): Promise<T & { ok?: boolean; error?: string }> {
  try {
    const res = await fetch("/api/owner-tools", {
      method: "POST",
      headers: { "content-type": "application/json", "x-online-key": secret },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return ((await res.json().catch(() => null)) || { ok: false, error: `HTTP ${res.status}` }) as never;
  } catch {
    return { ok: false, error: "Koneksi bermasalah." } as never;
  }
}

/** Kotak "Perlu dicek": judul verdict "review" dari detector minor, satu tap Tayangkan/Sembunyiin. */
const btn =
  "rounded-lg px-3 py-1.5 text-[13px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2dd4bf] disabled:opacity-50";

export function DetectorReviewSection({ secret, onCount }: { secret: string; onCount?: (n: number) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, EditVerdict>>({});

  const load = useCallback(async () => {
    setErr("");
    const d = await post<{ items?: Row[] }>(secret, { action: "detector-review-list" });
    if (d.ok && d.items) setRows(d.items);
    else setErr(d.error || "Gagal memuat.");
  }, [secret]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (id: string, decision: "show" | "hide") => {
    setBusy(id);
    const d = await post<{ held?: boolean }>(secret, { action: "detector-review-decide", id, decision });
    setBusy("");
    if (!d.ok) {
      setErr(d.error === "locked_minor" ? "Judul ini terkunci (minor), tidak bisa ditayangkan." : d.error || "Gagal.");
      return;
    }
    setRows((rs) =>
      (rs || []).map((r) =>
        r.id === id
          ? { ...r, decidedAt: Date.now(), held: decision === "hide", status: decision === "hide" ? "Disembunyiin pemilik" : "Tayang (diputuskan pemilik)" }
          : r,
      ),
    );
  };

  const pendingCount = rows ? rows.filter((r) => !r.decidedAt).length : null;
  useEffect(() => {
    if (pendingCount != null) onCount?.(pendingCount);
  }, [pendingCount, onCount]);

  if (err && !rows)
    return (
      <div role="alert" className="flex flex-col items-start gap-2 py-2">
        <p className="text-sm text-red-300">Gagal memuat daftar: {err}</p>
        <button type="button" onClick={() => void load()} className={`${btn} border border-white/[0.1] text-zinc-200`}>
          Coba lagi
        </button>
      </div>
    );
  if (!rows)
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Memuat">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-white/[0.04]" />
        ))}
      </div>
    );
  const pending = rows.filter((r) => !r.decidedAt);
  const list = showDone ? rows : pending;
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[12px] leading-relaxed text-zinc-400">
        {pending.length} perlu dicek · {rows.length - pending.length} sudah diputuskan. Upload baru yang ditahan belum tayang sampai kamu tap
        Tayangkan; katalog lama tetap tayang sampai kamu putuskan. Judul "minor" langsung terkunci dan tidak muncul di sini.
      </p>
      {err ? <p role="alert" className="text-[13px] text-red-300">{err}</p> : null}
      <label className="flex items-center gap-2 text-[12px] text-zinc-400">
        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Tampilkan yang sudah diputuskan
      </label>
      {list.map((r) => (
        <div key={r.id} className="flex flex-col gap-3 rounded-lg border border-amber-400/15 bg-[#0c0e0f] p-3 sm:flex-row">
          <img src={r.thumbUrl} alt="" loading="lazy" className="aspect-video w-full shrink-0 rounded-lg bg-black object-cover sm:h-20 sm:w-32" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="break-words font-medium leading-snug text-zinc-100">{r.title}</p>
            {r.translation ? <p className="text-[13px] text-zinc-400">🇮🇩 {r.translation}</p> : null}
            <p className="mt-1 text-[13px] text-amber-300">Penilaian: {r.assessment}</p>
            <p className="text-[13px] text-zinc-300">{r.reason}</p>
            {r.signals.length ? <p className="text-[12px] text-zinc-500">Sinyal: {r.signals.join(" · ")}</p> : null}
            <p className="text-[12px] text-zinc-500">
              {r.status} ·{" "}
              <a href={r.watchUrl} target="_blank" rel="noreferrer noopener" className="text-[#2dd4bf] underline">
                {r.held ? "Pratinjau (khusus pemilik)" : "Tonton"}
              </a>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" disabled={busy === r.id} onClick={() => decide(r.id, "show")} className={`${btn} bg-[#2dd4bf] font-medium text-zinc-950`}>
                Tayangkan
              </button>
              <button type="button" disabled={busy === r.id} onClick={() => decide(r.id, "hide")} className={`${btn} border border-white/[0.1] bg-white/[0.04] text-zinc-200`}>
                Sembunyiin
              </button>
              <button type="button" onClick={() => setEditing(r)} className={`${btn} border border-[#2dd4bf]/40 text-[#5eead4]`}>
                Edit
              </button>
            </div>
            {verdicts[r.id] ? (
              <p className="mt-2 rounded-lg bg-black/30 px-2.5 py-1.5 text-[12px] text-zinc-200">
                Setelah edit: <span className="font-medium text-amber-200">{verdictText(verdicts[r.id])}</span>
              </p>
            ) : null}
          </div>
        </div>
      ))}
      {!list.length ? (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-white/[0.08] px-4 py-8 text-center">
          <span className="text-lg text-[#2dd4bf]" aria-hidden="true">✓</span>
          <p className="text-sm font-medium text-zinc-200">Semua beres</p>
          <p className="text-[12px] text-zinc-500">{rows.length ? "Tidak ada judul yang menunggu keputusan." : "Belum ada judul yang ditandai."}</p>
        </div>
      ) : null}
      {editing ? (
        <OwnerEditSheet
          secret={secret}
          id={editing.id}
          title={editing.title}
          onClose={() => setEditing(null)}
          onSaved={({ title, verdict }) => {
            setRows((rs) => (rs || []).map((x) => (x.id === editing.id ? { ...x, title } : x)));
            if (verdict) setVerdicts((v) => ({ ...v, [editing.id]: verdict }));
          }}
        />
      ) : null}
    </div>
  );
}
