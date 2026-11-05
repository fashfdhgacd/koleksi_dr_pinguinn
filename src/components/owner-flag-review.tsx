"use client";

import { useCallback, useEffect, useState } from "react";

type Row = { id: string; title: string; reason: string };

const PAGE = 30;
const REASON_LABEL: Record<string, string> = {
  minor: "Minor",
  school: "Sekolah",
  "anime-school": "Anime sekolah",
  "school-uniform": "Seragam",
  "school-obfuscated": "Sekolah",
  "teacher-student": "Guru & murid",
  classroom: "Kelas",
  "incest-child": "Minor",
  "minor-detector": "Detektor minor",
};

async function post<T>(secret: string, body: Record<string, unknown>): Promise<T & { ok?: boolean; error?: string; message?: string }> {
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

/**
 * Review queue for minor-flag and school auto-block hits. Nothing is removed until the owner
 * rejects. Approve keeps the video public. Reject uses Keluarkan dari katalog.
 */
export function FlagReviewSection({ secret, onCount }: { secret: string; onCount?: (n: number) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [note, setNote] = useState("Memuat…");
  const [busy, setBusy] = useState("");
  const [confirmId, setConfirmId] = useState("");

  const load = useCallback(
    async (offset: number) => {
      const d = await post<{ items?: Row[]; total?: number }>(secret, { action: "flag-review-list", limit: PAGE, offset });
      if (!d.ok) {
        setNote(d.message || d.error || "Gagal memuat.");
        return;
      }
      const next = d.items || [];
      setRows((cur) => (offset ? [...cur, ...next.filter((r) => !cur.some((c) => c.id === r.id))] : next));
      const n = Number(d.total) || 0;
      setTotal(n);
      onCount?.(n);
      setNote("");
    },
    [onCount, secret],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  async function approve(row: Row) {
    setBusy(row.id);
    const d = await post(secret, { action: "flag-review-decide", id: row.id, decision: "approve" });
    setBusy("");
    if (!d.ok) {
      setNote(d.message || d.error || "Gagal.");
      return;
    }
    setRows((cur) => cur.filter((r) => r.id !== row.id));
    setTotal((n) => Math.max(0, n - 1));
    onCount?.(Math.max(0, total - 1));
  }

  async function reject(row: Row) {
    setBusy(row.id);
    const d = await post(secret, { action: "flag-review-decide", id: row.id, decision: "reject", title: row.title });
    setBusy("");
    setConfirmId("");
    if (!d.ok) {
      setNote(d.message || d.error || "Gagal mengeluarkan.");
      return;
    }
    setRows((cur) => cur.filter((r) => r.id !== row.id));
    setTotal((n) => Math.max(0, n - 1));
    onCount?.(Math.max(0, total - 1));
  }

  return (
    <section className="rounded-2xl border border-white/[0.06] bg-[#101214] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-50">Antrian review</h2>
        <span className="text-[12px] text-zinc-500">{total ? `${total} menunggu` : "minor / sekolah"}</span>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
        Tanda minor atau sekolah tidak langsung dihapus. Biarkan tayang menampilkannya. Keluarkan dari katalog baru menghapusnya.
      </p>
      {note ? <p className="mt-3 text-sm text-zinc-400">{note}</p> : null}
      {rows.length ? (
        <ul className="mt-3">
          {rows.map((r) => (
            <li key={r.id} className="border-t border-white/[0.06] py-3">
              <div className="flex items-start gap-3">
                <img src={`/thumb/${r.id}`} alt="" loading="lazy" decoding="async" className="h-14 w-24 shrink-0 rounded-lg bg-zinc-900 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[15px] font-medium leading-snug text-zinc-50">{r.title || r.id}</p>
                  <p className="mt-1 truncate font-mono text-[12px] text-zinc-500">{r.id}</p>
                  <span className="mt-1.5 inline-flex rounded-full bg-[#2dd4bf]/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#5eead4] ring-1 ring-[#2dd4bf]/30">
                    {REASON_LABEL[r.reason] || r.reason}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={busy === r.id}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-[#2dd4bf] bg-[#2dd4bf] px-3 text-[13px] font-semibold text-zinc-950 disabled:opacity-50"
                  onClick={() => void approve(r)}
                >
                  Biarkan tayang
                </button>
                {confirmId === r.id ? (
                  <button
                    type="button"
                    disabled={busy === r.id}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-red-600 px-3 text-[13px] font-semibold text-white disabled:opacity-50"
                    onClick={() => void reject(r)}
                  >
                    {busy === r.id ? "Mengeluarkan…" : "Ya, keluarkan"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-red-400/40 px-3 text-[13px] font-semibold text-red-200"
                    onClick={() => setConfirmId(r.id)}
                  >
                    Keluarkan dari katalog
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : !note ? (
        <p className="mt-3 text-sm text-zinc-400">Tidak ada yang menunggu.</p>
      ) : null}
      {rows.length < total ? (
        <button type="button" className="mt-3 min-h-11 w-full rounded-lg border border-white/10 px-3 text-[13px] text-zinc-200" onClick={() => void load(rows.length)}>
          Muat lagi ({rows.length} dari {total})
        </button>
      ) : null}
    </section>
  );
}
