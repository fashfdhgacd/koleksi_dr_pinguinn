"use client";

import { useEffect, useState } from "react";

const REASONS = [
  { key: "minor", label: "Dugaan konten di bawah umur", hint: "Anak sekolah / di bawah 18 tahun" },
  { key: "illegal", label: "Konten ilegal", hint: "Eksploitasi, kekerasan, atau konten terlarang lain" },
  { key: "other", label: "Lainnya", hint: "Pelaporan lain (hak cipta, duplikat, dll)" },
] as const;

type State = "form" | "busy" | "done" | "error";

/**
 * "Laporkan" sheet on watch pages: sends a prohibited-content report to
 * /api/reports (D1, pending moderation). The reporter never sees the outcome —
 * a report alone never hides a video; only the owner decides after review.
 */
export function ReportSheet({
  open,
  videoId,
  title,
  onClose,
}: {
  open: boolean;
  videoId: string;
  title: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string>("");
  const [detail, setDetail] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<State>("form");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("");
    setDetail("");
    setContact("");
    setState("form");
    setErr("");
  }, [open, videoId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function submit() {
    if (!reason || state === "busy") return;
    setState("busy");
    setErr("");
    try {
      const r = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: videoId, reason, detail, contact }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (j?.ok) {
        setState("done");
        return;
      }
      setErr(
        j?.error === "limit"
          ? "Batas laporan harian tercapai. Coba lagi besok."
          : j?.error === "captcha"
            ? "Verifikasi gagal. Muat ulang halaman lalu coba lagi."
            : "Gagal mengirim laporan. Coba lagi.",
      );
      setState("error");
    } catch {
      setErr("Gagal mengirim laporan. Periksa koneksi lalu coba lagi.");
      setState("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Laporkan video"
    >
      <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Tutup" />
      <div className="relative z-10 max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-background p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Laporkan konten</p>
            <p className="mt-1 line-clamp-2 text-base font-medium text-foreground">{title}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-md px-2 py-1 text-sm text-muted hover:bg-secondary">
            Tutup
          </button>
        </div>

        {state === "done" ? (
          <div className="space-y-3 py-4 text-center">
            <p className="text-base font-medium text-foreground">Laporan diterima.</p>
            <p className="text-sm leading-relaxed text-muted">
              Tim kami akan meninjau video ini. Laporan tidak langsung menyembunyikan video —
              tindakan hanya diambil setelah terbukti.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground active:scale-[0.98]"
            >
              Mengerti
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-foreground">Apa masalahnya?</legend>
              {REASONS.map((r) => (
                <label
                  key={r.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                    reason === r.key ? "border-primary bg-primary/10" : "border-border hover:border-white/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={r.key}
                    checked={reason === r.key}
                    onChange={() => setReason(r.key)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">{r.label}</span>
                    <span className="block text-xs text-muted">{r.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Detail (opsional)</span>
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value.slice(0, 1000))}
                rows={3}
                placeholder="Jelaskan singkat — mis. timestamp bagian yang bermasalah"
                className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-foreground">Kontak (opsional)</span>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value.slice(0, 120))}
                placeholder="Email/telegram kalau hasilnya mau dikabari"
                className="w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>

            {state === "error" && err ? <p className="text-sm text-red-400">{err}</p> : null}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="h-11 flex-1 rounded-xl border border-border px-4 text-sm font-medium text-foreground active:scale-[0.98]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!reason || state === "busy"}
                onClick={() => void submit()}
                className="h-11 flex-1 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground active:scale-[0.98] disabled:opacity-40"
              >
                {state === "busy" ? "Mengirim…" : "Kirim laporan"}
              </button>
            </div>
            <p className="text-center text-[11px] leading-relaxed text-muted">
              Laporan palsu atau iseng dapat ditindaklanjuti. Laporkan hanya jika yakin.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
