"use client";

import { useCallback, useEffect, useState } from "react";

type AdminReport = {
  id: number;
  video_id: string;
  video_title: string;
  reason: string;
  detail: string;
  contact: string;
  reporter: string;
  status: string;
  created_at: number;
  reviewed_at: number | null;
  strikes: number;
};

const FILTERS = [
  { key: "pending", label: "Menunggu" },
  { key: "actioned", label: "Ditindaklanjuti" },
  { key: "rejected", label: "Ditolak" },
  { key: "all", label: "Semua" },
] as const;

const REASON_LABEL: Record<string, string> = {
  minor: "Dugaan di bawah umur",
  illegal: "Konten ilegal",
  other: "Lainnya",
};

function fmtDate(ts: number | null): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Content-report moderation for /pemilik: review → hide video / reject / reopen. */
export function OwnerReports({ secret }: { secret: string }) {
  const [status, setStatus] = useState<string>("pending");
  const [items, setItems] = useState<AdminReport[] | null>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await fetch(`/api/reports-admin?status=${status}&limit=100`, {
        headers: { "x-online-key": secret },
        cache: "no-store",
      });
      const j = (await r.json()) as { ok?: boolean; reports?: AdminReport[]; pending?: number; error?: string };
      if (j.ok) setItems(j.reports || []);
      else setError(j.error === "unauthorized" ? "Kunci owner salah" : "Gagal memuat laporan");
    } catch {
      setError("Gagal memuat laporan");
    }
  }, [secret, status]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  async function act(action: string, id: number) {
    if (busy) return;
    setBusy(id);
    setError("");
    try {
      const r = await fetch("/api/reports-admin", {
        method: "POST",
        headers: { "content-type": "application/json", "x-online-key": secret },
        body: JSON.stringify({ action, id }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (j.ok) {
        await load();
        window.dispatchEvent(new Event("drp-reports-changed"));
      } else setError(action === "hide" ? "Gagal menyembunyikan video" : "Aksi gagal");
    } catch {
      setError("Aksi gagal");
    } finally {
      setBusy(0);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatus(f.key)}
            className={`rounded-full border px-3 py-1 text-xs ${
              status === f.key
                ? "border-zinc-200 bg-zinc-200 text-zinc-900"
                : "border-white/15 text-zinc-300 hover:border-white/40"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      {items === null ? (
        <p className="text-xs text-zinc-500">Memuat…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-zinc-500">Tidak ada laporan.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li key={r.id} className="rounded-lg border border-white/[0.08] bg-black/30 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium text-zinc-100">
                  <span className="text-[#5eead4]">{REASON_LABEL[r.reason] || r.reason}</span>
                  <span className="ml-2 font-normal text-zinc-500">{fmtDate(r.created_at)}</span>
                </p>
                {r.strikes > 0 ? (
                  <p className="text-[11px] font-medium text-amber-300">pelapor sering ditolak ({r.strikes}x)</p>
                ) : null}
              </div>
              <p className="mt-1 truncate text-[13px] text-zinc-200" title={r.video_title}>
                <a href={`/watch/${r.video_id}`} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white">
                  {r.video_title || r.video_id}
                </a>
              </p>
              {r.detail ? <p className="mt-1 whitespace-pre-wrap text-[13px] text-zinc-300">{r.detail}</p> : null}
              {r.contact ? <p className="mt-1 text-[11px] text-zinc-500">Kontak: {r.contact}</p> : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.status === "pending" ? (
                  <>
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => void act("hide", r.id)}
                      className="rounded-md border border-red-400/40 px-2.5 py-1 text-xs text-red-300 hover:bg-red-400/10 disabled:opacity-40"
                    >
                      Sembunyikan video + tindaklanjuti
                    </button>
                    <button
                      type="button"
                      disabled={busy === r.id}
                      onClick={() => void act("reject", r.id)}
                      className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40"
                    >
                      Tolak laporan
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => void act("reopen", r.id)}
                    className="rounded-md border border-white/15 px-2.5 py-1 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40"
                  >
                    Buka lagi
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
