"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  id: number;
  video_id: string;
  url: string;
  note: string;
  status: string;
  created_at: number;
};

function wib(ms: number): string {
  if (!ms) return "";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

/** /pemilik: usulan link video Videy dari videyy.icu — tinjau sebelum tayang. */
export function OwnerVideySuggest({ secret }: { secret: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/videy-suggest", { headers: { "x-online-key": secret }, cache: "no-store" });
      const d = (await res.json().catch(() => null)) as { ok?: boolean; items?: Row[] } | null;
      if (res.ok && d?.ok) {
        setRows(d.items || []);
        setError(null);
      } else {
        setError("Gagal memuat usulan.");
      }
    } catch {
      setError("Gagal memuat usulan.");
    }
  }, [secret]);

  useEffect(() => {
    if (!secret) return;
    void load();
  }, [secret, load]);

  const decide = async (row: Row, decision: "approved" | "rejected") => {
    setBusy(row.id);
    try {
      const res = await fetch("/api/videy-suggest", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action: "decide", id: row.id, decision }),
      });
      const d = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (res.ok && d?.ok) await load();
      else setError("Gagal menyimpan keputusan.");
    } catch {
      setError("Gagal menyimpan keputusan.");
    } finally {
      setBusy(null);
    }
  };

  const pending = (rows || []).filter((r) => r.status === "pending");

  return (
    <div className="flex flex-col gap-2 text-[13px]">
      {error ? <p className="text-red-400">{error}</p> : null}
      {rows === null ? (
        <p className="text-zinc-500">Memuat…</p>
      ) : pending.length === 0 ? (
        <p className="text-zinc-500">Belum ada usulan video.</p>
      ) : (
        pending.map((r) => (
          <div key={r.id} className="flex flex-col gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="truncate font-medium text-sky-300 hover:underline">
                {r.video_id}
              </a>
              <span className="shrink-0 text-[11px] text-zinc-500">{wib(r.created_at)}</span>
            </div>
            {r.note ? <p className="text-zinc-400">{r.note}</p> : null}
            <div className="flex gap-2">
              <a
                href={`https://videy.co/v/?id=${r.video_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-zinc-700 px-2.5 py-1 text-[12px] hover:border-zinc-500"
              >
                Preview
              </a>
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => void decide(r, "approved")}
                className="rounded-md bg-emerald-700/80 px-2.5 py-1 text-[12px] font-semibold hover:bg-emerald-600 disabled:opacity-50"
              >
                Setujui
              </button>
              <button
                type="button"
                disabled={busy === r.id}
                onClick={() => void decide(r, "rejected")}
                className="rounded-md bg-red-800/70 px-2.5 py-1 text-[12px] font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                Tolak
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
